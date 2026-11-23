<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\AiClient;
use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Db;
use NQ\Core\Http;
use NQ\Core\Integrations;
use NQ\Core\Mailer;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Settings;
use NQ\Core\V;

final class AdminController
{
    /** Record an admin action. */
    private static function audit(Request $r, string $action, string $target = '', array $details = []): void
    {
        Db::exec(
            'INSERT INTO admin_log (admin_id, admin_email, action, target, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                (int) $r->user['id'], (string) $r->user['email'], $action, mb_substr($target, 0, 255),
                $details === [] ? null : json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $r->ip, Db::now(),
            ]
        );
    }

    private static function targetUser(Request $r): array
    {
        $u = Auth::findUser($r->intParam('id'));
        if ($u === null) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        return $u;
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    public static function stats(Request $r): array
    {
        Auth::requireAdmin($r);
        $today = gmdate('Y-m-d');
        $since14 = gmdate('Y-m-d', time() - 13 * 86400);
        $byDay = [];
        foreach (Db::all('SELECT DATE(created_at) AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY DATE(created_at)', [$since14 . ' 00:00:00']) as $row) {
            $byDay[(string) $row['d']] = (int) $row['n'];
        }
        $signups = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = gmdate('Y-m-d', time() - $i * 86400);
            $signups[] = ['date' => $d, 'count' => $byDay[$d] ?? 0];
        }
        $online = Db::one(
            'SELECT COUNT(*) AS total, COALESCE(SUM(user_id IS NOT NULL), 0) AS signed_in FROM presence WHERE last_seen >= ?',
            [Db::now(-120)]
        ) ?? ['total' => 0, 'signed_in' => 0];
        return [
            'users_total' => (int) Db::value('SELECT COUNT(*) FROM users'),
            'users_today' => (int) Db::value('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$today . ' 00:00:00']),
            'users_7d' => (int) Db::value('SELECT COUNT(*) FROM users WHERE created_at >= ?', [Db::now(-7 * 86400)]),
            'signups_by_day' => $signups,
            'ayahs_total' => (int) Db::value('SELECT COUNT(*) FROM reading_log'),
            'tickets_open' => (int) Db::value("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'"),
            'online_now' => [
                'total' => (int) $online['total'],
                'signed_in' => (int) $online['signed_in'],
                'guests' => (int) $online['total'] - (int) $online['signed_in'],
            ],
            'active_7d' => (int) Db::value('SELECT COUNT(*) FROM users WHERE last_seen_at >= ?', [Db::now(-7 * 86400)]),
        ];
    }

    // ── Users ────────────────────────────────────────────────────────────────

    public static function users(Request $r): array
    {
        Auth::requireAdmin($r);
        [$page, $per, $off] = V::page($r);
        $where = ['1 = 1'];
        $params = [];
        $q = trim(mb_substr((string) $r->q('q', ''), 0, 100));
        if ($q !== '') {
            $like = '%' . Db::likeEscape($q) . '%';
            $where[] = '(u.email LIKE ? OR u.name LIKE ?)';
            array_push($params, $like, $like);
        }
        $now = Db::now();
        $filter = $r->q('filter', 'all');
        if ($filter === 'admins') {
            $where[] = 'u.is_admin = 1';
        } elseif ($filter === 'banned') {
            $where[] = 'b.user_id IS NOT NULL';
        } elseif ($filter === 'active') {
            $where[] = 'u.last_seen_at >= ?';
            $params[] = Db::now(-7 * 86400);
        }
        $from = "FROM users u LEFT JOIN bans b ON b.user_id = u.id AND b.scope = 'app' AND (b.until IS NULL OR b.until > ?)";
        $w = ' WHERE ' . implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) {$from}{$w}", array_merge([$now], $params));
        $rows = Db::all(
            'SELECT ' . Auth::userCols() . ", b.user_id AS ban_uid, b.reason AS ban_reason, b.until AS ban_until,
                (SELECT COUNT(*) FROM reading_log l WHERE l.user_id = u.id) AS ayahs_total
             {$from}{$w} ORDER BY u.id DESC LIMIT ? OFFSET ?",
            array_merge([$now], $params, [$per, $off])
        );
        $items = array_map(static function (array $u): array {
            return Auth::shape($u) + [
                'banned' => $u['ban_uid'] !== null,
                'ban_reason' => $u['ban_uid'] !== null ? (string) $u['ban_reason'] : null,
                'banned_until' => $u['ban_uid'] !== null ? Db::iso($u['ban_until']) : null,
                'last_seen' => Db::iso($u['last_seen_at']),
                'ayahs_total' => (int) $u['ayahs_total'],
            ];
        }, $rows);
        return V::paginated($items, $page, $per, $total);
    }

    public static function updateUser(Request $r): array
    {
        $me = Auth::requireAdmin($r);
        $u = self::targetUser($r);
        $b = $r->body();
        $changes = [];
        if (array_key_exists('is_admin', $b)) {
            $isAdmin = (bool) V::bool($b, 'is_admin');
            if (!$isAdmin && (int) $u['id'] === $me) {
                throw ApiError::forbidden('لا يمكنك إزالة صلاحية المشرف عن نفسك.');
            }
            Db::exec('UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?', [$isAdmin, Db::now(), (int) $u['id']]);
            $changes['is_admin'] = $isAdmin;
        }
        if (array_key_exists('gender', $b)) {
            $g = $b['gender'] === null || $b['gender'] === '' ? null : V::enum($b, 'gender', ['male', 'female']);
            Db::exec('UPDATE users SET gender = ?, updated_at = ? WHERE id = ?', [$g, Db::now(), (int) $u['id']]);
            $changes['gender'] = $g;
        }
        if ($changes !== []) {
            self::audit($r, 'user.update', 'user:' . $u['id'] . ' ' . $u['email'], $changes);
        }
        return Auth::shape((array) Auth::findUser((int) $u['id']));
    }

    public static function ban(Request $r): \stdClass
    {
        $me = Auth::requireAdmin($r);
        $u = self::targetUser($r);
        if ((int) $u['id'] === $me) {
            throw ApiError::forbidden('لا يمكنك إيقاف حسابك.');
        }
        $b = $r->body();
        V::enum($b, 'scope', ['app'], false);
        $reason = V::str($b, 'reason', 500, false, 0) ?? '';
        $until = V::datetime($b, 'until', false);
        if ($until !== null) {
            $until = substr($until, 0, 19);
            if ($until <= Db::now()) {
                throw ApiError::validation(['until' => 'يجب أن يكون التاريخ في المستقبل.']);
            }
        }
        Db::exec(
            "INSERT INTO bans (user_id, scope, reason, until, created_by, created_at) VALUES (?, 'app', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE scope = 'app', reason = VALUES(reason), until = VALUES(until), created_by = VALUES(created_by), created_at = VALUES(created_at)",
            [(int) $u['id'], $reason, $until, $me, Db::now()]
        );
        Auth::revokeAll((int) $u['id']);
        self::audit($r, 'user.ban', 'user:' . $u['id'] . ' ' . $u['email'], ['reason' => $reason, 'until' => $until]);
        return Reply::empty();
    }

    public static function unban(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $u = self::targetUser($r);
        Db::exec('DELETE FROM bans WHERE user_id = ?', [(int) $u['id']]);
        self::audit($r, 'user.unban', 'user:' . $u['id'] . ' ' . $u['email']);
        return Reply::empty();
    }

    public static function messageUser(Request $r): Reply
    {
        $me = Auth::requireAdmin($r);
        $u = self::targetUser($r);
        $b = $r->body();
        $subject = (string) V::str($b, 'subject', 150);
        $body = (string) V::str($b, 'body', 5000, true, 1, true);
        $id = Db::tx(static function () use ($u, $me, $subject, $body): int {
            $id = Db::insert(
                "INSERT INTO support_tickets (user_id, subject, topic, status, created_at, updated_at) VALUES (?, ?, 'admin', 'pending', ?, ?)",
                [(int) $u['id'], $subject, Db::now(), Db::now()]
            );
            SupportController::addMessage($id, $me, true, $body);
            return $id;
        });
        self::audit($r, 'user.message', 'user:' . $u['id'] . ' ' . $u['email'], ['ticket_id' => $id, 'subject' => $subject]);
        SupportController::notifyUser($id, $body, true);
        return Reply::created(SupportController::ticketShape((array) Db::one(SupportController::ticketSql(false) . ' WHERE t.id = ?', [$id]), true));
    }

    // ── Broadcasts ───────────────────────────────────────────────────────────

    public static function broadcasts(Request $r): array
    {
        Auth::requireAdmin($r);
        return array_map([PublicController::class, 'broadcastShape'], Db::all('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 500'));
    }

    public static function createBroadcast(Request $r): Reply
    {
        $me = Auth::requireAdmin($r);
        $b = $r->body();
        $title = (string) V::str($b, 'title', 150);
        $body = (string) V::str($b, 'body', 2000, true, 1, true);
        $type = V::enum($b, 'type', ['info', 'warning', 'success'], false) ?? 'info';
        $exp = V::datetime($b, 'expires_at', false);
        $id = Db::insert(
            'INSERT INTO broadcasts (title, body, type, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$title, $body, $type, $me, Db::now(), $exp !== null ? substr($exp, 0, 19) : null]
        );
        self::audit($r, 'broadcast.create', 'broadcast:' . $id, ['title' => $title]);
        return Reply::created(PublicController::broadcastShape((array) Db::one('SELECT * FROM broadcasts WHERE id = ?', [$id])));
    }

    public static function deleteBroadcast(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $id = $r->intParam('id');
        if (Db::exec('DELETE FROM broadcasts WHERE id = ?', [$id]) === 0) {
            throw ApiError::notFound();
        }
        self::audit($r, 'broadcast.delete', 'broadcast:' . $id);
        return Reply::empty();
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    private static function settingsShape(): array
    {
        $s = Settings::all();
        return [
            'app_name' => $s['app_name'],
            'description' => $s['description'],
            'announcement' => $s['announcement'],
            'maintenance_mode' => $s['maintenance_mode'],
            'allow_signup' => $s['allow_signup'],
            'features' => $s['features'],
        ];
    }

    public static function settings(Request $r): array
    {
        Auth::requireAdmin($r);
        return self::settingsShape();
    }

    public static function saveSettings(Request $r): array
    {
        Auth::requireAdmin($r);
        $b = $r->body();
        $save = [];
        if (array_key_exists('app_name', $b)) {
            $save['app_name'] = V::str($b, 'app_name', 100);
        }
        if (array_key_exists('description', $b)) {
            $save['description'] = V::str($b, 'description', 500, false, 0, true) ?? '';
        }
        if (array_key_exists('announcement', $b)) {
            $save['announcement'] = V::str($b, 'announcement', 1000, false, 0, true) ?? '';
        }
        foreach (['maintenance_mode', 'allow_signup'] as $k) {
            if (array_key_exists($k, $b)) {
                $save[$k] = V::bool($b, $k);
            }
        }
        if (array_key_exists('features', $b)) {
            $f = $b['features'];
            if (!is_array($f) || ($f !== [] && array_is_list($f))) {
                throw ApiError::validation(['features' => 'يجب أن تكون كائناً.']);
            }
            $merged = Settings::all()['features'];
            foreach ($f as $k => $v) {
                if (!in_array($k, Settings::FEATURES, true)) {
                    throw ApiError::validation(["features.$k" => 'ميزة غير معروفة.']);
                }
                $merged[$k] = (bool) V::bool($f, (string) $k);
            }
            $save['features'] = $merged;
        }
        if ($save !== []) {
            Settings::save($save);
            self::audit($r, 'settings.update', 'settings', $save);
        }
        return self::settingsShape();
    }

    // ── Integrations ─────────────────────────────────────────────────────────

    public static function integrations(Request $r): array
    {
        Auth::requireAdmin($r);
        return ['items' => Integrations::listing()];
    }

    public static function saveIntegrations(Request $r): array
    {
        Auth::requireAdmin($r);
        $b = $r->body();
        $values = [];
        foreach ($b as $key => $value) {
            if (!array_key_exists((string) $key, Integrations::KEYS)) {
                throw ApiError::validation([(string) $key => 'مفتاح غير معروف.']);
            }
            if ($value === null) {
                $value = '';
            }
            if (!is_string($value)) {
                throw ApiError::validation([(string) $key => 'يجب أن تكون القيمة نصاً.']);
            }
            $value = trim($value);
            $multi = Integrations::MULTILINE[(string) $key] ?? 0;
            if ($multi > 0
                ? (strlen($value) > $multi || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value))
                : (strlen($value) > 1000 || preg_match('/[\x00-\x1F\x7F]/', $value))) {
                throw ApiError::validation([(string) $key => 'قيمة غير صالحة.']);
            }
            if ($value !== '') {
                self::validateCommunityIntegration((string) $key, $value);
            }
            if ($value !== '') {
                if ($key === 'ai_provider' && !in_array($value, ['openai', 'anthropic'], true)) {
                    throw ApiError::validation(['ai_provider' => 'القيم المسموحة: openai أو anthropic.']);
                }
                if ($key === 'mail_from_address' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    throw ApiError::validation(['mail_from_address' => 'البريد الإلكتروني غير صحيح.']);
                }
                if ($key === 'ai_model' && !preg_match('/^[A-Za-z0-9._:\/-]{1,100}$/', $value)) {
                    throw ApiError::validation(['ai_model' => 'اسم النموذج غير صالح.']);
                }
                if ($key === 'mail_from_name' && mb_strlen($value) > 100) {
                    throw ApiError::validation(['mail_from_name' => 'الاسم طويل جداً.']);
                }
                if ($key === 'mail_transport' && !in_array($value, ['server', 'smtp'], true)) {
                    throw ApiError::validation(['mail_transport' => 'القيم المسموحة: server أو smtp.']);
                }
                if ($key === 'smtp_host' && (strlen($value) > 253
                    || !preg_match('/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/', $value))) {
                    throw ApiError::validation(['smtp_host' => 'اسم الخادم غير صالح (مثال: mail.example.com).']);
                }
                if ($key === 'smtp_port' && (!preg_match('/^\d{1,5}$/', $value) || (int) $value < 1 || (int) $value > 65535)) {
                    throw ApiError::validation(['smtp_port' => 'رقم المنفذ يجب أن يكون بين 1 و 65535.']);
                }
                if ($key === 'smtp_encryption' && !in_array($value, ['tls', 'ssl', 'none'], true)) {
                    throw ApiError::validation(['smtp_encryption' => 'القيم المسموحة: tls أو ssl أو none.']);
                }
                if ($key === 'smtp_username' && strlen($value) > 254) {
                    throw ApiError::validation(['smtp_username' => 'اسم المستخدم طويل جداً.']);
                }
            }
            $values[(string) $key] = $value;
        }
        foreach ($values as $k => $v) {
            Integrations::set($k, $v);
        }
        if (array_intersect(array_keys($values), ['fcm_service_account', 'apns_key_p8', 'apns_key_id', 'apns_team_id']) !== []) {
            \NQ\Core\Push::clearCaches(); // cached FCM access token / APNs JWT belong to the old keys
        }
        if ($values !== []) {
            // log which keys changed, never their values
            self::audit($r, 'integrations.update', implode(',', array_keys($values)), array_map(
                static fn (string $v): string => $v === '' ? 'cleared' : 'set',
                $values
            ));
        }
        return ['items' => Integrations::listing()];
    }

    /** Validation of the LiveKit / FCM / APNs keys (throws 422). */
    private static function validateCommunityIntegration(string $key, string $value): void
    {
        $fail = static fn (string $msg) => throw ApiError::validation([$key => $msg]);
        switch ($key) {
            case 'livekit_url':
                if (!preg_match('#^wss://[a-z0-9.-]+(:\d{1,5})?/?$#i', $value) && !preg_match('#^ws://(127\.0\.0\.1|localhost)(:\d{1,5})?/?$#', $value)) {
                    $fail('يجب أن يبدأ العنوان بـ wss:// (مثال: wss://rtc.nuralquran.net:7443).');
                }
                break;
            case 'livekit_api_url':
                if (!preg_match('#^https://[a-z0-9.-]+(:\d{1,5})?(/[A-Za-z0-9._/-]*)?$#i', $value) && !preg_match('#^http://(127\.0\.0\.1|localhost)(:\d{1,5})?(/[A-Za-z0-9._/-]*)?$#', $value)) {
                    $fail('يجب أن يبدأ العنوان بـ https:// أو http://127.0.0.1 (على نفس الخادم).');
                }
                break;
            case 'livekit_api_key':
                if (!preg_match('/^[A-Za-z0-9_-]{3,64}$/', $value)) {
                    $fail('المفتاح يتكون من أحرف إنجليزية وأرقام فقط.');
                }
                break;
            case 'livekit_api_secret':
                if (strlen($value) < 32 || !preg_match('/^[\x21-\x7E]+$/', $value)) {
                    $fail('السر قصير جداً (32 حرفاً على الأقل).');
                }
                break;
            case 'fcm_service_account':
                $sa = json_decode($value, true);
                if (!is_array($sa) || ($sa['type'] ?? '') !== 'service_account' || empty($sa['client_email']) || empty($sa['project_id'])
                    || !is_string($sa['private_key'] ?? null) || openssl_pkey_get_private($sa['private_key']) === false) {
                    $fail('الصق محتوى ملف JSON الخاص بحساب الخدمة كما نزّلته من Firebase (Service account).');
                }
                break;
            case 'apns_key_p8':
                $pk = openssl_pkey_get_private($value);
                $det = $pk !== false ? openssl_pkey_get_details($pk) : false;
                if (!is_array($det) || ($det['type'] ?? -1) !== OPENSSL_KEYTYPE_EC) {
                    $fail('الصق محتوى ملف ‎.p8‎ كاملاً (يبدأ بـ -----BEGIN PRIVATE KEY-----).');
                }
                break;
            case 'apns_key_id':
            case 'apns_team_id':
                if (!preg_match('/^[A-Z0-9]{10}$/', $value)) {
                    $fail('يتكون من 10 أحرف إنجليزية كبيرة وأرقام.');
                }
                break;
            case 'apns_bundle_id':
                if (!preg_match('/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/', $value)) {
                    $fail('مثال: net.nuralquran.app');
                }
                break;
            case 'apns_environment':
                if (!in_array($value, ['production', 'sandbox'], true)) {
                    $fail('القيم المسموحة: production أو sandbox.');
                }
                break;
        }
    }

    public static function testIntegration(Request $r): array
    {
        Auth::requireAdmin($r);
        $target = V::enum($r->body(), 'target', ['ai', 'mail', 'google', 'livekit', 'fcm', 'apns']);
        self::audit($r, 'integrations.test', (string) $target);
        if (in_array($target, ['livekit', 'fcm', 'apns'], true)) {
            return AdminCommunityController::testIntegration((string) $target);
        }
        switch ($target) {
            case 'ai':
                $cfg = AiClient::config();
                if ($cfg === null) {
                    return ['ok' => false, 'message' => 'لم يتم إعداد مزوّد المساعد أو مفتاحه.'];
                }
                try {
                    AiClient::complete($cfg, 'أجب بكلمة واحدة.', [['role' => 'user', 'content' => 'قل: تم']], 64);
                    return ['ok' => true, 'message' => 'تم الاتصال بنجاح بمزوّد ' . $cfg['provider'] . ' (النموذج: ' . $cfg['model'] . ').'];
                } catch (ApiError $e) {
                    return ['ok' => false, 'message' => $e->getMessage()];
                }
            case 'mail':
                $to = (string) $r->user['email'];
                $smtp = Mailer::transport() === 'smtp';
                $ok = Mailer::sendTest($to, (string) $r->user['name'], AuthController::userLang((array) $r->user));
                if ($ok) {
                    $via = $smtp ? ' عبر SMTP (' . Integrations::get('smtp_host') . ')' : ' من خادم الموقع';
                    return ['ok' => true, 'message' => 'تم إرسال رسالة تجريبية' . $via . ' إلى ' . $to . '. تحقق من صندوق الوارد (والرسائل المزعجة).'];
                }
                $why = Mailer::lastError();
                return ['ok' => false, 'message' => 'فشل إرسال البريد' . ($smtp ? ' عبر SMTP' : '') . '. ' . ($why !== '' ? $why : 'تحقق من إعدادات البريد في الاستضافة.')];
            default:
                if (!Integrations::googleConfigured()) {
                    return ['ok' => false, 'message' => 'يجب إدخال Client ID و Client Secret الخاصين بـ Google.'];
                }
                $res = Http::postForm('https://oauth2.googleapis.com/token', [
                    'grant_type' => 'authorization_code',
                    'code' => 'nq-connectivity-test',
                    'client_id' => Integrations::get('google_client_id'),
                    'client_secret' => Integrations::get('google_client_secret'),
                    'redirect_uri' => GoogleController::redirectUri(),
                ], 15);
                if ($res['status'] === 0) {
                    return ['ok' => false, 'message' => 'تعذّر الوصول إلى خوادم Google من الخادم.'];
                }
                $err = is_array($res['json']) ? (string) ($res['json']['error'] ?? '') : '';
                if ($err === 'invalid_client' || $err === 'unauthorized_client') {
                    return ['ok' => false, 'message' => 'خوادم Google متاحة، لكن Client ID أو Client Secret غير صحيح.'];
                }
                return ['ok' => true, 'message' => 'المفاتيح محفوظة وخوادم Google متاحة. رابط العودة المطلوب في Google Console: ' . GoogleController::redirectUri()];
        }
    }

    // ── Tickets ──────────────────────────────────────────────────────────────

    private static function ticket(Request $r): array
    {
        $t = Db::one('SELECT * FROM support_tickets WHERE id = ?', [$r->intParam('id')]);
        if ($t === null) {
            throw ApiError::notFound('التذكرة غير موجودة.');
        }
        return $t;
    }

    public static function tickets(Request $r): array
    {
        Auth::requireAdmin($r);
        [$page, $per, $off] = V::page($r);
        $status = $r->q('status', '');
        $where = '';
        $params = [];
        if ($status !== '' && $status !== null) {
            if (!in_array($status, ['open', 'pending', 'closed'], true)) {
                throw ApiError::validation(['status' => 'قيمة غير مسموحة.']);
            }
            $where = ' WHERE t.status = ?';
            $params[] = $status;
        }
        $total = (int) Db::value('SELECT COUNT(*) FROM support_tickets t' . $where, $params);
        $rows = Db::all(SupportController::ticketSql(false) . $where . ' ORDER BY t.updated_at DESC, t.id DESC LIMIT ? OFFSET ?', array_merge($params, [$per, $off]));
        return V::paginated(array_map(static fn (array $t): array => SupportController::ticketShape($t, true), $rows), $page, $per, $total);
    }

    public static function ticketMessages(Request $r): array
    {
        Auth::requireAdmin($r);
        $t = self::ticket($r);
        return SupportController::listMessages($r, (int) $t['id'], true);
    }

    public static function postTicketMessage(Request $r): array
    {
        $me = Auth::requireAdmin($r);
        $t = self::ticket($r);
        $body = (string) V::str($r->body(), 'body', 5000, true, 1, true);
        $msg = SupportController::addMessage((int) $t['id'], $me, true, $body);
        $status = $t['status'] === 'closed' ? 'closed' : 'pending';
        Db::exec('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?', [$status, Db::now(), (int) $t['id']]);
        self::audit($r, 'ticket.reply', 'ticket:' . $t['id']);
        SupportController::notifyUser((int) $t['id'], $body, false);
        return $msg;
    }

    public static function updateTicket(Request $r): array
    {
        Auth::requireAdmin($r);
        $t = self::ticket($r);
        $status = (string) V::enum($r->body(), 'status', ['open', 'pending', 'closed']);
        Db::exec('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?', [$status, Db::now(), (int) $t['id']]);
        self::audit($r, 'ticket.status', 'ticket:' . $t['id'], ['status' => $status]);
        return SupportController::ticketShape((array) Db::one(SupportController::ticketSql(false) . ' WHERE t.id = ?', [(int) $t['id']]), true);
    }

    public static function unread(Request $r): array
    {
        Auth::requireAdmin($r);
        return ['count' => (int) Db::value('SELECT COUNT(*) FROM support_messages WHERE is_admin = 0 AND read_at IS NULL')];
    }

    public static function log(Request $r): array
    {
        Auth::requireAdmin($r);
        [$page, $per, $off] = V::page($r);
        $total = (int) Db::value('SELECT COUNT(*) FROM admin_log');
        $rows = Db::all('SELECT id, admin_email, action, target, created_at FROM admin_log ORDER BY id DESC LIMIT ? OFFSET ?', [$per, $off]);
        $items = array_map(static fn (array $l): array => [
            'id' => (int) $l['id'],
            'admin_email' => (string) $l['admin_email'],
            'action' => (string) $l['action'],
            'target' => (string) $l['target'],
            'created_at' => Db::iso($l['created_at']),
        ], $rows);
        return V::paginated($items, $page, $per, $total);
    }
}
