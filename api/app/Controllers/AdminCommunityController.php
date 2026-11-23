<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Avatar;
use NQ\Core\Community;
use NQ\Core\Config;
use NQ\Core\Db;
use NQ\Core\Groups;
use NQ\Core\Integrations;
use NQ\Core\Jwt;
use NQ\Core\LiveKit;
use NQ\Core\Moderation;
use NQ\Core\Push;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Rooms;
use NQ\Core\Settings;
use NQ\Core\V;

/**
 * Admin side of the community: reports queue and decisions, live rooms, dictionary-suspended accounts, the dictionary,
 * photo removal, gender/birthdate correction, room limits, and the LiveKit/FCM/APNs integration tests.
 * Any admin sees everything (women's rooms included). Every action is written to admin_log.
 */
final class AdminCommunityController
{
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

    private static function userBrief(?int $id): ?array
    {
        if ($id === null) {
            return null;
        }
        $u = Db::one('SELECT u.id, u.name, u.email, u.gender, u.birthdate, u.avatar_url' . (\NQ\Core\Migrations::ready() ? ', u.avatar_file' : '') . ' FROM users u WHERE u.id = ?', [$id]);
        return $u === null ? null : Community::brief($u) + ['email' => (string) $u['email'], 'gender' => $u['gender'], 'age' => Community::age($u['birthdate'])];
    }

    /** The reported thing as it is now (null when it is gone). @param array<string,mixed> $rep */
    private static function current(array $rep): ?array
    {
        $id = (int) $rep['target_id'];
        return match ((string) $rep['target_type']) {
            'room_message' => Db::one('SELECT id, room_id, user_id, body, created_at FROM room_messages WHERE id = ?', [$id]),
            'dm_message' => Db::one('SELECT id, conversation_id, sender_id, recipient_id, body, deleted_at, created_at FROM dm_messages WHERE id = ?', [$id]),
            'held' => Db::one('SELECT id, user_id, context, context_id, body, level, matched, created_at FROM held_content WHERE id = ?', [$id]),
            'room' => Db::one('SELECT id, title, gender_scope, visibility, status, owner_id, group_id FROM rooms WHERE id = ?', [$id]),
            'group', 'group_photo' => (static function () use ($id): ?array {
                $g = Db::one('SELECT id, name, description, privacy, gender_scope, photo_file, founder_id FROM cgroups WHERE id = ?', [$id]);
                return $g === null ? null : $g + ['photo_url' => Community::photoUrl($g['photo_file'])];
            })(),
            default => self::userBrief($id),
        };
    }

    /** @param array<string,mixed> $rep */
    private static function reportShape(array $rep, bool $withCurrent = true): array
    {
        $out = [
            'id' => (int) $rep['id'],
            'source' => (string) $rep['source'],
            'level' => $rep['level'],
            'target_type' => (string) $rep['target_type'],
            'target_id' => (int) $rep['target_id'],
            'target_user' => self::userBrief($rep['target_user_id'] !== null ? (int) $rep['target_user_id'] : null),
            'reporter' => self::userBrief($rep['reporter_id'] !== null ? (int) $rep['reporter_id'] : null),
            'reason' => (string) $rep['reason'],
            'reason_label' => CommunityController::REPORT_REASONS[$rep['reason']] ?? ($rep['reason'] === 'dictionary' ? 'القاموس' : (string) $rep['reason']),
            'details' => (string) $rep['details'],
            'snapshot' => json_decode((string) $rep['snapshot'], true),
            'status' => (string) $rep['status'],
            'decision' => $rep['decision'],
            'decision_note' => $rep['decision_note'],
            'decided_at' => Db::iso($rep['decided_at']),
            'created_at' => Db::iso($rep['created_at']),
        ];
        if ($withCurrent) {
            $out['current'] = self::current($rep);
        }
        return $out;
    }

    // ── Reports ──────────────────────────────────────────────────────────────

    /** GET /admin/community/reports?status=open|dismissed|actioned|all&source=user|dictionary&type= */
    public static function reports(Request $r): array
    {
        Auth::requireAdmin($r);
        [$page, $per, $off] = V::page($r);
        $where = ['1 = 1'];
        $params = [];
        $status = $r->q('status', 'open');
        if ($status !== 'all') {
            if (!in_array($status, ['open', 'dismissed', 'actioned'], true)) {
                throw ApiError::validation(['status' => 'قيمة غير مسموحة.']);
            }
            $where[] = 'status = ?';
            $params[] = $status;
        }
        foreach (['source' => ['user', 'dictionary'], 'type' => ['user', 'room_message', 'dm_message', 'room', 'photo', 'group', 'group_photo', 'held']] as $k => $allowed) {
            $v = $r->q($k);
            if ($v !== null && $v !== '') {
                if (!in_array($v, $allowed, true)) {
                    throw ApiError::validation([$k => 'قيمة غير مسموحة.']);
                }
                $where[] = ($k === 'type' ? 'target_type' : 'source') . ' = ?';
                $params[] = $v;
            }
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) FROM reports WHERE {$w}", $params);
        $rows = Db::all("SELECT * FROM reports WHERE {$w} ORDER BY level = 'severe' DESC, id DESC LIMIT ? OFFSET ?", array_merge($params, [$per, $off]));
        return V::paginated(array_map(static fn (array $x): array => self::reportShape($x), $rows), $page, $per, $total);
    }

    public static function report(Request $r): array
    {
        Auth::requireAdmin($r);
        $rep = Db::one('SELECT * FROM reports WHERE id = ?', [$r->intParam('id')]);
        if ($rep === null) {
            throw ApiError::notFound('البلاغ غير موجود.');
        }
        $out = self::reportShape($rep);
        if ($rep['target_user_id'] !== null) {
            $uid = (int) $rep['target_user_id'];
            $out['user_history'] = [
                'reports' => (int) Db::value('SELECT COUNT(*) FROM reports WHERE target_user_id = ?', [$uid]),
                'held' => (int) Db::value('SELECT COUNT(*) FROM held_content WHERE user_id = ?', [$uid]),
                'suspension' => Db::one('SELECT scope, source, reason, until, locked, created_at FROM community_bans WHERE user_id = ?', [$uid]),
            ];
        }
        return $out;
    }

    /** Remove the reported content itself. @param array<string,mixed> $rep */
    private static function deleteContent(array $rep): void
    {
        $id = (int) $rep['target_id'];
        switch ($rep['target_type']) {
            case 'room_message':
                Db::exec('DELETE FROM room_messages WHERE id = ?', [$id]);
                break;
            case 'dm_message':
                $m = Db::one('SELECT conversation_id FROM dm_messages WHERE id = ?', [$id]);
                Db::exec('DELETE FROM dm_messages WHERE id = ?', [$id]);
                if ($m !== null && $m['conversation_id'] !== null) {
                    Db::exec('UPDATE conversations SET last_message_id = (SELECT MAX(id) FROM dm_messages WHERE conversation_id = ? AND deleted_at IS NULL), updated_at = ? WHERE id = ?',
                        [(int) $m['conversation_id'], gmdate('Y-m-d H:i:s.v'), (int) $m['conversation_id']]);
                }
                break;
            case 'held':
                Db::exec('DELETE FROM held_content WHERE id = ?', [$id]);
                break;
            case 'room':
                $room = Db::one('SELECT * FROM rooms WHERE id = ?', [$id]);
                if ($room !== null) {
                    Rooms::close($room, 'admin');
                }
                break;
            case 'group':
                $g = Db::one('SELECT * FROM cgroups WHERE id = ?', [$id]);
                if ($g !== null) {
                    Groups::delete($g);
                }
                break;
            case 'group_photo':
                self::removeGroupPhotoRow($id);
                break;
            case 'photo':
                self::removeUserPhotoRow($id);
                break;
            default: // user: nothing to delete (suspend/ban instead)
                break;
        }
    }

    private static function removeUserPhotoRow(int $uid): void
    {
        $file = Db::value('SELECT avatar_file FROM users WHERE id = ?', [$uid]);
        Db::exec('UPDATE users SET avatar_file = NULL, avatar_url = NULL, updated_at = ? WHERE id = ?', [Db::now(), $uid]);
        Avatar::delete(is_string($file) ? $file : null);
    }

    private static function removeGroupPhotoRow(int $gid): void
    {
        $file = Db::value('SELECT photo_file FROM cgroups WHERE id = ?', [$gid]);
        Db::exec('UPDATE cgroups SET photo_file = NULL, updated_at = ? WHERE id = ?', [Db::now(), $gid]);
        Avatar::delete(is_string($file) ? $file : null);
    }

    /** Suspend in the community (scope community|rooms), or ban from the whole app (scope app). */
    private static function suspend(Request $r, int $uid, string $scope, ?int $days, string $reason, ?int $reportId): void
    {
        if ($uid === (int) $r->user['id']) {
            throw ApiError::forbidden('لا يمكنك إيقاف حسابك.');
        }
        $until = $days !== null ? Db::now($days * 86400) : null;
        if ($scope === 'app') {
            Db::exec(
                "INSERT INTO bans (user_id, scope, reason, until, created_by, created_at) VALUES (?, 'app', ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE scope = 'app', reason = VALUES(reason), until = VALUES(until), created_by = VALUES(created_by), created_at = VALUES(created_at)",
                [$uid, $reason, $until, (int) $r->user['id'], Db::now()]
            );
            Auth::revokeAll($uid);
        } else {
            Db::exec(
                "INSERT INTO community_bans (user_id, scope, source, reason, until, locked, report_id, created_by, created_at) VALUES (?, ?, 'admin', ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE scope = VALUES(scope), source = 'admin', reason = VALUES(reason), until = VALUES(until), locked = VALUES(locked),
                   report_id = VALUES(report_id), created_by = VALUES(created_by), created_at = VALUES(created_at)",
                [$uid, $scope, $reason, $until, $until === null ? 1 : 0, $reportId, (int) $r->user['id'], Db::now()]
            );
            Push::notify($uid, 'suspension', $scope === 'rooms' ? 'تم منعك من الغرف الصوتية' : 'تم إيقاف حسابك في المجتمع',
                ($reason !== '' ? $reason . ' — ' : '') . ($until !== null ? 'حتى ' . substr($until, 0, 10) : 'بشكل دائم'), ['scope' => $scope]);
        }
        Community::forgetSuspension($uid);
        // out of every live room now
        foreach (Db::all("SELECT p.room_id FROM room_participants p JOIN rooms r ON r.id = p.room_id WHERE p.user_id = ? AND p.present = 1 AND r.status = 'open'", [$uid]) as $p) {
            Db::exec('UPDATE room_participants SET present = 0, left_at = ? WHERE room_id = ? AND user_id = ?', [Db::now(), (int) $p['room_id'], $uid]);
            Rooms::refreshCounts((int) $p['room_id']);
            LiveKit::removeParticipant(LiveKit::roomName((int) $p['room_id']), $uid);
        }
    }

    /**
     * POST /admin/community/reports/{id}/decision {action, duration_days?, note?, also_delete?}
     * action: dismiss | delete_content | remove_photo | suspend | ban_rooms | ban_app | release
     */
    public static function decide(Request $r): array
    {
        Auth::requireAdmin($r);
        $rep = Db::one('SELECT * FROM reports WHERE id = ?', [$r->intParam('id')]);
        if ($rep === null) {
            throw ApiError::notFound('البلاغ غير موجود.');
        }
        $b = $r->body();
        $action = (string) V::enum($b, 'action', ['dismiss', 'delete_content', 'remove_photo', 'suspend', 'ban_rooms', 'ban_app', 'release']);
        $days = isset($b['duration_days']) && $b['duration_days'] !== null ? V::int($b, 'duration_days', 1, 3650) : null;
        $note = V::str($b, 'note', 500, false, 0, true) ?? '';
        $uid = $rep['target_user_id'] !== null ? (int) $rep['target_user_id'] : null;
        $needsUser = in_array($action, ['suspend', 'ban_rooms', 'ban_app'], true);
        if ($needsUser && $uid === null) {
            throw ApiError::validation(['action' => 'لا يوجد حساب مرتبط بهذا البلاغ.']);
        }
        switch ($action) {
            case 'delete_content':
                self::deleteContent($rep);
                break;
            case 'remove_photo':
                if ($rep['target_type'] === 'group_photo' || $rep['target_type'] === 'group') {
                    self::removeGroupPhotoRow((int) $rep['target_id']);
                } elseif ($uid !== null) {
                    self::removeUserPhotoRow($uid);
                }
                break;
            case 'suspend':
            case 'ban_rooms':
            case 'ban_app':
                self::suspend($r, (int) $uid, ['suspend' => 'community', 'ban_rooms' => 'rooms', 'ban_app' => 'app'][$action], $days, $note, (int) $rep['id']);
                if (($b['also_delete'] ?? false) === true) {
                    self::deleteContent($rep);
                }
                break;
            case 'release': // a "possible" DM that was fine after all: deliver it now
                $held = $rep['target_type'] === 'held' ? Db::one('SELECT * FROM held_content WHERE id = ?', [(int) $rep['target_id']]) : null;
                if ($held === null || $held['context'] !== 'dm' || $held['context_id'] === null || $held['user_id'] === null) {
                    throw ApiError::validation(['action' => 'يمكن تمرير الرسائل الخاصة المحجوزة فقط.']);
                }
                $c = Db::one('SELECT * FROM conversations WHERE id = ?', [(int) $held['context_id']]);
                if ($c !== null) {
                    $sender = (int) $held['user_id'];
                    $to = (int) $c['user_low'] === $sender ? (int) $c['user_high'] : (int) $c['user_low'];
                    $mid = Db::insert('INSERT INTO dm_messages (conversation_id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
                        [(int) $c['id'], $sender, $to, mb_substr((string) $held['body'], 0, 2000), Db::now()]);
                    Db::exec('UPDATE conversations SET last_message_id = ?, updated_at = ? WHERE id = ?', [$mid, gmdate('Y-m-d H:i:s.v'), (int) $c['id']]);
                }
                Db::exec('DELETE FROM held_content WHERE id = ?', [(int) $held['id']]);
                break;
        }
        $status = $action === 'dismiss' ? 'dismissed' : 'actioned';
        Db::exec('UPDATE reports SET status = ?, decision = ?, decision_note = ?, decided_by = ?, decided_at = ? WHERE id = ?',
            [$status, $action, $note, (int) $r->user['id'], Db::now(), (int) $rep['id']]);
        // a dismissed report releases the message's retention (it is deleted with its room / when deleted by the users)
        if ($action === 'dismiss' && in_array($rep['target_type'], ['room_message', 'dm_message'], true)
            && Db::value("SELECT COUNT(*) FROM reports WHERE target_type = ? AND target_id = ? AND status = 'open'", [$rep['target_type'], (int) $rep['target_id']]) == 0) {
            $tbl = $rep['target_type'] === 'room_message' ? 'room_messages' : 'dm_messages';
            Db::exec("UPDATE {$tbl} SET reported = 0 WHERE id = ?", [(int) $rep['target_id']]);
            if ($tbl === 'dm_messages') {
                Db::exec('DELETE FROM dm_messages WHERE id = ? AND deleted_at IS NOT NULL', [(int) $rep['target_id']]);
            } else {
                Db::exec("DELETE m FROM room_messages m JOIN rooms r ON r.id = m.room_id WHERE m.id = ? AND r.status IN ('closed','cancelled')", [(int) $rep['target_id']]);
            }
        }
        self::audit($r, 'community.report.' . $action, 'report:' . $rep['id'] . ($uid !== null ? ' user:' . $uid : ''), array_filter([
            'target' => $rep['target_type'] . ':' . $rep['target_id'], 'days' => $days, 'note' => $note,
        ], static fn ($v): bool => $v !== null && $v !== ''));
        return self::reportShape((array) Db::one('SELECT * FROM reports WHERE id = ?', [(int) $rep['id']]));
    }

    // ── Suspensions ──────────────────────────────────────────────────────────

    /** GET /admin/community/suspensions?source=dictionary|admin — with the evidence. */
    public static function suspensions(Request $r): array
    {
        Auth::requireAdmin($r);
        [$page, $per, $off] = V::page($r);
        $src = $r->q('source', '');
        $where = '(b.until IS NULL OR b.until > ?)';
        $params = [Db::now()];
        if ($src === 'dictionary' || $src === 'admin') {
            $where .= ' AND b.source = ?';
            $params[] = $src;
        }
        $total = (int) Db::value("SELECT COUNT(*) FROM community_bans b WHERE {$where}", $params);
        $rows = Db::all("SELECT b.* FROM community_bans b WHERE {$where} ORDER BY b.locked, b.created_at DESC LIMIT ? OFFSET ?", array_merge($params, [$per, $off]));
        return V::paginated(array_map(static fn (array $b): array => [
            'user' => self::userBrief((int) $b['user_id']),
            'scope' => (string) $b['scope'],
            'source' => (string) $b['source'],
            'reason' => (string) $b['reason'],
            'until' => Db::iso($b['until']),
            'locked' => (int) $b['locked'] === 1,
            'report_id' => $b['report_id'] !== null ? (int) $b['report_id'] : null,
            'created_at' => Db::iso($b['created_at']),
            'evidence' => array_map(static fn (array $h): array => [
                'id' => (int) $h['id'], 'context' => (string) $h['context'], 'context_id' => $h['context_id'] !== null ? (int) $h['context_id'] : null,
                'body' => (string) $h['body'], 'level' => (string) $h['level'], 'matched' => (string) $h['matched'], 'created_at' => Db::iso($h['created_at']),
            ], Db::all('SELECT * FROM held_content WHERE user_id = ? ORDER BY id DESC LIMIT 20', [(int) $b['user_id']])),
        ], $rows), $page, $per, $total);
    }

    public static function reactivate(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $uid = $r->intParam('id');
        $b = Db::one('SELECT * FROM community_bans WHERE user_id = ?', [$uid]);
        if ($b === null) {
            throw ApiError::notFound('لا يوجد إيقاف لهذا الحساب.');
        }
        Db::exec('DELETE FROM community_bans WHERE user_id = ?', [$uid]);
        if ($b['report_id'] !== null) {
            Db::exec("UPDATE reports SET status = 'actioned', decision = 'reactivate', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'open'", [(int) $r->user['id'], Db::now(), (int) $b['report_id']]);
        }
        self::audit($r, 'community.reactivate', 'user:' . $uid, ['scope' => $b['scope'], 'source' => $b['source']]);
        return Reply::empty();
    }

    /** POST /admin/community/suspensions/{id}/lock — make a (dictionary) suspension permanent. */
    public static function lock(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $uid = $r->intParam('id');
        if (Db::exec("UPDATE community_bans SET locked = 1, until = NULL, scope = 'community', created_by = ? WHERE user_id = ?", [(int) $r->user['id'], $uid]) === 0
            && Db::value('SELECT 1 FROM community_bans WHERE user_id = ?', [$uid]) === null) {
            throw ApiError::notFound('لا يوجد إيقاف لهذا الحساب.');
        }
        $rep = Db::value('SELECT report_id FROM community_bans WHERE user_id = ?', [$uid]);
        if ($rep !== null) {
            Db::exec("UPDATE reports SET status = 'actioned', decision = 'lock', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'open'", [(int) $r->user['id'], Db::now(), (int) $rep]);
        }
        self::audit($r, 'community.lock', 'user:' . $uid);
        return Reply::empty();
    }

    /** POST /admin/community/users/{id}/suspend {scope: community|rooms|app, duration_days?, reason?} */
    public static function suspendUser(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $uid = $r->intParam('id');
        if (Auth::findUser($uid) === null) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        $b = $r->body();
        $scope = (string) V::enum($b, 'scope', ['community', 'rooms', 'app']);
        $days = isset($b['duration_days']) && $b['duration_days'] !== null ? V::int($b, 'duration_days', 1, 3650) : null;
        $reason = V::str($b, 'reason', 500, false, 0) ?? '';
        self::suspend($r, $uid, $scope, $days, $reason, null);
        self::audit($r, 'community.suspend', 'user:' . $uid, ['scope' => $scope, 'days' => $days, 'reason' => $reason]);
        return Reply::empty();
    }

    /** PATCH /admin/community/users/{id} {gender?, birthdate?} — corrections requested through support. */
    public static function correctUser(Request $r): array
    {
        Auth::requireAdmin($r);
        $uid = $r->intParam('id');
        $u = Auth::findUser($uid);
        if ($u === null) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        $b = $r->body();
        $changes = [];
        if (array_key_exists('gender', $b)) {
            $changes['gender'] = (string) V::enum($b, 'gender', ['male', 'female']);
        }
        if (array_key_exists('birthdate', $b)) {
            $bd = (string) V::date($b, 'birthdate');
            if ($bd > gmdate('Y-m-d')) {
                throw ApiError::validation(['birthdate' => 'تاريخ غير صالح.']);
            }
            $changes['birthdate'] = $bd;
        }
        if ($changes !== []) {
            $sets = implode(', ', array_map(static fn (string $k): string => "{$k} = ?", array_keys($changes)));
            Db::exec("UPDATE users SET {$sets}, updated_at = ? WHERE id = ?", array_merge(array_values($changes), [Db::now(), $uid]));
            if (isset($changes['gender']) && $changes['gender'] !== $u['gender']) {
                // a corrected gender must not leave them in rooms/groups of the other type
                $scope = Community::scopeOf($changes['gender']);
                foreach (Db::all("SELECT p.room_id FROM room_participants p JOIN rooms r ON r.id = p.room_id WHERE p.user_id = ? AND r.gender_scope NOT IN (?, 'mixed')", [$uid, $scope]) as $p) {
                    Db::exec('DELETE FROM room_participants WHERE room_id = ? AND user_id = ?', [(int) $p['room_id'], $uid]);
                    Rooms::refreshCounts((int) $p['room_id']);
                    LiveKit::removeParticipant(LiveKit::roomName((int) $p['room_id']), $uid);
                }
                Db::exec("DELETE m FROM cgroup_members m JOIN cgroups g ON g.id = m.group_id WHERE m.user_id = ? AND m.role <> 'founder' AND g.gender_scope NOT IN (?, 'mixed')", [$uid, $scope]);
                Db::exec("DELETE rr FROM room_reminders rr JOIN rooms r ON r.id = rr.room_id WHERE rr.user_id = ? AND r.gender_scope NOT IN (?, 'mixed')", [$uid, $scope]);
            }
            self::audit($r, 'community.user.correct', 'user:' . $uid . ' ' . $u['email'], ['from' => ['gender' => $u['gender'], 'birthdate' => $u['birthdate']], 'to' => $changes]);
        }
        return Auth::shape((array) Auth::findUser($uid));
    }

    public static function removeUserPhoto(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $uid = $r->intParam('id');
        if (Auth::findUser($uid) === null) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        self::removeUserPhotoRow($uid);
        self::audit($r, 'community.photo.remove', 'user:' . $uid);
        return Reply::empty();
    }

    public static function removeGroupPhoto(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $gid = $r->intParam('id');
        Groups::load($gid);
        self::removeGroupPhotoRow($gid);
        self::audit($r, 'community.group_photo.remove', 'group:' . $gid);
        return Reply::empty();
    }

    public static function deleteGroup(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $g = Groups::load($r->intParam('id'));
        Groups::delete($g);
        self::audit($r, 'community.group.delete', 'group:' . $g['id'], ['name' => $g['name']]);
        return Reply::empty();
    }

    // ── Live rooms ───────────────────────────────────────────────────────────

    /** GET /admin/community/rooms?status=open|scheduled — every room, both genders. */
    public static function rooms(Request $r): array
    {
        Auth::requireAdmin($r);
        $status = $r->q('status', 'open');
        if (!in_array($status, ['open', 'scheduled'], true)) {
            throw ApiError::validation(['status' => 'قيمة غير مسموحة.']);
        }
        $rows = Db::all('SELECT r.*, u.name AS owner_name, u.email AS owner_email, g.name AS group_name FROM rooms r
             LEFT JOIN users u ON u.id = r.owner_id LEFT JOIN cgroups g ON g.id = r.group_id
             WHERE r.status = ? ORDER BY ' . ($status === 'open' ? 'r.opened_at DESC' : 'r.scheduled_at') . ' LIMIT 500', [$status]);
        return [
            'items' => array_map(static fn (array $x): array => [
                'id' => (int) $x['id'], 'title' => (string) $x['title'], 'gender_scope' => (string) $x['gender_scope'],
                'visibility' => (string) $x['visibility'], 'status' => (string) $x['status'], 'locked' => (int) $x['locked'] === 1,
                'owner' => $x['owner_id'] !== null ? ['id' => (int) $x['owner_id'], 'name' => (string) $x['owner_name'], 'email' => (string) $x['owner_email']] : null,
                'group' => $x['group_id'] !== null ? ['id' => (int) $x['group_id'], 'name' => (string) $x['group_name']] : null,
                'listener_count' => (int) $x['listener_count'], 'speaker_count' => (int) $x['speaker_count'], 'peak_count' => (int) $x['peak_count'],
                'opened_at' => Db::iso($x['opened_at']), 'scheduled_at' => Db::iso($x['scheduled_at']), 'no_speaker_since' => Db::iso($x['no_speaker_since']),
            ], $rows),
            'limits' => Rooms::limits(),
            'open_count' => (int) Db::value("SELECT COUNT(*) FROM rooms WHERE status = 'open'"),
        ];
    }

    public static function closeRoom(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $room = Rooms::load($r->intParam('id'));
        Rooms::close($room, 'admin');
        self::audit($r, 'community.room.close', 'room:' . $room['id'], ['title' => $room['title'], 'gender_scope' => $room['gender_scope']]);
        return Reply::empty();
    }

    // ── Dictionary ───────────────────────────────────────────────────────────

    /** @param array<string,mixed> $w */
    private static function wordShape(array $w): array
    {
        return ['id' => (int) $w['id'], 'word' => (string) $w['word'], 'level' => (string) $w['level'], 'note' => (string) $w['note'], 'created_at' => Db::iso($w['created_at'])];
    }

    public static function dictionary(Request $r): array
    {
        Auth::requireAdmin($r);
        [$page, $per, $off] = V::page($r, 100);
        $where = '1 = 1';
        $params = [];
        $q = trim(mb_substr((string) $r->q('q', ''), 0, 100));
        if ($q !== '') {
            $where .= ' AND (word LIKE ? OR normalized LIKE ?)';
            array_push($params, '%' . Db::likeEscape($q) . '%', '%' . Db::likeEscape(Moderation::wordForms($q)['ar'] ?: $q) . '%');
        }
        $lvl = $r->q('level');
        if ($lvl === 'severe' || $lvl === 'possible') {
            $where .= ' AND level = ?';
            $params[] = $lvl;
        }
        $total = (int) Db::value("SELECT COUNT(*) FROM dictionary_words WHERE {$where}", $params);
        $rows = Db::all("SELECT * FROM dictionary_words WHERE {$where} ORDER BY id DESC LIMIT ? OFFSET ?", array_merge($params, [$per, $off]));
        return V::paginated(array_map([self::class, 'wordShape'], $rows), $page, $per, $total);
    }

    /** Whether a normalized word occurs in the Hafs text cached by the riwayat page (storage/cache/riwayat). */
    private static function inQuran(string $ar): bool
    {
        if (mb_strlen($ar) < 2) {
            return false;
        }
        foreach (glob(Config::storageDir('cache/riwayat') . '/ara-quranuthmanihaf-*.json') ?: [] as $f) {
            $j = json_decode((string) @file_get_contents($f), true);
            foreach ((array) ($j['ayahs'] ?? $j) as $ayah) {
                if (is_string($ayah) && mb_strpos(Moderation::collapse((string) preg_replace('/[^\p{L}\s]/u', '', Moderation::fold($ayah))), $ar) !== false) {
                    return true;
                }
            }
        }
        return false;
    }

    /** POST /admin/community/dictionary {word, level, note?} — a word found in the Quran is always saved as «possible». */
    public static function dictionaryCreate(Request $r): Reply
    {
        Auth::requireAdmin($r);
        $b = $r->body();
        $word = (string) V::str($b, 'word', 100);
        $level = (string) V::enum($b, 'level', ['severe', 'possible']);
        $note = V::str($b, 'note', 255, false, 0) ?? '';
        $forms = Moderation::wordForms($word);
        $norm = $forms['ar'] !== '' ? $forms['ar'] : $forms['latin'];
        if ($norm === '') {
            throw ApiError::validation(['word' => 'الكلمة لا تحتوي على حروف.']);
        }
        $forced = false;
        if ($level === 'severe' && (($b['in_quran'] ?? false) === true || ($forms['ar'] !== '' && self::inQuran($forms['ar'])))) {
            $level = 'possible'; // words that appear in the Quran are never auto-suspending
            $forced = true;
        }
        try {
            $id = Db::insert('INSERT INTO dictionary_words (word, normalized, level, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [$word, $norm, $level, $note, (int) $r->user['id'], Db::now()]);
        } catch (\PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                throw new ApiError(409, 'conflict', 'هذه الكلمة (أو صيغة مطابقة لها) موجودة في القاموس.');
            }
            throw $e;
        }
        Moderation::flush();
        self::audit($r, 'community.dictionary.add', 'word:' . $id, ['word' => $word, 'level' => $level]);
        return Reply::created(self::wordShape((array) Db::one('SELECT * FROM dictionary_words WHERE id = ?', [$id])) + ['forced_possible' => $forced]);
    }

    public static function dictionaryUpdate(Request $r): array
    {
        Auth::requireAdmin($r);
        $w = Db::one('SELECT * FROM dictionary_words WHERE id = ?', [$r->intParam('id')]);
        if ($w === null) {
            throw ApiError::notFound();
        }
        $b = $r->body();
        $level = array_key_exists('level', $b) ? (string) V::enum($b, 'level', ['severe', 'possible']) : (string) $w['level'];
        $note = array_key_exists('note', $b) ? (V::str($b, 'note', 255, false, 0) ?? '') : (string) $w['note'];
        if ($level === 'severe' && $w['level'] !== 'severe' && self::inQuran((string) $w['normalized'])) {
            throw ApiError::validation(['level' => 'هذه الكلمة واردة في القرآن الكريم، فتبقى «محتملة».']);
        }
        Db::exec('UPDATE dictionary_words SET level = ?, note = ? WHERE id = ?', [$level, $note, (int) $w['id']]);
        Moderation::flush();
        self::audit($r, 'community.dictionary.update', 'word:' . $w['id'], ['level' => $level]);
        return self::wordShape((array) Db::one('SELECT * FROM dictionary_words WHERE id = ?', [(int) $w['id']]));
    }

    public static function dictionaryDelete(Request $r): \stdClass
    {
        Auth::requireAdmin($r);
        $id = $r->intParam('id');
        $w = Db::one('SELECT word FROM dictionary_words WHERE id = ?', [$id]);
        if ($w === null) {
            throw ApiError::notFound();
        }
        Db::exec('DELETE FROM dictionary_words WHERE id = ?', [$id]);
        Moderation::flush();
        self::audit($r, 'community.dictionary.delete', 'word:' . $id, ['word' => $w['word']]);
        return Reply::empty();
    }

    /** POST /admin/community/dictionary/test {text} — what the filter would do (nothing is stored). */
    public static function dictionaryTest(Request $r): array
    {
        Auth::requireAdmin($r);
        $text = (string) V::str($r->body(), 'text', 2000, true, 1, true);
        $hit = Moderation::scan($text);
        return ['match' => $hit, 'has_link' => Moderation::hasLink($text), 'forms' => Moderation::textForms($text)];
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    public static function settings(Request $r): array
    {
        Auth::requireAdmin($r);
        return ['rooms' => Rooms::limits(), 'bounds' => array_map(static fn (array $l): array => ['min' => $l[1], 'max' => $l[2], 'default' => $l[0]], Settings::ROOM_LIMITS),
            'livekit_configured' => LiveKit::configured(), 'fcm_configured' => Push::fcmServiceAccount() !== null, 'apns_configured' => Push::apnsConfigured()];
    }

    public static function saveSettings(Request $r): array
    {
        Auth::requireAdmin($r);
        $b = (array) ($r->body()['rooms'] ?? $r->body());
        $cur = Rooms::limits();
        foreach (Settings::ROOM_LIMITS as $k => [, $min, $max]) {
            if (array_key_exists($k, $b)) {
                $cur[$k] = (int) V::int($b, $k, $min, $max);
            }
        }
        Settings::save(['rooms' => $cur]);
        self::audit($r, 'community.settings', 'rooms', $cur);
        return self::settings($r);
    }

    // ── Integration tests (called from AdminController::testIntegration) ────

    /** @return array{ok:bool, message:string} */
    public static function testIntegration(string $target): array
    {
        switch ($target) {
            case 'livekit':
                if (!LiveKit::configured()) {
                    return ['ok' => false, 'message' => 'أدخل عنوان LiveKit والمفتاح والسر أولاً.'];
                }
                $res = LiveKit::call('ListRooms', []);
                if ($res === null) {
                    return ['ok' => false, 'message' => 'تعذّر الاتصال بخادم LiveKit على ' . LiveKit::apiUrl() . ' أو أن المفتاح/السر غير صحيح.'];
                }
                return ['ok' => true, 'message' => 'تم الاتصال بخادم LiveKit. الغرف المفتوحة عليه الآن: ' . count((array) ($res['rooms'] ?? [])) . '.'];
            case 'fcm':
                if (Push::fcmServiceAccount() === null) {
                    return ['ok' => false, 'message' => 'الصق ملف حساب الخدمة (JSON) من Firebase أولاً.'];
                }
                Push::clearCaches();
                $err = null;
                $tok = Push::fcmAccessToken($err);
                return $tok !== null
                    ? ['ok' => true, 'message' => 'تم الحصول على رمز وصول من Google لمشروع ' . (Push::fcmServiceAccount()['project_id'] ?? '') . '.']
                    : ['ok' => false, 'message' => 'تعذّر الحصول على رمز وصول من Google: ' . $err];
            default:
                if (!Push::apnsConfigured()) {
                    return ['ok' => false, 'message' => 'أدخل مفتاح ‎.p8‎ و Key ID و Team ID و Bundle ID أولاً.'];
                }
                try {
                    Push::clearCaches();
                    $jwt = Push::apnsJwt();
                } catch (\Throwable $e) {
                    return ['ok' => false, 'message' => 'تعذّر التوقيع بالمفتاح: ' . $e->getMessage()];
                }
                $c = Jwt::peek($jwt);
                return ['ok' => true, 'message' => 'المفتاح صالح وتم توقيع رمز APNs (الفريق ' . ($c['iss'] ?? '') . '، البيئة ' . (Integrations::get('apns_environment') ?: 'production') . ').'];
        }
    }
}
