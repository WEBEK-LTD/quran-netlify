<?php
declare(strict_types=1);

/**
 * End-to-end smoke test against a running server.
 *
 *   php api/tests/smoke.php --base=http://127.0.0.1:8080 \
 *       [--install --db-name=nq_test --db-user=nq --db-pass=secret] \
 *       [--local=/path/to/api]   # local only: patch config.php for testing, read the mail log, inspect the DB
 *
 * --local patches config.php after install: cookie_domain '', trust_proxy true (so each test actor
 * gets its own IP via X-Forwarded-For), mail_transport 'log'. Never use --local against production.
 */

$opt = getopt('', ['base:', 'install', 'db-name:', 'db-user:', 'db-pass:', 'local:']);
$BASE = rtrim((string) ($opt['base'] ?? 'http://127.0.0.1:8080'), '/');
$LOCAL = isset($opt['local']) ? rtrim((string) $opt['local'], '/') : null;
$pass = 0;
$fail = 0;
$failures = [];

function check(string $name, bool $cond, string $detail = ''): bool
{
    global $pass, $fail, $failures;
    if ($cond) {
        $pass++;
        echo "  \033[32m✓\033[0m {$name}\n";
    } else {
        $fail++;
        $failures[] = $name;
        echo "  \033[31m✗ {$name}\033[0m" . ($detail !== '' ? "  — {$detail}" : '') . "\n";
    }
    return $cond;
}

function section(string $t): void
{
    echo "\n== {$t}\n";
}

/**
 * @param array<string,mixed> $o token, ip, client(bool|string), headers, cookie, raw
 * @return array{status:int, json:mixed, headers:array<string,list<string>>, raw:string}
 */
function req(string $method, string $path, mixed $body = null, array $o = []): array
{
    global $BASE;
    $url = str_starts_with($path, 'http') ? $path : $BASE . (str_starts_with($path, '/install') ? '' : '/v1') . $path;
    $h = ['Accept: application/json'];
    $client = $o['client'] ?? 'web';
    if ($client !== false) {
        $h[] = 'X-NQ-Client: ' . $client;
    }
    if (!empty($o['token'])) {
        $h[] = 'Authorization: Bearer ' . $o['token'];
    }
    $h[] = 'X-Forwarded-For: ' . ($o['ip'] ?? '10.0.0.1');
    if (!empty($o['cookie'])) {
        $h[] = 'Cookie: ' . $o['cookie'];
    }
    foreach ($o['headers'] ?? [] as $k => $v) {
        $h[] = $k . ': ' . $v;
    }
    $ch = curl_init($url);
    $payload = null;
    if (isset($o['raw'])) {
        $payload = (string) $o['raw'];
        $h[] = 'Content-Type: ' . ($o['ctype'] ?? 'application/json');
    } elseif ($body !== null) {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
        $h[] = 'Content-Type: application/json';
    }
    $respHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $h,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$respHeaders): int {
            $p = strpos($line, ':');
            if ($p !== false) {
                $respHeaders[strtolower(trim(substr($line, 0, $p)))][] = trim(substr($line, $p + 1));
            }
            return strlen($line);
        },
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }
    $raw = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $status, 'json' => json_decode($raw, true), 'headers' => $respHeaders, 'raw' => $raw];
}

function hdr(array $res, string $name): string
{
    return implode(', ', $res['headers'][strtolower($name)] ?? []);
}

function data(array $res): mixed
{
    return $res['json']['data'] ?? null;
}

function errc(array $res): string
{
    return (string) ($res['json']['error']['code'] ?? '');
}

function desc(array $res): string
{
    return 'HTTP ' . $res['status'] . ' ' . substr($res['raw'], 0, 300);
}

/** Latest mailed token for an address (local mode). */
function mailToken(string $to, string $kind): ?string
{
    global $LOCAL;
    $file = $LOCAL . '/storage/mail/mail.log';
    if (!is_file($file)) {
        return null;
    }
    $found = null;
    foreach (file($file) ?: [] as $line) {
        $m = json_decode($line, true);
        if (($m['to'] ?? '') === $to) {
            $re = $kind === 'verify' ? '/type=verify&token=([a-f0-9]{64})/' : '/reset-password\?token=([a-f0-9]{64})/';
            if (preg_match($re, (string) $m['text'], $mm)) {
                $found = $mm[1];
            }
        }
    }
    return $found;
}

function pdo(): ?PDO
{
    global $LOCAL;
    static $pdo = null;
    if ($LOCAL === null) {
        return null;
    }
    if ($pdo === null) {
        $c = require $LOCAL . '/config.php';
        $pdo = new PDO('mysql:host=' . $c['db']['host'] . ';dbname=' . $c['db']['name'] . ';charset=utf8mb4', $c['db']['user'], $c['db']['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    }
    return $pdo;
}

$run = 'r' . bin2hex(random_bytes(3));
$ADMIN_EMAIL = "admin+{$run}@example.com";
$ADMIN_PW = 'Admin-pass-123';

// ───────────────────────────────────────────────────────────────────────────
section('Install');
if (isset($opt['install'])) {
    $g = req('GET', '/install.php', null, ['client' => false]);
    check('install form is served', $g['status'] === 200 && str_contains($g['raw'], 'name="csrf"'), desc($g));
    check('install page has security headers', str_contains(hdr($g, 'x-frame-options'), 'DENY') && str_contains(hdr($g, 'content-security-policy'), "default-src 'none'"));
    preg_match('/nq_install=([a-f0-9]{64})/', hdr($g, 'set-cookie'), $cm);
    preg_match('/name="csrf" value="([a-f0-9]{64})"/', $g['raw'], $fm);
    $form = http_build_query([
        'csrf' => $fm[1] ?? '', 'db_name' => $opt['db-name'] ?? '', 'db_user' => $opt['db-user'] ?? '', 'db_pass' => $opt['db-pass'] ?? '',
        'admin_name' => 'المشرف', 'admin_email' => $ADMIN_EMAIL, 'admin_password' => $ADMIN_PW, 'admin_password2' => $ADMIN_PW,
    ]);
    $bad = req('POST', '/install.php', null, ['client' => false, 'raw' => $form, 'ctype' => 'application/x-www-form-urlencoded', 'cookie' => 'nq_install=' . str_repeat('a', 64)]);
    check('install POST with wrong CSRF cookie is refused', $bad['status'] === 200 && str_contains($bad['raw'], 'انتهت صلاحية النموذج'), desc($bad));
    $p = req('POST', '/install.php', null, ['client' => false, 'raw' => $form, 'ctype' => 'application/x-www-form-urlencoded', 'cookie' => 'nq_install=' . ($cm[1] ?? '')]);
    check('install POST succeeds', $p['status'] === 200 && str_contains($p['raw'], 'تم التثبيت بنجاح'), desc($p));
    $again = req('GET', '/install.php', null, ['client' => false]);
    check('install refuses to run again', $again['status'] === 403 && str_contains($again['raw'], 'مُثبّت مسبقاً'), desc($again));
    if ($LOCAL !== null) {
        $cfgFile = $LOCAL . '/config.php';
        check('config.php written with 0600 perms', is_file($cfgFile) && (fileperms($cfgFile) & 0777) === 0600, sprintf('%o', @fileperms($cfgFile) & 0777));
        $cfg = require $cfgFile;
        check('config has a 32-byte app_key', strlen((string) base64_decode((string) $cfg['app_key'], true)) === 32);
        $cfg['cookie_domain'] = '';
        $cfg['trust_proxy'] = true;
        $cfg['mail_transport'] = 'log';
        $cfg['api_url'] = $BASE;
        file_put_contents($cfgFile, "<?php\nreturn " . var_export($cfg, true) . ";\n");
        chmod($cfgFile, 0600);
        @unlink($LOCAL . '/storage/mail/mail.log');
    }
} else {
    echo "  (skipped — pass --install to test the installer on a fresh DB)\n";
}

// ───────────────────────────────────────────────────────────────────────────
section('Public, headers, CSRF, CORS');
$h = req('GET', '/health');
check('GET /health', $h['status'] === 200 && data($h) === ['status' => 'ok', 'db' => true], desc($h));
check('security headers', hdr($h, 'x-content-type-options') === 'nosniff' && hdr($h, 'referrer-policy') === 'no-referrer'
    && hdr($h, 'x-frame-options') === 'DENY' && str_contains(hdr($h, 'content-security-policy'), "default-src 'none'"), json_encode($h['headers']));
$s = req('GET', '/settings/public');
$sd = data($s);
check('settings/public defaults', ($sd['app_name'] ?? '') === 'نور القرآن' && ($sd['allow_signup'] ?? null) === true
    && ($sd['maintenance_mode'] ?? null) === false && ($sd['features']['ai_assistant'] ?? null) === true && ($sd['google_login'] ?? null) === false, desc($s));
$nocsrf = req('POST', '/auth/login', ['email' => 'x@example.com', 'password' => 'whatever1'], ['client' => false]);
check('non-GET without X-NQ-Client → 403', $nocsrf['status'] === 403, desc($nocsrf));
$pre = req('OPTIONS', '/auth/login', null, ['client' => false, 'headers' => ['Origin' => 'http://localhost:5173', 'Access-Control-Request-Method' => 'POST', 'Access-Control-Request-Headers' => 'content-type,x-nq-client']]);
check('CORS preflight allowed origin → 204 + ACAO + credentials', $pre['status'] === 204 && hdr($pre, 'access-control-allow-origin') === 'http://localhost:5173'
    && hdr($pre, 'access-control-allow-credentials') === 'true' && str_contains(hdr($pre, 'access-control-allow-headers'), 'X-NQ-Client'), desc($pre));
$pre2 = req('OPTIONS', '/auth/login', null, ['client' => false, 'headers' => ['Origin' => 'https://evil.example', 'Access-Control-Request-Method' => 'POST']]);
check('CORS preflight disallowed origin → 403, no ACAO', $pre2['status'] === 403 && hdr($pre2, 'access-control-allow-origin') === '', desc($pre2));
$g2 = req('GET', '/settings/public', null, ['headers' => ['Origin' => 'https://nuralquran.net']]);
check('GET from allowed origin echoes ACAO (never *)', hdr($g2, 'access-control-allow-origin') === 'https://nuralquran.net');
$evil = req('POST', '/auth/login', ['email' => 'x@example.com', 'password' => 'whatever1'], ['headers' => ['Origin' => 'https://evil.example']]);
check('write from disallowed origin → 403', $evil['status'] === 403, desc($evil));
$nf = req('GET', '/nope');
check('unknown route → 404 JSON', $nf['status'] === 404 && errc($nf) === 'not_found', desc($nf));
$mna = req('DELETE', '/health');
check('wrong method → 405', $mna['status'] === 405, desc($mna));
$big = req('POST', '/auth/login', null, ['raw' => '{"email":"' . str_repeat('a', 70000) . '"}', 'ip' => '10.9.9.9']);
check('body > 64 KB → 413', $big['status'] === 413, desc($big));
$badjson = req('POST', '/auth/signup', null, ['raw' => '{nope', 'ip' => '10.9.9.8']);
check('invalid JSON → 400', $badjson['status'] === 400 && errc($badjson) === 'bad_request', desc($badjson));

// ───────────────────────────────────────────────────────────────────────────
section('Auth');
$A = ['email' => "alice+{$run}@example.com", 'pw' => 'alice-pass-1', 'ip' => '10.1.0.1'];
$su = req('POST', '/auth/signup', ['name' => 'عائشة', 'email' => strtoupper($A['email']), 'password' => $A['pw']], ['ip' => $A['ip']]);
check('signup → 201 {user, token}', $su['status'] === 201 && strlen((string) (data($su)['token'] ?? '')) === 64 && (data($su)['user']['email'] ?? '') === $A['email'], desc($su));
$cookie = hdr($su, 'set-cookie');
check('signup sets nq_session cookie (HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age 60d)',
    str_contains($cookie, 'nq_session=') && stripos($cookie, 'httponly') !== false && stripos($cookie, 'secure') !== false
    && stripos($cookie, 'samesite=lax') !== false && str_contains($cookie, 'path=/') && str_contains($cookie, 'Max-Age=5184000'), $cookie);
check('new user: unverified, has_password, not admin, leaderboard off', (data($su)['user']['email_verified'] ?? null) === false
    && (data($su)['user']['has_password'] ?? null) === true && (data($su)['user']['is_admin'] ?? null) === false && (data($su)['user']['show_on_leaderboard'] ?? null) === false);
$A['token'] = (string) (data($su)['token'] ?? '');
$dup = req('POST', '/auth/signup', ['name' => 'x', 'email' => $A['email'], 'password' => 'another-pass'], ['ip' => '10.1.0.2']);
check('duplicate signup → 422 email_taken', $dup['status'] === 422 && errc($dup) === 'email_taken', desc($dup));
$short = req('POST', '/auth/signup', ['name' => 'x', 'email' => "s{$run}@example.com", 'password' => 'short'], ['ip' => '10.1.0.2']);
check('short password → 422 validation with fields.password', $short['status'] === 422 && isset($short['json']['error']['fields']['password']), desc($short));
$me = req('GET', '/auth/me', null, ['token' => $A['token']]);
check('GET /auth/me (Bearer)', $me['status'] === 200 && (data($me)['user']['name'] ?? '') === 'عائشة', desc($me));
$meC = req('GET', '/auth/me', null, ['cookie' => 'nq_session=' . $A['token']]);
check('GET /auth/me (cookie)', $meC['status'] === 200, desc($meC));
$meN = req('GET', '/auth/me');
check('GET /auth/me without session → 401', $meN['status'] === 401 && errc($meN) === 'unauthenticated', desc($meN));
if ($LOCAL !== null) {
    $vt = mailToken($A['email'], 'verify');
    check('verification email sent with site link', $vt !== null);
    $v = req('POST', '/auth/verify-email', ['token' => (string) $vt]);
    check('verify-email → user.email_verified', $v['status'] === 200 && (data($v)['user']['email_verified'] ?? null) === true, desc($v));
    $v2 = req('POST', '/auth/verify-email', ['token' => (string) $vt]);
    check('verify token is single-use → 422 invalid_token', $v2['status'] === 422 && errc($v2) === 'invalid_token', desc($v2));
}
$lo = req('POST', '/auth/logout', null, ['token' => $A['token']]);
check('logout → {}', $lo['status'] === 200 && $lo['raw'] === '{"ok":true,"data":{}}', desc($lo));
$me2 = req('GET', '/auth/me', null, ['token' => $A['token']]);
check('revoked token → 401', $me2['status'] === 401, desc($me2));
$wrong = req('POST', '/auth/login', ['email' => $A['email'], 'password' => 'wrong-password'], ['ip' => $A['ip']]);
check('login wrong password → 401 invalid_credentials', $wrong['status'] === 401 && errc($wrong) === 'invalid_credentials', desc($wrong));
$li = req('POST', '/auth/login', ['email' => $A['email'], 'password' => $A['pw']], ['ip' => $A['ip']]);
check('login → {user, token} + cookie', $li['status'] === 200 && strlen((string) (data($li)['token'] ?? '')) === 64 && str_contains(hdr($li, 'set-cookie'), 'nq_session='), desc($li));
$A['token'] = (string) (data($li)['token'] ?? '');
$ta = ['token' => $A['token'], 'ip' => $A['ip']];

// ───────────────────────────────────────────────────────────────────────────
section('Personal data');
$b0 = req('GET', '/me/bookmarks', null, $ta);
check('GET bookmarks → []', $b0['status'] === 200 && data($b0) === [], desc($b0));
$b1 = req('POST', '/me/bookmarks', ['surah' => 1, 'ayah' => 1], $ta);
check('POST bookmark', $b1['status'] === 200 && count((array) data($b1)) === 1 && (data($b1)[0]['surah'] ?? 0) === 1, desc($b1));
$bb = req('POST', '/me/bookmarks', ['surah' => 1, 'ayah' => 8], $ta);
check('bookmark with impossible ayah (1:8) → 422', $bb['status'] === 422, desc($bb));
$bp = req('PUT', '/me/bookmarks', ['items' => [['surah' => 2, 'ayah' => 255], ['surah' => 114, 'ayah' => 6], ['surah' => 2, 'ayah' => 255]]], $ta);
check('PUT bookmarks replaces all (dedup)', $bp['status'] === 200 && count((array) data($bp)) === 2, desc($bp));
$bd = req('DELETE', '/me/bookmarks/2/255', null, $ta);
check('DELETE bookmark', $bd['status'] === 200 && count((array) data($bd)) === 1 && (data($bd)[0]['surah'] ?? 0) === 114, desc($bd));
$many = array_fill(0, 2001, ['surah' => 1, 'ayah' => 1]);
$bm = req('PUT', '/me/bookmarks', ['items' => $many], $ta);
check('PUT > 2000 bookmarks → 422', $bm['status'] === 422, desc($bm));

$n1 = req('PUT', '/me/notes/2/255', ['text' => "آية الكرسي\nسطر ثانٍ"], $ta);
check('PUT note', $n1['status'] === 200 && (data($n1)['text'] ?? '') === "آية الكرسي\nسطر ثانٍ" && (data($n1)['ayah'] ?? 0) === 255, desc($n1));
req('PUT', '/me/notes/1/1', ['text' => 'الفاتحة'], $ta);
$nl = req('GET', '/me/notes', null, $ta);
check('GET notes (2)', $nl['status'] === 200 && count((array) data($nl)) === 2, desc($nl));
$nlong = req('PUT', '/me/notes/1/2', ['text' => str_repeat('ب', 5001)], $ta);
check('note > 5000 chars → 422', $nlong['status'] === 422, desc($nlong));
$nd = req('DELETE', '/me/notes/1/1', null, $ta);
check('DELETE note', $nd['status'] === 200 && count((array) data(req('GET', '/me/notes', null, $ta))) === 1, desc($nd));
$n404 = req('PUT', '/me/notes/115/1', ['text' => 'x'], $ta);
check('note on surah 115 → 404', $n404['status'] === 404, desc($n404));

$p0 = req('GET', '/me/progress', null, $ta);
check('GET progress → null', $p0['status'] === 200 && $p0['json']['data'] === null && array_key_exists('data', (array) $p0['json']), desc($p0));
$p1 = req('PUT', '/me/progress', ['surah' => 18, 'ayah' => 10], $ta);
check('PUT progress', $p1['status'] === 200 && (data($p1)['surah'] ?? 0) === 18 && (data($p1)['ayah'] ?? 0) === 10, desc($p1));
$pb = req('PUT', '/me/progress', ['surah' => 115, 'ayah' => 1], $ta);
check('PUT progress invalid surah → 422', $pb['status'] === 422, desc($pb));

$today = gmdate('Y-m-d');
$yesterday = gmdate('Y-m-d', time() - 86400);
usleep(1100000);
$r1 = req('POST', '/me/reading', ['surah' => 1, 'ayah' => 1], $ta + ['headers' => ['X-NQ-Date' => $today]]);
$r2 = req('POST', '/me/reading', ['surah' => 1, 'ayah' => 1], $ta + ['headers' => ['X-NQ-Date' => $today]]);
check('reading log counts distinct ayahs (same ayah twice = 1)', (data($r1)['today'] ?? -1) === 1 && (data($r2)['today'] ?? -1) === 1, desc($r2));
usleep(1100000);
$r3 = req('POST', '/me/reading', ['surah' => 1, 'ayah' => 2], $ta + ['headers' => ['X-NQ-Date' => $today]]);
$r4 = req('POST', '/me/reading', ['surah' => 2, 'ayah' => 1], $ta + ['headers' => ['X-NQ-Date' => $yesterday]]);
check('reading log: second ayah today → 2; yesterday accepted', (data($r3)['today'] ?? -1) === 2 && (data($r4)['today'] ?? -1) === 1, desc($r3) . ' / ' . desc($r4));
usleep(1100000);
$r5 = req('POST', '/me/reading', ['surah' => 2, 'ayah' => 2], $ta + ['headers' => ['X-NQ-Date' => '2001-01-01']]);
check('X-NQ-Date outside ±1 day → server date used', (data($r5)['today'] ?? -1) === 3, desc($r5));
$rb = req('POST', '/me/reading', ['surah' => 1, 'ayah' => 8], $ta);
check('reading log rejects 1:8', $rb['status'] === 422 || $rb['status'] === 429, desc($rb));
$burst = [];
for ($i = 0; $i < 5; $i++) {
    $burst[] = req('POST', '/me/reading', ['surah' => 3, 'ayah' => $i + 1], $ta)['status'];
}
check('reading log rate limit (2/s) → 429 in a burst', in_array(429, $burst, true), implode(',', $burst));
$st = req('GET', '/me/stats?days=30', null, $ta + ['headers' => ['X-NQ-Date' => $today]]);
$sd = data($st);
$todayRow = array_values(array_filter((array) ($sd['days'] ?? []), static fn ($d) => $d['date'] === $today));
check('stats: days/total/streak', $st['status'] === 200 && ($todayRow[0]['ayahs'] ?? 0) >= 3 && ($sd['streak'] ?? 0) === 2 && ($sd['best_streak'] ?? 0) === 2 && ($sd['total_ayahs'] ?? 0) >= 4, desc($st));

$h0 = req('GET', '/me/hifz', null, $ta);
check('GET hifz → null', $h0['status'] === 200 && $h0['json']['data'] === null, desc($h0));
$hz = req('PUT', '/me/hifz', ['data' => ['surahStatus' => ['1' => 'completed', '114' => 'completed', '2' => 'inProgress'], 'updatedAt' => 1700000000000], 'updated_at' => '2026-11-23T10:00:00.250Z'], $ta);
check('PUT hifz returns data + updated_at', $hz['status'] === 200 && (data($hz)['data']['updatedAt'] ?? 0) === 1700000000000
    && (data($hz)['updated_at'] ?? '') === '2026-11-23T10:00:00.250Z', desc($hz));
if (pdo()) {
    $hc = (int) pdo()->query('SELECT hifz_completed FROM users WHERE email = ' . pdo()->quote($A['email']))->fetchColumn();
    check('hifz_completed derived server-side (2)', $hc === 2, (string) $hc);
}

$k1 = req('POST', '/me/khatmat', ['type' => 'reading', 'start_date' => '2026-11-01', 'end_date' => '2026-11-20', 'notes' => 'ختمة رمضان'], $ta);
check('POST khatma → 201', $k1['status'] === 201 && (data($k1)['type'] ?? '') === 'reading' && (data($k1)['end_date'] ?? '') === '2026-11-20', desc($k1));
$kid = (int) (data($k1)['id'] ?? 0);
$kp = req('PATCH', "/me/khatmat/{$kid}", ['notes' => 'تم التعديل', 'type' => 'review'], $ta);
check('PATCH khatma', $kp['status'] === 200 && (data($kp)['notes'] ?? '') === 'تم التعديل' && (data($kp)['type'] ?? '') === 'review', desc($kp));
$kbad = req('POST', '/me/khatmat', ['type' => 'bogus', 'start_date' => '2026-11-01'], $ta);
check('khatma bad type → 422', $kbad['status'] === 422, desc($kbad));
$kord = req('POST', '/me/khatmat', ['type' => 'daily', 'start_date' => '2026-11-10', 'end_date' => '2026-11-01'], $ta);
check('khatma end < start → 422', $kord['status'] === 422, desc($kord));
$k2 = req('POST', '/me/khatmat', ['type' => 'daily', 'start_date' => $today, 'end_date' => null, 'notes' => ''], $ta);
$kdel = req('DELETE', '/me/khatmat/' . (int) (data($k2)['id'] ?? 0), null, $ta);
check('DELETE khatma', $kdel['status'] === 200, desc($kdel));
$kl = req('GET', '/me/khatmat', null, $ta);
check('GET khatmat (1 left)', $kl['status'] === 200 && count((array) data($kl)) === 1, desc($kl));

// ───────────────────────────────────────────────────────────────────────────
section('Group khatma');
$B = ['email' => "bashir+{$run}@example.com", 'pw' => 'bashir-pass-1', 'ip' => '10.2.0.1'];
$C = ['email' => "chafiq+{$run}@example.com", 'pw' => 'chafiq-pass-1', 'ip' => '10.3.0.1'];
foreach ([[&$B, 'بشير'], [&$C, 'شفيق']] as [&$U, $nm]) {
    $x = req('POST', '/auth/signup', ['name' => $nm, 'email' => $U['email'], 'password' => $U['pw']], ['ip' => $U['ip']]);
    $U['token'] = (string) (data($x)['token'] ?? '');
}
unset($U);
$tb = ['token' => $B['token'], 'ip' => $B['ip']];
$tc = ['token' => $C['token'], 'ip' => $C['ip']];
check('users B and C signed up', strlen($B['token']) === 64 && strlen($C['token']) === 64);
$g = req('POST', '/groups', ['deceased_name' => 'المرحوم أحمد', 'mode' => 'juz', 'is_public' => true, 'parts' => []], $ta);
$code = (string) (data($g)['code'] ?? '');
check('create room → 201, 7-char unambiguous code, 30 parts', $g['status'] === 201 && preg_match('/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/', $code) === 1
    && count((array) (data($g)['parts'] ?? [])) === 30 && (data($g)['is_owner'] ?? null) === true, desc($g));
$gh = req('POST', '/groups', ['deceased_name' => 'x', 'mode' => 'hizb', 'is_public' => false, 'parts' => [['part_index' => 1, 'label' => 'الحزب الأول', 'assignee' => 'فاطمة'], ['part_index' => 2]]], $ta);
check('create hizb room with explicit parts', $gh['status'] === 201 && count((array) (data($gh)['parts'] ?? [])) === 2 && (data($gh)['parts'][0]['assignee'] ?? '') === 'فاطمة', desc($gh));
$gbad = req('POST', '/groups', ['mode' => 'surah'], $ta);
check('create room bad mode → 422', $gbad['status'] === 422, desc($gbad));
$gB = req('GET', "/groups/{$code}", null, $tb);
check('other user reads room by code (is_owner false)', $gB['status'] === 200 && (data($gB)['is_owner'] ?? null) === false && count((array) (data($gB)['parts'] ?? [])) === 30, desc($gB));
$gLower = req('GET', '/groups/' . strtolower($code), null, $tb);
check('room code is case-insensitive', $gLower['status'] === 200, desc($gLower));
$mineB = req('GET', '/groups/mine', null, $tb);
check('reading by code records membership (/groups/mine)', in_array($code, array_column((array) data($mineB), 'code'), true) && isset(data($mineB)[0]['done_count'], data($mineB)[0]['total']), desc($mineB));
$cl = req('POST', "/groups/{$code}/parts/3/claim", ['name' => 'بشير بن سعد'], $tb);
$p3 = array_values(array_filter((array) (data($cl)['parts'] ?? []), static fn ($p) => $p['part_index'] === 3))[0] ?? [];
check('claim part 3', $cl['status'] === 200 && ($p3['takers'][0]['name'] ?? '') === 'بشير بن سعد' && ($p3['takers'][0]['is_me'] ?? null) === true, desc($cl));
$dC = req('POST', "/groups/{$code}/parts/3/done", ['done' => true], $tc);
check('non-taker marking done → 403', $dC['status'] === 403, desc($dC));
$dB = req('POST', "/groups/{$code}/parts/3/done", ['done' => true], $tb);
$p3 = array_values(array_filter((array) (data($dB)['parts'] ?? []), static fn ($p) => $p['part_index'] === 3))[0] ?? [];
check('taker marks done → part done, done_by_name', $dB['status'] === 200 && ($p3['done'] ?? null) === true && ($p3['done_by_name'] ?? '') === 'بشير بن سعد', desc($dB));
$dA = req('POST', "/groups/{$code}/parts/5/done", ['done' => true], $ta);
check('owner can mark any part done', $dA['status'] === 200 && (data($dA)['done_count'] ?? 0) === 2, desc($dA));
foreach ([['PATCH', "/groups/{$code}", ['is_public' => false]], ['POST', "/groups/{$code}/new-round", null], ['DELETE', "/groups/{$code}", null]] as [$m, $pth, $bd2]) {
    $x = req($m, $pth, $bd2, $tb);
    check("owner-only {$m} {$pth} by other → 403", $x['status'] === 403, desc($x));
}
$pub = req('GET', '/groups/public?page=1&per_page=10', null, $tc);
check('public rooms list (paginated)', $pub['status'] === 200 && in_array($code, array_column((array) (data($pub)['items'] ?? []), 'code'), true) && (data($pub)['per_page'] ?? 0) === 10, desc($pub));
$pa = req('PATCH', "/groups/{$code}", ['is_public' => false], $ta);
check('owner sets private', $pa['status'] === 200 && (data($pa)['is_public'] ?? null) === false, desc($pa));
$pub2 = req('GET', '/groups/public', null, $tc);
check('private room hidden from public list', !in_array($code, array_column((array) (data($pub2)['items'] ?? []), 'code'), true));
$nr = req('POST', "/groups/{$code}/new-round", null, $ta);
check('new round: completions +1, parts reset, takers cleared', $nr['status'] === 200 && (data($nr)['completions'] ?? 0) === 1 && (data($nr)['done_count'] ?? -1) === 0
    && array_sum(array_map(static fn ($p) => count($p['takers']), (array) (data($nr)['parts'] ?? []))) === 0, desc($nr));
req('POST', "/groups/{$code}/parts/7/claim", ['name' => 'بشير'], $tb);
$rel = req('DELETE', "/groups/{$code}/parts/7/claim", null, $tb);
check('release claim', $rel['status'] === 200 && count((array) (data($rel)['parts'][6]['takers'] ?? [1])) === 0, desc($rel));
$lv = req('DELETE', "/groups/{$code}/membership", null, $tb);
$mineB2 = req('GET', '/groups/mine', null, $tb);
check('leave room', $lv['status'] === 200 && !in_array($code, array_column((array) data($mineB2), 'code'), true), desc($lv));
$del = req('DELETE', "/groups/{$code}", null, $ta);
$gone = req('GET', "/groups/{$code}", null, $tb);
check('owner deletes room → then 404', $del['status'] === 200 && $gone['status'] === 404, desc($gone));
$g404 = req('GET', '/groups/0OIL111', null, $tb);
check('invalid code → 404', $g404['status'] === 404, desc($g404));

// ───────────────────────────────────────────────────────────────────────────
section('Support');
$t = req('POST', '/support/tickets', ['subject' => 'مشكلة في الصوت', 'topic' => 'bug', 'body' => 'الصوت لا يعمل في سورة البقرة'], $tb);
$tid = (int) (data($t)['id'] ?? 0);
check('create ticket → 201', $t['status'] === 201 && (data($t)['status'] ?? '') === 'open' && (data($t)['message_count'] ?? 0) === 1, desc($t));
$adm = req('POST', '/auth/login', ['email' => $ADMIN_EMAIL, 'password' => $ADMIN_PW], ['ip' => '10.4.0.1']);
check('admin login', $adm['status'] === 200 && (data($adm)['user']['is_admin'] ?? null) === true && (data($adm)['user']['email_verified'] ?? null) === true, desc($adm));
$tadm = ['token' => (string) (data($adm)['token'] ?? ''), 'ip' => '10.4.0.1'];
$un = req('GET', '/admin/unread', null, $tadm);
check('admin unread count ≥ 1', $un['status'] === 200 && (data($un)['count'] ?? 0) >= 1, desc($un));
$at = req('GET', '/admin/tickets?status=open', null, $tadm);
$row = array_values(array_filter((array) (data($at)['items'] ?? []), static fn ($x) => $x['id'] === $tid))[0] ?? [];
check('admin ticket list includes user + unread', ($row['user']['email'] ?? '') === $B['email'] && ($row['unread'] ?? 0) === 1, desc($at));
$am = req('GET', "/admin/tickets/{$tid}/messages", null, $tadm);
check('admin reads messages', $am['status'] === 200 && count((array) data($am)) === 1 && (data($am)[0]['is_admin'] ?? null) === false, desc($am));
$ar = req('POST', "/admin/tickets/{$tid}/messages", ['body' => 'شكراً، نعمل على حل المشكلة.'], $tadm);
check('admin replies', $ar['status'] === 200 && (data($ar)['is_admin'] ?? null) === true, desc($ar));
$bt = req('GET', '/support/tickets', null, $tb);
check('user sees unread admin reply', ($bt['json']['data'][0]['unread'] ?? 0) === 1 && ($bt['json']['data'][0]['status'] ?? '') === 'pending', desc($bt));
$bm2 = req('GET', "/support/tickets/{$tid}/messages", null, $tb);
$firstId = (int) (data($bm2)[0]['id'] ?? 0);
check('user reads thread (2 messages)', count((array) data($bm2)) === 2 && (data($bm2)[1]['sender_name'] ?? '') === 'فريق الدعم', desc($bm2));
$after = req('GET', "/support/tickets/{$tid}/messages?after_id={$firstId}", null, $tb);
check('after_id filter', count((array) data($after)) === 1, desc($after));
$bt2 = req('GET', '/support/tickets', null, $tb);
check('reading marks admin messages read', ($bt2['json']['data'][0]['unread'] ?? 9) === 0, desc($bt2));
$cOther = req('GET', "/support/tickets/{$tid}/messages", null, $tc);
check("other user can't read the ticket → 404", $cOther['status'] === 404, desc($cOther));
$bp2 = req('POST', "/support/tickets/{$tid}/messages", ['body' => 'جربت مرة أخرى'], $tb);
check('user replies', $bp2['status'] === 200 && (data($bp2)['is_admin'] ?? null) === false, desc($bp2));
$cl2 = req('PATCH', "/admin/tickets/{$tid}", ['status' => 'closed'], $tadm);
check('admin closes ticket', $cl2['status'] === 200 && (data($cl2)['status'] ?? '') === 'closed', desc($cl2));
$closed = req('POST', "/support/tickets/{$tid}/messages", ['body' => 'مرحبا'], $tb);
check('posting on closed ticket → 409 ticket_closed', $closed['status'] === 409 && errc($closed) === 'ticket_closed', desc($closed));

// ───────────────────────────────────────────────────────────────────────────
section('Admin');
$na = req('GET', '/admin/stats', null, $tb);
check('non-admin → 403 on /admin/*', $na['status'] === 403, desc($na));
req('POST', '/presence', ['visitor_id' => 'visitor-' . $run, 'path' => '/'], ['ip' => '10.5.0.1']);
$pr = req('POST', '/presence', ['visitor_id' => 'visitor-b-' . $run, 'path' => '/surah/1'], $tb);
check('presence → {}', $pr['status'] === 200 && $pr['raw'] === '{"ok":true,"data":{}}', desc($pr));
$as = req('GET', '/admin/stats', null, $tadm);
$asd = data($as);
check('admin stats', $as['status'] === 200 && ($asd['users_total'] ?? 0) >= 4 && count((array) ($asd['signups_by_day'] ?? [])) === 14
    && ($asd['online_now']['total'] ?? 0) >= 2 && ($asd['online_now']['signed_in'] ?? 0) >= 1 && isset($asd['ayahs_total'], $asd['tickets_open'], $asd['active_7d']), desc($as));
$au = req('GET', '/admin/users?q=' . urlencode('bashir+' . $run) . '&per_page=5', null, $tadm);
$bRow = data($au)['items'][0] ?? [];
check('admin users search + per_page', $au['status'] === 200 && (data($au)['total'] ?? 0) === 1 && (data($au)['per_page'] ?? 0) === 5 && ($bRow['email'] ?? '') === $B['email']
    && array_key_exists('banned', $bRow) && array_key_exists('last_seen', $bRow) && array_key_exists('ayahs_total', $bRow), desc($au));
$bId = (int) ($bRow['id'] ?? 0);
$adminId = (int) (data($adm)['user']['id'] ?? 0);
$pu = req('PATCH', "/admin/users/{$bId}", ['gender' => 'male'], $tadm);
check('admin PATCH user gender', $pu['status'] === 200 && (data($pu)['gender'] ?? '') === 'male', desc($pu));
$self = req('PATCH', "/admin/users/{$adminId}", ['is_admin' => false], $tadm);
check("admin can't remove own admin", $self['status'] === 403, desc($self));
$mu = req('POST', "/admin/users/{$bId}/message", ['subject' => 'رسالة من الإدارة', 'body' => 'مرحباً بك'], $tadm);
check('admin messages a user (ticket)', $mu['status'] === 201 && (data($mu)['user']['id'] ?? 0) === $bId, desc($mu));
$bc = req('POST', '/admin/broadcasts', ['title' => 'تنبيه', 'body' => 'صيانة مجدولة', 'type' => 'warning'], $tadm);
$bcExp = req('POST', '/admin/broadcasts', ['title' => 'قديم', 'body' => 'منتهي', 'type' => 'info', 'expires_at' => '2020-01-01T00:00:00Z'], $tadm);
$pubB = req('GET', '/broadcasts');
$ids = array_column((array) data($pubB), 'id');
check('broadcast create + public list excludes expired', $bc['status'] === 201 && in_array(data($bc)['id'] ?? -1, $ids, true) && !in_array(data($bcExp)['id'] ?? -1, $ids, true), desc($pubB));
$bdel = req('DELETE', '/admin/broadcasts/' . (int) (data($bc)['id'] ?? 0), null, $tadm);
check('broadcast delete', $bdel['status'] === 200 && !in_array(data($bc)['id'] ?? -1, array_column((array) data(req('GET', '/broadcasts')), 'id'), true), desc($bdel));
$ab = req('GET', '/admin/broadcasts', null, $tadm);
check('admin broadcasts (all)', $ab['status'] === 200 && in_array(data($bcExp)['id'] ?? -1, array_column((array) data($ab), 'id'), true));

section('Admin integrations');
$SECRET = 'sk-ant-test-0123456789-WXYZ';
$ip = req('PUT', '/admin/integrations', ['anthropic_api_key' => $SECRET, 'ai_provider' => 'anthropic', 'mail_from_name' => 'نور القرآن'], $tadm);
$items = [];
foreach ((array) (data($ip)['items'] ?? []) as $it) {
    $items[$it['key']] = $it;
}
check('PUT integrations', $ip['status'] === 200 && ($items['anthropic_api_key']['set'] ?? null) === true && ($items['anthropic_api_key']['secret'] ?? null) === true);
check('secret never returned; masked preview of last 4', !str_contains($ip['raw'], $SECRET) && !array_key_exists('value', $items['anthropic_api_key'] ?? ['value' => 1])
    && str_ends_with((string) ($items['anthropic_api_key']['preview'] ?? ''), 'WXYZ'), json_encode($items['anthropic_api_key'] ?? null, JSON_UNESCAPED_UNICODE));
check('non-secret returns value + Arabic label', ($items['ai_provider']['value'] ?? '') === 'anthropic' && ($items['mail_from_name']['value'] ?? '') === 'نور القرآن' && preg_match('/\p{Arabic}/u', (string) ($items['ai_provider']['label'] ?? '')) === 1);
$ig = req('GET', '/admin/integrations', null, $tadm);
check('GET integrations hides secret', $ig['status'] === 200 && !str_contains($ig['raw'], $SECRET));
if (pdo()) {
    $enc = (string) pdo()->query("SELECT value_encrypted FROM integrations WHERE name = 'anthropic_api_key'")->fetchColumn();
    check('secret encrypted at rest (AES-GCM blob)', $enc !== '' && !str_contains($enc, 'sk-ant') && strlen((string) base64_decode($enc, true)) >= 28 + strlen($SECRET));
}
$iu = req('PUT', '/admin/integrations', ['nope' => 'x'], $tadm);
check('unknown integration key → 422', $iu['status'] === 422, desc($iu));
$ib = req('PUT', '/admin/integrations', ['ai_provider' => 'gemini'], $tadm);
check('bad ai_provider → 422', $ib['status'] === 422, desc($ib));
$ai = req('POST', '/ai/chat', ['messages' => [['role' => 'user', 'content' => 'ما معنى الفاتحة؟']], 'context' => ['surah' => 1, 'ayah' => 1, 'text' => 'بسم الله الرحمن الرحيم']], $ta);
check('AI chat with an invalid key → friendly 502 ai_error, no key leak', $ai['status'] === 502 && errc($ai) === 'ai_error' && !str_contains($ai['raw'], $SECRET) && preg_match('/\p{Arabic}/u', (string) ($ai['json']['error']['message'] ?? '')) === 1, desc($ai));
$aiv = req('POST', '/ai/chat', ['messages' => array_fill(0, 13, ['role' => 'user', 'content' => 'x'])], $ta);
check('AI chat > 12 messages → 422', $aiv['status'] === 422, desc($aiv));
$t1 = req('POST', '/admin/integrations/test', ['target' => 'ai'], $tadm);
check('integration test ai → {ok:false, message}', $t1['status'] === 200 && (data($t1)['ok'] ?? null) === false && is_string(data($t1)['message'] ?? null), desc($t1));
req('PUT', '/admin/integrations', ['anthropic_api_key' => ''], $tadm);
$ai2 = req('POST', '/ai/chat', ['messages' => [['role' => 'user', 'content' => 'سؤال']]], $ta);
check('AI chat without key → 503 ai_not_configured', $ai2['status'] === 503 && errc($ai2) === 'ai_not_configured', desc($ai2));
$tm = req('POST', '/admin/integrations/test', ['target' => 'mail'], $tadm);
check('integration test mail', $tm['status'] === 200 && (data($tm)['ok'] ?? null) === ($LOCAL !== null ? true : (data($tm)['ok'] ?? null)), desc($tm));
$tg = req('POST', '/admin/integrations/test', ['target' => 'google'], $tadm);
check('integration test google without keys → ok:false', $tg['status'] === 200 && (data($tg)['ok'] ?? null) === false, desc($tg));
req('PUT', '/admin/integrations', ['google_client_id' => 'test-client.apps.googleusercontent.com', 'google_client_secret' => 'GOCSPX-test-secret-abcd'], $tadm);
check('settings/public google_login true when configured', (data(req('GET', '/settings/public'))['google_login'] ?? null) === true);
$gs = req('GET', '/auth/google/start?next=/dashboard&client=web');
$loc = hdr($gs, 'location');
check('google start → 302 accounts.google.com with state + redirect_uri + scope', $gs['status'] === 302 && str_starts_with($loc, 'https://accounts.google.com/o/oauth2/v2/auth?')
    && str_contains($loc, 'state=') && str_contains($loc, urlencode('/v1/auth/google/callback')) && str_contains($loc, 'scope=openid+email+profile'), $loc);
$gcb = req('GET', '/auth/google/callback?state=' . str_repeat('0', 64) . '&code=abc');
check('google callback with bad state → error redirect (reason=failed)', $gcb['status'] === 302 && str_contains(hdr($gcb, 'location'), '/auth/callback?status=error&reason=failed'), hdr($gcb, 'location'));
preg_match('/state=([a-f0-9]{64})/', $loc, $sm);
$gcb2 = req('GET', '/auth/google/callback?state=' . ($sm[1] ?? '') . '&error=access_denied', null, ['cookie' => 'nq_oauth=' . ($sm[1] ?? '')]);
check('google callback user cancelled → reason=cancelled', str_contains(hdr($gcb2, 'location'), 'reason=cancelled'), hdr($gcb2, 'location'));
req('PUT', '/admin/integrations', ['google_client_id' => '', 'google_client_secret' => ''], $tadm);

section('Admin settings, feature flags, maintenance');
$f1 = req('PUT', '/admin/settings', ['features' => ['ai_assistant' => false]], $tadm);
check('PUT settings features subset merges', $f1['status'] === 200 && (data($f1)['features']['ai_assistant'] ?? null) === false && (data($f1)['features']['hifz'] ?? null) === true, desc($f1));
$aiOff = req('POST', '/ai/chat', ['messages' => [['role' => 'user', 'content' => 'سؤال']]], $ta);
check('ai_assistant off → 403 feature_disabled', $aiOff['status'] === 403 && errc($aiOff) === 'feature_disabled', desc($aiOff));
req('PUT', '/admin/settings', ['features' => ['khatma_group' => false, 'leaderboard' => false]], $tadm);
$grOff = req('GET', '/groups/mine', null, $ta);
$lbOff = req('GET', '/leaderboard');
check('khatma_group / leaderboard off → 403 feature_disabled', $grOff['status'] === 403 && errc($grOff) === 'feature_disabled' && $lbOff['status'] === 403, desc($grOff));
$fAll = req('PUT', '/admin/settings', ['features' => array_fill_keys(['hifz', 'khatma', 'khatma_group', 'leaderboard', 'ijaza', 'ai_assistant', 'notes', 'search'], true), 'app_name' => 'نور القرآن', 'announcement' => 'أهلاً'], $tadm);
check('features restored (whole object)', !in_array(false, (array) (data($fAll)['features'] ?? [false]), true) && (data($fAll)['announcement'] ?? '') === 'أهلاً', desc($fAll));
$badSet = req('PUT', '/admin/settings', ['features' => ['made_up' => true]], $tadm);
check('unknown feature → 422', $badSet['status'] === 422, desc($badSet));
req('PUT', '/admin/settings', ['maintenance_mode' => true], $tadm);
$mt = req('GET', '/me/bookmarks', null, $ta);
check('maintenance → 503 for non-admin', $mt['status'] === 503 && errc($mt) === 'maintenance', desc($mt));
$mtp = req('GET', '/settings/public');
check('maintenance: /settings/public still works', $mtp['status'] === 200 && (data($mtp)['maintenance_mode'] ?? null) === true, desc($mtp));
check('maintenance: /auth/me still works', req('GET', '/auth/me', null, $ta)['status'] === 200);
check('maintenance: admin passes', req('GET', '/me/bookmarks', null, $tadm)['status'] === 200);
req('PUT', '/admin/settings', ['maintenance_mode' => false, 'allow_signup' => false], $tadm);
$sc = req('POST', '/auth/signup', ['name' => 'x', 'email' => "closed{$run}@example.com", 'password' => 'password-123'], ['ip' => '10.6.0.1']);
check('allow_signup off → 403 signup_closed', $sc['status'] === 403 && errc($sc) === 'signup_closed', desc($sc));
req('PUT', '/admin/settings', ['allow_signup' => true], $tadm);

section('Bans');
$cRow = data(req('GET', '/admin/users?q=' . urlencode('chafiq+' . $run), null, $tadm))['items'][0] ?? [];
$cId = (int) ($cRow['id'] ?? 0);
$ban = req('POST', "/admin/users/{$cId}/ban", ['scope' => 'app', 'reason' => 'إساءة', 'until' => null], $tadm);
check('ban user', $ban['status'] === 200, desc($ban));
$cMe = req('GET', '/auth/me', null, $tc);
check('banned user sessions revoked → 401', $cMe['status'] === 401, desc($cMe));
$cLogin = req('POST', '/auth/login', ['email' => $C['email'], 'password' => $C['pw']], ['ip' => $C['ip']]);
check('banned user cannot log in → 403 banned', $cLogin['status'] === 403 && errc($cLogin) === 'banned', desc($cLogin));
$bl = req('GET', '/admin/users?filter=banned', null, $tadm);
$bRow2 = array_values(array_filter((array) (data($bl)['items'] ?? []), static fn ($u) => $u['id'] === $cId))[0] ?? [];
check('admin users filter=banned shows ban_reason', ($bRow2['banned'] ?? null) === true && ($bRow2['ban_reason'] ?? '') === 'إساءة' && $bRow2['banned_until'] === null, desc($bl));
req('DELETE', "/admin/users/{$cId}/ban", null, $tadm);
$cLogin2 = req('POST', '/auth/login', ['email' => $C['email'], 'password' => $C['pw']], ['ip' => $C['ip']]);
check('unban → login works', $cLogin2['status'] === 200, desc($cLogin2));
$until = gmdate('Y-m-d\TH:i:s\Z', time() + 3 * 86400);
req('POST', "/admin/users/{$cId}/ban", ['scope' => 'app', 'reason' => 'مؤقت', 'until' => $until], $tadm);
$bl2 = req('GET', '/admin/users?filter=banned', null, $tadm);
$bRow3 = array_values(array_filter((array) (data($bl2)['items'] ?? []), static fn ($u) => $u['id'] === $cId))[0] ?? [];
check('temporary ban with ISO until', ($bRow3['banned_until'] ?? '') === $until, json_encode($bRow3, JSON_UNESCAPED_UNICODE));
req('DELETE', "/admin/users/{$cId}/ban", null, $tadm);

// ───────────────────────────────────────────────────────────────────────────
section('Leaderboard');
$lb = req('GET', '/leaderboard?type=reading&period=all', null, $ta);
check('opted-out user hidden', $lb['status'] === 200 && !in_array(true, array_column((array) data($lb), 'is_me'), true), desc($lb));
$prof = req('PATCH', '/auth/profile', ['show_on_leaderboard' => true, 'name' => 'عائشة م.'], $ta);
check('PATCH profile', $prof['status'] === 200 && (data($prof)['user']['show_on_leaderboard'] ?? null) === true && (data($prof)['user']['name'] ?? '') === 'عائشة م.', desc($prof));
$lb2 = req('GET', '/leaderboard?type=reading&period=week', null, $ta);
$mine = array_values(array_filter((array) data($lb2), static fn ($x) => $x['is_me']))[0] ?? [];
check('opted-in user listed with name only (no email)', ($mine['name'] ?? '') === 'عائشة م.' && ($mine['score'] ?? 0) >= 4 && ($mine['rank'] ?? 0) >= 1 && !str_contains($lb2['raw'], '@'), desc($lb2));
$lbh = req('GET', '/leaderboard?type=hifz', null, $ta);
check('hifz leaderboard uses derived count', (array_values(array_filter((array) data($lbh), static fn ($x) => $x['is_me']))[0]['score'] ?? 0) === 2, desc($lbh));
$lbk = req('GET', '/leaderboard?type=khatma&period=month', null, $ta);
check('khatma leaderboard', (array_values(array_filter((array) data($lbk), static fn ($x) => $x['is_me']))[0]['score'] ?? 0) === 1, desc($lbk));
$lbx = req('GET', '/leaderboard?type=nope');
check('bad leaderboard type → 422', $lbx['status'] === 422, desc($lbx));

// ───────────────────────────────────────────────────────────────────────────
section('Export, passwords, deletion');
$ex = req('GET', '/auth/export', null, $ta);
$exd = data($ex);
check('export returns all data as a download', $ex['status'] === 200 && str_contains(hdr($ex, 'content-disposition'), 'attachment')
    && count((array) ($exd['bookmarks'] ?? [])) === 1 && count((array) ($exd['notes'] ?? [])) === 1 && count((array) ($exd['reading_log'] ?? [])) >= 4
    && isset($exd['hifz']['data']) && count((array) ($exd['khatmat'] ?? [])) === 1 && ($exd['user']['email'] ?? '') === $A['email'], desc($ex));
$second = data(req('POST', '/auth/login', ['email' => $A['email'], 'password' => $A['pw']], ['ip' => $A['ip']]))['token'] ?? '';
$cpw = req('POST', '/auth/change-password', ['current_password' => 'not-it-123', 'new_password' => 'alice-pass-2'], $ta);
check('change-password wrong current → 422 validation (fields.current_password)', $cpw['status'] === 422 && errc($cpw) === 'validation' && isset($cpw['json']['error']['fields']['current_password']), desc($cpw));
$cp = req('POST', '/auth/change-password', ['current_password' => $A['pw'], 'new_password' => 'alice-pass-2'], $ta);
check('change-password ok; other sessions revoked, current kept', $cp['status'] === 200 && req('GET', '/auth/me', null, ['token' => $second])['status'] === 401
    && req('GET', '/auth/me', null, $ta)['status'] === 200, desc($cp));
$A['pw'] = 'alice-pass-2';
if ($LOCAL !== null) {
    $fp = req('POST', '/auth/forgot-password', ['email' => $A['email']], ['ip' => '10.7.0.1']);
    $fp2 = req('POST', '/auth/forgot-password', ['email' => "nobody{$run}@example.com"], ['ip' => '10.7.0.1']);
    check('forgot-password → {} for known and unknown emails', $fp['status'] === 200 && $fp2['status'] === 200 && $fp['raw'] === $fp2['raw'], desc($fp2));
    $rt = mailToken($A['email'], 'reset');
    $rp = req('POST', '/auth/reset-password', ['token' => (string) $rt, 'password' => 'alice-pass-3'], ['ip' => '10.7.0.1']);
    check('reset-password → {} and revokes all sessions', $rp['status'] === 200 && req('GET', '/auth/me', null, $ta)['status'] === 401, desc($rp));
    $rp2 = req('POST', '/auth/reset-password', ['token' => (string) $rt, 'password' => 'alice-pass-4'], ['ip' => '10.7.0.1']);
    check('reset token single-use → 422 invalid_token', $rp2['status'] === 422 && errc($rp2) === 'invalid_token', desc($rp2));
    $A['pw'] = 'alice-pass-3';
    $li2 = req('POST', '/auth/login', ['email' => $A['email'], 'password' => $A['pw']], ['ip' => $A['ip']]);
    check('login with new password', $li2['status'] === 200, desc($li2));
    $ta['token'] = (string) (data($li2)['token'] ?? '');
}

$D = ['email' => "dana+{$run}@example.com", 'pw' => 'dana-pass-12', 'ip' => '10.8.0.1'];
$dSu = req('POST', '/auth/signup', ['name' => 'دانة', 'email' => $D['email'], 'password' => $D['pw']], ['ip' => $D['ip']]);
$td = ['token' => (string) (data($dSu)['token'] ?? ''), 'ip' => $D['ip']];
$dId = (int) (data($dSu)['user']['id'] ?? 0);
req('POST', '/me/bookmarks', ['surah' => 36, 'ayah' => 1], $td);
req('PUT', '/me/notes/36/1', ['text' => 'يس'], $td);
$dRoom = (string) (data(req('POST', '/groups', ['deceased_name' => 'جد', 'mode' => 'juz', 'is_public' => true], $td))['code'] ?? '');
req('GET', "/groups/{$dRoom}", null, $tb);
req('POST', "/groups/{$dRoom}/parts/1/claim", ['name' => 'بشير'], $tb);
req('POST', '/support/tickets', ['subject' => 'سؤال', 'topic' => 'general', 'body' => 'نص'], $td);
$dWrong = req('DELETE', '/auth/account', ['password' => 'nope-nope-1'], $td);
check('delete account wrong password → 422 validation (fields.password)', $dWrong['status'] === 422 && isset($dWrong['json']['error']['fields']['password']), desc($dWrong));
$dDel = req('DELETE', '/auth/account', ['password' => $D['pw']], $td);
check('delete account → {}', $dDel['status'] === 200, desc($dDel));
check('deleted user cannot log in', req('POST', '/auth/login', ['email' => $D['email'], 'password' => $D['pw']], ['ip' => $D['ip']])['status'] === 401);
check("deleted user's room is gone", req('GET', "/groups/{$dRoom}", null, $tb)['status'] === 404);
if (pdo()) {
    $left = 0;
    foreach (['sessions', 'bookmarks', 'notes', 'support_tickets', 'group_rooms' => 'owner_id', 'email_tokens'] as $k => $v) {
        [$tbl, $col] = is_int($k) ? [$v, 'user_id'] : [$k, $v];
        $left += (int) pdo()->query("SELECT COUNT(*) FROM {$tbl} WHERE {$col} = {$dId}")->fetchColumn();
    }
    $left += (int) pdo()->query('SELECT COUNT(*) FROM group_takers WHERE room_code = ' . pdo()->quote($dRoom))->fetchColumn();
    check('account deletion removed every owned row (cascade)', $left === 0, (string) $left);
}
$log = req('GET', '/admin/log?per_page=100', null, $tadm);
$actions = array_column((array) (data($log)['items'] ?? []), 'action');
check('admin log records actions (who/what/when)', $log['status'] === 200 && in_array('user.ban', $actions, true) && in_array('settings.update', $actions, true)
    && in_array('integrations.update', $actions, true) && (data($log)['items'][0]['admin_email'] ?? '') === $ADMIN_EMAIL, desc($log));
check('admin log never stores secret values', !str_contains($log['raw'], $SECRET));

// ───────────────────────────────────────────────────────────────────────────
section('Rate limiting');
$codes = [];
for ($i = 0; $i < 11; $i++) {
    $codes[] = req('POST', '/auth/login', ['email' => "rl{$i}{$run}@example.com", 'password' => 'wrong-pass-1'], ['ip' => '10.99.0.' . random_int(2, 250)])['status'];
}
check('(sanity) different IPs are not limited', !in_array(429, $codes, true), implode(',', $codes));
$codes = [];
$last = null;
for ($i = 0; $i < 11; $i++) {
    $last = req('POST', '/auth/login', ['email' => "rl{$i}{$run}@example.com", 'password' => 'wrong-pass-1'], ['ip' => '10.98.0.1']);
    $codes[] = $last['status'];
}
check('login rate limit: 11th attempt from one IP → 429 + Retry-After', $codes[10] === 429 && !in_array(429, array_slice($codes, 0, 10), true)
    && (int) hdr($last, 'retry-after') > 0 && errc($last) === 'rate_limited', implode(',', $codes));

echo "\n==== {$pass} passed, {$fail} failed ====\n";
if ($fail > 0) {
    echo "Failed:\n  - " . implode("\n  - ", $failures) . "\n";
}
exit($fail > 0 ? 1 : 0);
