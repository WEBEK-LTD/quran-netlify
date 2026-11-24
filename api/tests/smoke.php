<?php
declare(strict_types=1);

/**
 * End-to-end smoke test against a running server.
 *
 *   php api/tests/smoke.php --base=http://127.0.0.1:8080 \
 *       [--install --db-name=nq_test --db-user=nq --db-pass=secret] \
 *       [--local=/path/to/api]   # local only: patch config.php for testing, read the mail log, inspect the DB
 *
 *       [--fake-upstream=http://127.0.0.1:8081]   # local only: tests/fake-upstream.php serving the riwayat + radio upstreams
 *
 * --local patches config.php after install: cookie_domain '', trust_proxy true (so each test actor
 * gets its own IP via X-Forwarded-For), mail_transport 'log'. Never use --local against production.
 */

$opt = getopt('', ['base:', 'install', 'db-name:', 'db-user:', 'db-pass:', 'local:', 'fake-upstream:']);
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
 * @param array<string,mixed> $o token, ip, client(bool|string), headers, cookie, raw, multipart
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
    if (isset($o['multipart'])) {
        $payload = $o['multipart']; // array of fields / CURLStringFile; curl writes the boundary
        $h[] = 'Expect:';
    } elseif (isset($o['raw'])) {
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

/** All logged emails to an address whose subject contains $needle (local mode). @return list<array<string,mixed>> */
function mails(string $to, string $needle = ''): array
{
    global $LOCAL;
    $file = $LOCAL . '/storage/mail/mail.log';
    $out = [];
    foreach (is_file($file) ? (file($file) ?: []) : [] as $line) {
        $m = json_decode($line, true);
        if (($m['to'] ?? '') === $to && ($needle === '' || str_contains((string) ($m['subject'] ?? ''), $needle))) {
            $out[] = $m;
        }
    }
    return $out;
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

/** A PNG of $w×$h made with GD, optionally with a tEXt metadata chunk (to prove re-encoding drops it). */
function makePng(int $w, int $h, string $meta = ''): string
{
    $im = imagecreatetruecolor($w, $h);
    imagefill($im, 0, 0, imagecolorallocate($im, 20, 120, 90));
    imagefilledrectangle($im, intdiv($w, 4), intdiv($h, 4), intdiv($w * 3, 4), intdiv($h * 3, 4), imagecolorallocate($im, 214, 178, 103));
    ob_start();
    imagepng($im);
    $png = (string) ob_get_clean();
    if ($meta !== '') {
        $data = "Comment\0" . $meta;
        $chunk = pack('N', strlen($data)) . 'tEXt' . $data . pack('N', crc32('tEXt' . $data));
        $png = substr($png, 0, 33) . $chunk . substr($png, 33); // right after IHDR
    }
    return $png;
}

/** POST /me/avatar with one file in the `photo` field. */
function uploadPhoto(string $bytes, string $name, string $mime, array $o): array
{
    return req('POST', '/me/avatar', null, $o + ['multipart' => ['photo' => new CURLStringFile($bytes, $name, $mime)]]);
}

/** Whether a stored photo exists on disk (local mode; bypasses PHP's stat cache). */
function photoOnDisk(string $file): bool
{
    global $LOCAL;
    clearstatcache();
    return $LOCAL !== null && $file !== '' && is_file($LOCAL . '/storage/avatars/' . $file);
}

/** Path part of an avatar URL → the file name. */
function avatarFile(?string $url): string
{
    return $url !== null && preg_match('#/v1/avatars/([^/?]+)$#', $url, $m) ? $m[1] : '';
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
section('Profile photo');
$meA = data(req('GET', '/auth/me', null, $ta));
check('no photo yet → avatar_url null', array_key_exists('avatar_url', (array) ($meA['user'] ?? [])) && $meA['user']['avatar_url'] === null, json_encode($meA));
$png = makePng(300, 200, 'SECRET-META-' . $run);
$noAuth = uploadPhoto($png, 'me.png', 'image/png', ['ip' => '10.1.0.9']);
check('upload without session → 401', $noAuth['status'] === 401, desc($noAuth));
$noCsrf = uploadPhoto($png, 'me.png', 'image/png', $ta + ['client' => false]);
check('upload without X-NQ-Client → 403', $noCsrf['status'] === 403, desc($noCsrf));
$up = uploadPhoto($png, 'me.png', 'image/png', $ta);
if ($up['status'] === 503 && errc($up) === 'avatar_unavailable') {
    check('server without GD → 503 with the Arabic message', str_contains((string) ($up['json']['error']['message'] ?? ''), 'رفع الصور غير متاح'), desc($up));
    echo "  (GD missing on this server — remaining photo checks skipped)\n";
} else {
    $url = (string) (data($up)['user']['avatar_url'] ?? '');
    $file = avatarFile($url);
    check('upload PNG → {user} with absolute avatar URL', $up['status'] === 200 && str_starts_with($url, $BASE . '/v1/avatars/')
        && preg_match('/^\d+-[a-f0-9]{24}\.(webp|jpg)$/', $file) === 1, desc($up));
    $meU = data(req('GET', '/auth/me', null, $ta));
    check('/auth/me returns the photo URL', ($meU['user']['avatar_url'] ?? '') === $url, json_encode($meU));
    $img = req('GET', $url, null, ['client' => false]);
    $dim = @getimagesizefromstring($img['raw']);
    check('GET photo → image/webp or image/jpeg, 512×512, raw bytes (no JSON)', $img['status'] === 200
        && in_array(hdr($img, 'content-type'), ['image/webp', 'image/jpeg'], true)
        && is_array($dim) && $dim[0] === 512 && $dim[1] === 512, desc($img) . ' ' . hdr($img, 'content-type'));
    check('photo headers: immutable cache, nosniff, CSP none, CORP cross-origin', str_contains(hdr($img, 'cache-control'), 'max-age=31536000')
        && str_contains(hdr($img, 'cache-control'), 'immutable') && hdr($img, 'x-content-type-options') === 'nosniff'
        && str_contains(hdr($img, 'content-security-policy'), "default-src 'none'") && hdr($img, 'cross-origin-resource-policy') === 'cross-origin',
        json_encode($img['headers']));
    check('re-encoded: original bytes and metadata are not kept', !str_contains($img['raw'], 'SECRET-META') && $img['raw'] !== $png);
    if ($LOCAL !== null) {
        check('stored outside the web root in storage/avatars', photoOnDisk($file) && !is_file($LOCAL . '/public/' . $file));
    }

    $php = uploadPhoto("<?php echo 'pwned'; ?>", 'shell.jpg', 'image/jpeg', $ta);
    check('PHP file renamed .jpg → 422 unsupported_image', $php['status'] === 422 && errc($php) === 'unsupported_image', desc($php));
    $svg = uploadPhoto('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>', 'x.svg', 'image/svg+xml', $ta);
    check('SVG → 422 unsupported_image', $svg['status'] === 422 && errc($svg) === 'unsupported_image', desc($svg));
    $fake = uploadPhoto("\xFF\xD8\xFF\xE0" . str_repeat('A', 2000) . '<?php system($_GET[1]); ?>', 'a.jpg', 'image/jpeg', $ta);
    check('JPEG magic bytes + garbage → 422', $fake['status'] === 422 && errc($fake) === 'unsupported_image', desc($fake));
    $tiny = uploadPhoto(makePng(32, 32), 'tiny.png', 'image/png', $ta);
    check('image smaller than 64×64 → 422 image_dimensions', $tiny['status'] === 422 && errc($tiny) === 'image_dimensions', desc($tiny));
    $huge = uploadPhoto(random_bytes(6 * 1024 * 1024), 'big.jpg', 'image/jpeg', $ta);
    check('upload > 5 MB → 413 avatar_too_large', $huge['status'] === 413 && errc($huge) === 'avatar_too_large', desc($huge));
    $over = uploadPhoto("\x89PNG\r\n\x1A\n" . random_bytes(5 * 1024 * 1024 + 1000), 'big.png', 'image/png', $ta);
    check('file just over 5 MB (request under the route limit) → 413', $over['status'] === 413 && errc($over) === 'avatar_too_large', desc($over));
    $nofile = req('POST', '/me/avatar', null, $ta + ['multipart' => ['other' => 'x']]);
    check('multipart without `photo` → 422 validation (fields.photo)', $nofile['status'] === 422 && isset($nofile['json']['error']['fields']['photo']), desc($nofile));
    $json = req('POST', '/me/avatar', ['photo' => 'data:image/png;base64,AAAA'], $ta);
    check('JSON body instead of multipart → 422', $json['status'] === 422, desc($json));
    $jsonBig = req('POST', '/me/bookmarks', null, $ta + ['multipart' => ['photo' => new CURLStringFile(random_bytes(100000), 'a.png', 'image/png')]]);
    check('the 5 MB allowance is only for /me/avatar (other routes keep 64 KB → 413)', $jsonBig['status'] === 413, desc($jsonBig));
    $trav = req('GET', '/avatars/..%2F..%2Fconfig.php', null, ['client' => false]);
    $other = req('GET', '/avatars/1-' . str_repeat('0', 24) . '.webp', null, ['client' => false]);
    check('serving: bad or unknown file names → 404', $trav['status'] === 404 && $other['status'] === 404 && !str_contains($trav['raw'], 'app_key'), desc($trav) . ' / ' . desc($other));

    $gif = imagecreatetruecolor(120, 90);
    ob_start();
    imagegif($gif);
    $gifBytes = (string) ob_get_clean();
    $up2 = uploadPhoto($gifBytes, 'anim.gif', 'image/gif', $ta);
    $url2 = (string) (data($up2)['user']['avatar_url'] ?? '');
    check('replace with a GIF → new URL', $up2['status'] === 200 && $url2 !== '' && $url2 !== $url, desc($up2));
    check('previous photo is deleted on replace', req('GET', $url, null, ['client' => false])['status'] === 404
        && !photoOnDisk($file));
    if (function_exists('imagewebp')) {
        $wi = imagecreatetruecolor(800, 1200);
        ob_start();
        imagewebp($wi);
        $up3 = uploadPhoto((string) ob_get_clean(), 'tall.webp', 'image/webp', $ta);
        $url3 = (string) (data($up3)['user']['avatar_url'] ?? '');
        $d3 = @getimagesizefromstring(req('GET', $url3, null, ['client' => false])['raw']);
        check('WebP upload (tall) → centre-cropped 512×512', $up3['status'] === 200 && is_array($d3) && $d3[0] === 512 && $d3[1] === 512, desc($up3));
        $url2 = $url3;
    }
    $exP = data(req('GET', '/auth/export', null, $ta));
    check('data export includes the photo URL', ($exP['profile_photo_url'] ?? '') === $url2 && ($exP['user']['avatar_url'] ?? '') === $url2);
    $del = req('DELETE', '/me/avatar', null, $ta);
    check('DELETE /me/avatar → user.avatar_url null', $del['status'] === 200 && array_key_exists('avatar_url', (array) (data($del)['user'] ?? []))
        && data($del)['user']['avatar_url'] === null, desc($del));
    check('deleted photo is gone (404, file removed)', req('GET', $url2, null, ['client' => false])['status'] === 404
        && !photoOnDisk(avatarFile($url2)));
    $del2 = req('DELETE', '/me/avatar', null, $ta);
    check('DELETE again is harmless', $del2['status'] === 200, desc($del2));
    if (pdo()) {
        $gid = (int) ($meA['user']['id'] ?? 0);
        pdo()->exec("UPDATE users SET avatar_url = 'https://lh3.googleusercontent.com/a/test' WHERE id = {$gid}");
        $g1 = data(uploadPhoto($png, 'me.png', 'image/png', $ta));
        $gUp = (string) ($g1['user']['avatar_url'] ?? '');
        $g2 = data(req('DELETE', '/me/avatar', null, $ta));
        check('uploaded photo wins over the Google picture; removing it falls back to Google', str_contains($gUp, '/v1/avatars/')
            && ($g2['user']['avatar_url'] ?? '') === 'https://lh3.googleusercontent.com/a/test', $gUp . ' / ' . json_encode($g2));
        pdo()->exec("UPDATE users SET avatar_url = NULL WHERE id = {$gid}");
    }

    $P = ['email' => "photo+{$run}@example.com", 'pw' => 'photo-pass-12', 'ip' => '10.12.0.1'];
    $tp = ['token' => (string) (data(req('POST', '/auth/signup', ['name' => 'صورة', 'email' => $P['email'], 'password' => $P['pw']], ['ip' => $P['ip']]))['token'] ?? ''), 'ip' => $P['ip']];
    $small = makePng(80, 80);
    $codes = [];
    for ($i = 0; $i < 11; $i++) {
        $codes[] = uploadPhoto($small, 'p.png', 'image/png', $tp)['status'];
    }
    check('upload rate limit: 11th upload in an hour → 429', $codes[10] === 429 && !in_array(429, array_slice($codes, 0, 10), true), implode(',', $codes));
    if ($LOCAL !== null) {
        $pMe = data(req('GET', '/auth/me', null, $tp))['user'] ?? [];
        clearstatcache();
        $onDisk = array_map('basename', glob($LOCAL . '/storage/avatars/' . (int) ($pMe['id'] ?? 0) . '-*') ?: []);
        check('only the latest photo is kept on disk', $onDisk === [avatarFile($pMe['avatar_url'] ?? null)], implode(',', $onDisk));
    }
}

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
$ar2 = req('POST', "/admin/tickets/{$tid}/messages", ['body' => 'هل تم حل المشكلة؟ <b>x</b>'], $tadm);
if ($LOCAL !== null) {
    $notices = mails($B['email'], 'فريق الدعم');
    check('admin replies email the user at most once per ticket per 10 minutes', $ar2['status'] === 200 && count($notices) === 1
        && str_contains((string) ($notices[0]['text'] ?? ''), '/support'), count($notices) . ' ' . desc($ar2));
}
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
$bad = 0;
foreach ([['mail_transport' => 'pigeon'], ['smtp_host' => 'mail example.com'], ['smtp_host' => 'https://mail.example.com'], ['smtp_port' => '70000'],
          ['smtp_port' => '0'], ['smtp_port' => 'abc'], ['smtp_encryption' => 'starttls']] as $badSmtp) {
    $bad += req('PUT', '/admin/integrations', $badSmtp, $tadm)['status'] === 422 ? 1 : 0;
}
check('invalid SMTP settings → 422 (transport, host, port, encryption)', $bad === 7, (string) $bad);
$SMTP_PW = 'smtp-Secret-pass-9876';
$is = req('PUT', '/admin/integrations', ['mail_transport' => 'smtp', 'smtp_host' => '127.0.0.1', 'smtp_port' => '9', 'smtp_encryption' => 'ssl',
    'smtp_username' => 'no-reply@example.com', 'smtp_password' => $SMTP_PW], $tadm);
$sItems = [];
foreach ((array) (data($is)['items'] ?? []) as $it) {
    $sItems[$it['key']] = $it;
}
check('SMTP settings saved; password is a secret (never returned)', $is['status'] === 200 && ($sItems['smtp_port']['value'] ?? '') === '9'
    && ($sItems['smtp_password']['secret'] ?? null) === true && ($sItems['smtp_password']['set'] ?? null) === true && !str_contains($is['raw'], $SMTP_PW), desc($is));
if ($LOCAL !== null) {
    $tl = req('POST', '/admin/integrations/test', ['target' => 'mail'], $tadm);
    check("config mail_transport 'log' keeps priority over SMTP", (data($tl)['ok'] ?? null) === true, desc($tl));
}
req('PUT', '/admin/integrations', ['mail_transport' => '', 'smtp_host' => '', 'smtp_port' => '', 'smtp_encryption' => '', 'smtp_username' => '', 'smtp_password' => ''], $tadm);
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
    $aMails = mails($A['email']);
    $notice = mails($A['email'], 'تم تغيير كلمة المرور');
    check('welcome email once after verification; password-changed notice after change + reset (no token inside)',
        count(mails($A['email'], 'أهلاً بك')) === 1 && count($notice) === 2
        && !preg_match('/[a-f0-9]{64}/', (string) ($notice[0]['text'] ?? '') . ($notice[1]['text'] ?? '')), count($aMails) . ' mails');
    $ta['token'] = (string) (data($li2)['token'] ?? '');
}

section('Email language');
$E = ['email' => "emre+{$run}@example.com", 'pw' => 'emre-pass-123', 'ip' => '10.11.0.1'];
$badLang = req('POST', '/auth/signup', ['name' => 'Emre', 'email' => $E['email'], 'password' => $E['pw'], 'lang' => 'xx'], ['ip' => $E['ip']]);
check('signup with unknown lang → 422', $badLang['status'] === 422 && isset($badLang['json']['error']['fields']['lang']), desc($badLang));
$eSu = req('POST', '/auth/signup', ['name' => 'Emre', 'email' => $E['email'], 'password' => $E['pw'], 'lang' => 'en'], ['ip' => $E['ip']]);
$te = ['token' => (string) (data($eSu)['token'] ?? ''), 'ip' => $E['ip']];
check('signup stores lang (User.lang)', $eSu['status'] === 201 && (data($eSu)['user']['lang'] ?? '') === 'en' && (data($su)['user']['lang'] ?? '') === 'ar', desc($eSu));
if ($LOCAL !== null) {
    $ev = mails($E['email']);
    check('verification email follows the user language (en subject)', count($ev) === 1 && str_starts_with((string) $ev[0]['subject'], 'Confirm your email')
        && str_contains((string) $ev[0]['text'], 'Assalamu alaikum') && (string) ($ev[0]['lang'] ?? '') === 'en', json_encode($ev[0] ?? null, JSON_UNESCAPED_UNICODE));
}
$pl = req('PATCH', '/auth/profile', ['lang' => 'fr'], $te);
$plBad = req('PATCH', '/auth/profile', ['lang' => 'de'], $te);
check('PATCH profile updates lang; unknown lang → 422', (data($pl)['user']['lang'] ?? '') === 'fr' && $plBad['status'] === 422, desc($pl));
$eLogin = req('POST', '/auth/login', ['email' => $E['email'], 'password' => $E['pw'], 'lang' => 'id'], ['ip' => $E['ip']]);
check('login with another lang updates the stored lang', (data($eLogin)['user']['lang'] ?? '') === 'id'
    && (data(req('GET', '/auth/me', null, ['token' => (string) (data($eLogin)['token'] ?? ''), 'ip' => $E['ip']]))['user']['lang'] ?? '') === 'id', desc($eLogin));
if ($LOCAL !== null) {
    req('POST', '/auth/forgot-password', ['email' => $E['email'], 'lang' => 'tr'], ['ip' => '10.11.0.2']);
    req('POST', '/auth/forgot-password', ['email' => $E['email']], ['ip' => '10.11.0.3']);
    $er = mails($E['email'], '— Nur Al-');
    $subjects = array_map(static fn (array $m): string => (string) $m['subject'], $er);
    check('reset email uses the request lang, else the account lang (tr, then id)', in_array('Şifrenizi sıfırlayın — Nur Al-Kuran', $subjects, true)
        && in_array('Atur ulang kata sandi — Nur Al-Quran', $subjects, true), implode(' | ', $subjects));
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
$dPhoto = uploadPhoto(makePng(200, 200), 'd.png', 'image/png', $td);
$dPhotoFile = avatarFile(data($dPhoto)['user']['avatar_url'] ?? null);
if ($dPhoto['status'] === 200) {
    $dAdm = data(req('GET', '/admin/users?q=' . rawurlencode($D['email']), null, $tadm));
    check('admin user list shows the uploaded photo', str_contains((string) ($dAdm['items'][0]['avatar_url'] ?? ''), '/v1/avatars/' . $dPhotoFile), json_encode($dAdm));
}
$dWrong = req('DELETE', '/auth/account', ['password' => 'nope-nope-1'], $td);
check('delete account wrong password → 422 validation (fields.password)', $dWrong['status'] === 422 && isset($dWrong['json']['error']['fields']['password']), desc($dWrong));
$dDel = req('DELETE', '/auth/account', ['password' => $D['pw']], $td);
check('delete account → {}', $dDel['status'] === 200, desc($dDel));
check('deleted user cannot log in', req('POST', '/auth/login', ['email' => $D['email'], 'password' => $D['pw']], ['ip' => $D['ip']])['status'] === 401);
check("deleted user's room is gone", req('GET', "/groups/{$dRoom}", null, $tb)['status'] === 404);
if ($dPhotoFile !== '') {
    check("account deletion removes the profile photo", req('GET', '/avatars/' . $dPhotoFile, null, ['client' => false])['status'] === 404
        && !photoOnDisk($dPhotoFile));
}
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
section('Riwayat (texts + reciters)');
$rv = req('GET', '/riwayat/text/ara-quranfoo/1');
check('riwayat text: unknown edition → 404', $rv['status'] === 404 && errc($rv) === 'not_found', desc($rv));
$rv0 = req('GET', '/riwayat/text/ara-quranwarsh/0');
$rv115 = req('GET', '/riwayat/text/ara-quranwarsh/115');
$rvx = req('GET', '/riwayat/text/ara-quranwarsh/abc');
check('riwayat text: surah outside 1–114 → 404', $rv0['status'] === 404 && $rv115['status'] === 404 && $rvx['status'] === 404, desc($rv115));
$FAKE = isset($opt['fake-upstream']) ? rtrim((string) $opt['fake-upstream'], '/') : null;
if ($LOCAL !== null && $FAKE !== null) {
    $fakeState = sys_get_temp_dir() . '/nq-fake-upstream-' . (string) parse_url($FAKE, PHP_URL_PORT);
    $fakeHits = static function (string $needle) use ($fakeState): int {
        clearstatcache();
        $lines = is_file($fakeState . '/requests.log') ? (file($fakeState . '/requests.log') ?: []) : [];
        return count(array_filter($lines, static fn (string $l): bool => str_contains($l, $needle)));
    };
    $setUpstreams = static function (array $text, array $audio) use ($LOCAL): void {
        $cfgFile = $LOCAL . '/config.php';
        $cfg = require $cfgFile;
        $cfg['riwayat_upstream_text'] = $text;
        $cfg['riwayat_upstream_audio'] = $audio;
        file_put_contents($cfgFile, "<?php\nreturn " . var_export($cfg, true) . ";\n");
        chmod($cfgFile, 0600);
        sleep(3); // the server's opcache may revalidate config.php only every 2 s (opcache.revalidate_freq)
    };
    $cacheDir = $LOCAL . '/storage/cache/riwayat';
    foreach (glob($cacheDir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @unlink($fakeState . '/down');
    @unlink($fakeState . '/requests.log');
    $setUpstreams([$FAKE . '/broken', $FAKE . '/text'], [$FAKE . '/broken/api/v3', $FAKE . '/mp3quran/api/v3']);
    $fixture = json_decode((string) file_get_contents($LOCAL . '/tests/fixtures/ara-quranwarsh-1.json'), true)['chapter'];

    $t1 = req('GET', '/riwayat/text/ara-quranwarsh/1', null, ['ip' => '10.40.0.1']);
    $td1 = data($t1);
    check('riwayat text: fetched through the fallback upstream (first one 500s)', $t1['status'] === 200 && ($td1['edition'] ?? '') === 'ara-quranwarsh'
        && ($td1['surah'] ?? 0) === 1 && count((array) ($td1['ayahs'] ?? [])) === 7 && $fakeHits('/broken/ara-quranwarsh/1.json') === 1, desc($t1));
    check('riwayat text: ayahs are the upstream texts, in order', ($td1['ayahs'] ?? []) === array_map(static fn (array $a): string => $a['text'], $fixture), desc($t1));
    check('riwayat text: Cache-Control public, 7 days', hdr($t1, 'cache-control') === 'public, max-age=604800', hdr($t1, 'cache-control'));
    $cached = json_decode((string) @file_get_contents($cacheDir . '/ara-quranwarsh-1.json'), true);
    check('riwayat text: stored as a compact array in storage/cache/riwayat', is_array($cached) && array_is_list($cached) && count($cached) === 7);
    $before = $fakeHits('/text/ara-quranwarsh/1.json');
    $t2 = req('GET', '/riwayat/text/ara-quranwarsh/1', null, ['ip' => '10.40.0.2']);
    check('riwayat text: second request is served from the cache (no upstream call)', $t2['status'] === 200 && data($t2) === $td1
        && $fakeHits('/text/ara-quranwarsh/1.json') === $before, desc($t2));
    $q = req('GET', '/riwayat/text/ara-quranqaloon/112', null, ['ip' => '10.40.0.1']);
    $qText = implode(' ', (array) (data($q)['ayahs'] ?? []));
    check('riwayat text: direction marks (U+200F) are stripped, letters kept', $q['status'] === 200 && count((array) data($q)['ayahs']) === 4
        && !str_contains($qText, "\u{200F}") && str_contains($qText, 'اَ۬للَّهُ'), desc($q));
    $miss = req('GET', '/riwayat/text/ara-quranbazzi/1', null, ['ip' => '10.40.0.1']);
    check('riwayat text: every upstream fails → 502 upstream, nothing cached', $miss['status'] === 502 && errc($miss) === 'upstream'
        && !is_file($cacheDir . '/ara-quranbazzi-1.json'), desc($miss));
    $setUpstreams([$FAKE . '/bad'], [$FAKE . '/mp3quran/api/v3']);
    $bad = req('GET', '/riwayat/text/ara-quranuthmanihaf/1', null, ['ip' => '10.40.0.1']);
    check('riwayat text: a body with the wrong shape is rejected (502, not cached)', $bad['status'] === 502
        && !is_file($cacheDir . '/ara-quranuthmanihaf-1.json'), desc($bad));
    $setUpstreams([$FAKE . '/broken', $FAKE . '/text'], [$FAKE . '/broken/api/v3', $FAKE . '/mp3quran/api/v3']);
    $hafs = req('GET', '/riwayat/text/ara-quranuthmanihaf/1', null, ['ip' => '10.40.0.1']);
    check('riwayat text: Hafs (ara-quranuthmanihaf) works too', $hafs['status'] === 200 && (data($hafs)['ayahs'][0] ?? '') === 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ', desc($hafs));

    $a1 = req('GET', '/riwayat/audio', null, ['ip' => '10.40.0.3']);
    $ad = data($a1);
    $rawis = (array) ($ad['rawis'] ?? []);
    check('riwayat audio: 200 with all 20 rawis + Cache-Control 1 h', $a1['status'] === 200 && count($rawis) === 20
        && hdr($a1, 'cache-control') === 'public, max-age=3600' && is_string($ad['updated_at'] ?? null) && ($ad['stale'] ?? null) === false, desc($a1));
    $allHttps = true;
    foreach ($rawis as $list) {
        foreach ($list as $e) {
            $allHttps = $allHttps && str_starts_with((string) $e['server'], 'https://') && str_ends_with((string) $e['server'], '/')
                && is_array($e['surahs']) && $e['surahs'] !== [] && is_int($e['surahs'][0]);
        }
    }
    check('riwayat audio: only https servers (the http moshaf is dropped)', $allHttps && count($rawis['warsh'] ?? []) === 3, json_encode($rawis['warsh'] ?? null, JSON_UNESCAPED_UNICODE));
    $names = static fn (string $id): array => array_map(static fn (array $e): string => $e['reciter'] . ' / ' . $e['moshaf'], (array) ($rawis[$id] ?? []));
    check('riwayat audio: «قالون عن نافع من طريق أبي نشيط» counts for Qalun', in_array('علي بن عبدالرحمن الحذيفي / قالون عن نافع من طريق أبي نشيط - مرتل', $names('qalun'), true), json_encode($names('qalun'), JSON_UNESCAPED_UNICODE));
    check('riwayat audio: al-Duri ʿan Abi ʿAmr and al-Duri ʿan al-Kisaʾi are told apart', count($rawis['duri_abuamr'] ?? []) === 3 && $names('duri_kisai') === ['مفتاح السلطني / الدوري عن الكسائي - مرتل'],
        json_encode([$names('duri_abuamr'), $names('duri_kisai')], JSON_UNESCAPED_UNICODE));
    check('riwayat audio: Khalaf ʿan Hamza ≠ Ishaq ʿan Khalaf al-ʿAshir', $names('khalaf_hamza') === ['عبدالرشيد صوفي / خلف عن حمزة - مرتل'] && count($rawis['ishaq'] ?? []) === 1,
        json_encode([$names('khalaf_hamza'), $names('ishaq')], JSON_UNESCAPED_UNICODE));
    $bz = (array) ($rawis['bazzi'] ?? []);
    check('riwayat audio: combined «البزي وقنبل» is listed for both, after the single riwaya', count($bz) === 2 && $bz[0]['combined'] === false && $bz[1]['combined'] === true
        && count(array_filter((array) ($rawis['qunbul'] ?? []), static fn (array $e): bool => $e['combined'])) === 1, json_encode($bz, JSON_UNESCAPED_UNICODE));
    check('riwayat audio: «مرتل» before «مجود»; partial surah lists kept', ($rawis['hafs'][3]['style'] ?? '') === 'mujawwad' && ($rawis['hafs'][0]['style'] ?? '') === 'murattal'
        && count($rawis['shuba'][0]['surahs'] ?? []) === 67, json_encode($rawis['hafs'] ?? null, JSON_UNESCAPED_UNICODE));
    check('riwayat audio: a rawi without recordings is an empty list', ($rawis['idris'] ?? null) === [], json_encode($rawis['idris'] ?? null));
    $before = $fakeHits('/mp3quran/api/v3/reciters');
    $a2 = req('GET', '/riwayat/audio', null, ['ip' => '10.40.0.4']);
    check('riwayat audio: cached for 24 h (second request does not call mp3quran)', $a2['status'] === 200 && data($a2)['rawis'] === $rawis
        && $fakeHits('/mp3quran/api/v3/reciters') === $before, desc($a2));
    // expire the cache and take the upstream down → the stale copy is served
    $mapFile = $cacheDir . '/audio-map.json';
    $doc = json_decode((string) file_get_contents($mapFile), true);
    $doc['fetched_at'] = time() - 2 * 86400;
    file_put_contents($mapFile, json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    touch($fakeState . '/down');
    $a3 = req('GET', '/riwayat/audio', null, ['ip' => '10.40.0.5']);
    check('riwayat audio: upstream down → the stale copy is served (stale:true)', $a3['status'] === 200 && (data($a3)['stale'] ?? null) === true
        && data($a3)['rawis'] === $rawis && is_file($mapFile . '.failed'), desc($a3));
    $before = $fakeHits('/mp3quran/api/v3/reciters');
    req('GET', '/riwayat/audio', null, ['ip' => '10.40.0.5']);
    check('riwayat audio: after a failure, no retry for 10 minutes', $fakeHits('/mp3quran/api/v3/reciters') === $before);
    @unlink($mapFile);
    @unlink($mapFile . '.failed');
    $a4 = req('GET', '/riwayat/audio', null, ['ip' => '10.40.0.6']);
    check('riwayat audio: nothing cached and upstream down → 502 upstream', $a4['status'] === 502 && errc($a4) === 'upstream', desc($a4));
    @unlink($fakeState . '/down');
    @unlink($mapFile . '.failed');
    check('riwayat audio: recovers once the upstream is back', req('GET', '/riwayat/audio', null, ['ip' => '10.40.0.6'])['status'] === 200);

    $cli = [];
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($LOCAL . '/tools/check-riwayat.php') . ' --no-head --edition=ara-quranwarsh 2>&1', $cli, $cliStatus);
    $cliOut = implode("\n", $cli);
    check('check-riwayat.php CLI: reports reciters per rawi + text status, exit 0', $cliStatus === 0 && preg_match('/warsh\s+ورش عن نافع\s+3/u', $cliOut) === 1
        && str_contains($cliOut, 'idris') && str_contains($cliOut, '(no reciter found)') && str_contains($cliOut, 'ara-quranwarsh: 7 ayahs')
        && str_contains($cliOut, 'https://server11.mp3quran.net/koshi/001.mp3'), $cliOut);

    $codes = [];
    for ($i = 1; $i <= 61; $i++) {
        $codes[] = req('GET', "/riwayat/text/ara-quranbazzi/{$i}", null, ['ip' => '10.41.0.1'])['status'];
    }
    $cachedOk = req('GET', '/riwayat/text/ara-quranwarsh/1', null, ['ip' => '10.41.0.1']);
    check('riwayat text: uncached fetches are rate-limited per IP (61st → 429); cached texts still served', $codes[60] === 429
        && !in_array(429, array_slice($codes, 0, 60), true) && $cachedOk['status'] === 200, implode(',', array_unique($codes)));
} else {
    echo "  (upstream checks skipped — pass --local and --fake-upstream)\n";
}

// ───────────────────────────────────────────────────────────────────────────
section('Radio (catalogue + stream check)');
if ($LOCAL !== null && $FAKE !== null) {
    $fakeState = sys_get_temp_dir() . '/nq-fake-upstream-' . (string) parse_url($FAKE, PHP_URL_PORT);
    $radioHits = static function () use ($fakeState): int {
        clearstatcache();
        $lines = is_file($fakeState . '/requests.log') ? (file($fakeState . '/requests.log') ?: []) : [];
        return count(array_filter($lines, static fn (string $l): bool => str_starts_with($l, '/radio/') || str_starts_with($l, '/mp3quran/api/v3/radios')));
    };
    $FP = (string) parse_url($FAKE, PHP_URL_PORT);
    $LH = 'http://localhost:' . $FP;   // resolves to the fake upstream too, but plain http to a name ≠ 127.0.0.1 is never browser-safe
    $radioCatalog = [
        ['id' => 't-ok-first', 'name_ar' => 'إذاعة الاختبار الأولى', 'name_en' => 'Test one', 'country' => 'EG', 'category' => 'quran', 'featured' => true,
            'streams' => [$FAKE . '/radio/missing', $FAKE . '/radio/mp3']],
        ['id' => 't-redirect', 'name_ar' => 'إذاعة التحويل', 'name_en' => 'Redirect', 'country' => 'SA', 'category' => 'quran', 'streams' => [$FAKE . '/radio/redirect']],
        ['id' => 't-upgrade', 'name_ar' => 'إذاعة الترقية', 'name_en' => 'Upgrade', 'country' => 'AE', 'category' => 'quran', 'streams' => [$LH . '/radio/up']],
        ['id' => 't-insecure', 'name_ar' => 'إذاعة غير آمنة', 'name_en' => 'Insecure', 'country' => 'KW', 'category' => 'quran',
            'streams' => [$LH . '/radio/mp3', $FAKE . '/radio/to-localhost']],
        ['id' => 't-hls', 'name_ar' => 'إذاعة HLS', 'name_en' => 'HLS', 'country' => 'JO', 'category' => 'quran', 'streams' => [$FAKE . '/radio/hls.m3u8']],
        ['id' => 't-hls-mixed', 'name_ar' => 'إذاعة HLS مختلطة', 'name_en' => 'HLS mixed', 'country' => 'JO', 'category' => 'quran', 'streams' => [$FAKE . '/radio/hls-http.m3u8']],
        ['id' => 't-html', 'name_ar' => 'صفحة لا بث', 'name_en' => 'HTML', 'country' => 'TN', 'category' => 'programs', 'streams' => [$FAKE . '/radio/html', $FAKE . '/radio/tiny']],
        ['id' => 't-octet', 'name_ar' => 'إذاعة بلا نوع', 'name_en' => 'Octet', 'country' => 'MA', 'category' => 'quran', 'streams' => [$FAKE . '/radio/aac-octet']],
        ['id' => 't-m3u', 'name_ar' => 'قائمة m3u', 'name_en' => 'M3U', 'country' => 'QA', 'category' => 'quran', 'streams' => [$FAKE . '/radio/playlist.m3u']],
        ['id' => 't-pls', 'name_ar' => 'قائمة pls', 'name_en' => 'PLS', 'country' => 'OM', 'category' => 'quran', 'streams' => [$FAKE . '/radio/playlist.pls']],
        ['id' => 't-empty', 'name_ar' => 'إذاعة بلا رابط', 'name_en' => 'Empty', 'country' => 'LY', 'category' => 'quran', 'streams' => []],
        ['id' => 't-mix', 'name_ar' => 'تلاوات متنوعة', 'name_en' => 'Mix', 'country' => '', 'category' => 'recitation', 'streams' => [$FAKE . '/radio/q/mix']],
    ];
    $setRadio = static function (array $catalog) use ($LOCAL, $FAKE): void {
        $cfgFile = $LOCAL . '/config.php';
        $cfg = require $cfgFile;
        $cfg['radio_catalog'] = $catalog;
        $cfg['radio_upstream_mp3quran'] = [$FAKE . '/broken/api/v3', $FAKE . '/mp3quran/api/v3'];
        file_put_contents($cfgFile, "<?php\nreturn " . var_export($cfg, true) . ";\n");
        chmod($cfgFile, 0600);
        sleep(3); // opcache.revalidate_freq
    };
    $radioDir = $LOCAL . '/storage/cache/radio';
    foreach (glob($radioDir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @unlink($fakeState . '/radio-down');
    $setRadio($radioCatalog);
    $byId = static function (array $res): array {
        $m = [];
        foreach ((array) (data($res)['stations'] ?? []) as $s) {
            $m[$s['id']] = $s;
        }
        return $m;
    };

    $r1 = req('GET', '/radio', null, ['ip' => '10.42.0.1']);
    $d1 = data($r1);
    $st = $byId($r1);
    check('radio: 200, public Cache-Control 10 min, checked_at set, not stale', $r1['status'] === 200 && hdr($r1, 'cache-control') === 'public, max-age=600'
        && is_string($d1['checked_at'] ?? null) && ($d1['stale'] ?? null) === false, desc($r1));
    $keys = array_keys((array) ($d1['stations'][0] ?? []));
    sort($keys);
    check('radio: station shape', $keys === ['bitrate', 'category', 'country', 'featured', 'hls', 'id', 'name_ar', 'name_en', 'source', 'status', 'url'], implode(',', $keys));
    check('radio: catalogue first, in order', array_slice(array_keys($st), 0, 3) === ['t-ok-first', 't-redirect', 't-upgrade'], implode(',', array_keys($st)));
    check('radio: first candidate 404 → the second one is chosen (+ icy-br bitrate, featured)', ($st['t-ok-first']['status'] ?? '') === 'ok'
        && $st['t-ok-first']['url'] === $FAKE . '/radio/mp3' && $st['t-ok-first']['bitrate'] === 128 && $st['t-ok-first']['featured'] === true
        && $st['t-ok-first']['hls'] === false && $st['t-ok-first']['country'] === 'EG', json_encode($st['t-ok-first'] ?? null));
    check('radio: a redirect that stays browser-safe keeps the original URL', ($st['t-redirect']['status'] ?? '') === 'ok' && $st['t-redirect']['url'] === $FAKE . '/radio/redirect', json_encode($st['t-redirect'] ?? null));
    check('radio: an http candidate that redirects to a safe URL → the browser gets the safe URL', ($st['t-upgrade']['status'] ?? '') === 'ok'
        && $st['t-upgrade']['url'] === $FAKE . '/radio/mp3', json_encode($st['t-upgrade'] ?? null));
    check('radio: http-only streams (or a redirect to http) are down and never handed out', ($st['t-insecure']['status'] ?? '') === 'down'
        && !str_starts_with((string) $st['t-insecure']['url'], $LH), json_encode($st['t-insecure'] ?? null));
    check('radio: HLS playlist → ok, hls:true, bitrate from BANDWIDTH', ($st['t-hls']['status'] ?? '') === 'ok' && $st['t-hls']['hls'] === true
        && $st['t-hls']['bitrate'] === 64, json_encode($st['t-hls'] ?? null));
    check('radio: HLS with http:// segments → down (mixed content)', ($st['t-hls-mixed']['status'] ?? '') === 'down', json_encode($st['t-hls-mixed'] ?? null));
    check('radio: an HTML page / a 300-byte body is not a stream', ($st['t-html']['status'] ?? '') === 'down', json_encode($st['t-html'] ?? null));
    check('radio: application/octet-stream with AAC frames is recognised', ($st['t-octet']['status'] ?? '') === 'ok', json_encode($st['t-octet'] ?? null));
    check('radio: .m3u / .pls playlists are followed to the stream', ($st['t-m3u']['url'] ?? '') === $FAKE . '/radio/ogg' && ($st['t-m3u']['status'] ?? '') === 'ok'
        && ($st['t-pls']['url'] ?? '') === $FAKE . '/radio/mp3', json_encode([$st['t-m3u'] ?? null, $st['t-pls'] ?? null]));
    check('radio: a station without streams is down with url null', ($st['t-empty']['status'] ?? '') === 'down' && $st['t-empty']['url'] === null);
    $safe = true;
    foreach ($st as $s) {
        $safe = $safe && ($s['url'] === null || str_starts_with($s['url'], 'https://') || str_starts_with($s['url'], $FAKE . '/'));
    }
    check('radio: every URL handed out is https (or the 127.0.0.1 test upstream)', $safe);
    check('radio: mp3quran radios merged (English names, tafsir/programs categories)', ($st['mp3q-1']['name_en'] ?? '') === 'Abdulbasit Abdulsamad'
        && ($st['mp3q-1']['category'] ?? '') === 'recitation' && ($st['mp3q-1']['source'] ?? '') === 'mp3quran' && ($st['mp3q-1']['status'] ?? '') === 'ok'
        && ($st['mp3q-2']['category'] ?? '') === 'tafsir' && ($st['mp3q-3']['category'] ?? '') === 'programs' && ($st['mp3q-3']['name_en'] ?? '') === 'الرقية الشرعية'
        && array_key_exists('country', $st['mp3q-1'] ?? []) && $st['mp3q-1']['country'] === null, json_encode(array_intersect_key($st, array_flip(['mp3q-1', 'mp3q-2', 'mp3q-3'])), JSON_UNESCAPED_UNICODE));
    check('radio: mp3quran duplicates (name, catalogue URL), http and nameless entries dropped; a dead one is down',
        !isset($st['mp3q-4']) && !isset($st['mp3q-5']) && !isset($st['mp3q-6']) && !isset($st['mp3q-8']) && ($st['mp3q-7']['status'] ?? '') === 'down'
        && isset($st['t-mix']), implode(',', array_keys($st)));

    $before = $radioHits();
    $r2 = req('GET', '/radio', null, ['ip' => '10.42.0.2']);
    check('radio: second request served from the cache (no stream or mp3quran calls)', $r2['status'] === 200 && data($r2)['stations'] === $d1['stations']
        && $radioHits() === $before, desc($r2));

    $statusFile = $radioDir . '/status.json';
    $age = static function (string $file, string $key, int $by): void {
        $doc = json_decode((string) file_get_contents($file), true);
        $doc[$key] = (int) $doc[$key] - $by;
        file_put_contents($file, json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    };
    $age($statusFile, 'checked_at', 7 * 3600);
    $before = $radioHits();
    $r3 = req('GET', '/radio', null, ['ip' => '10.42.0.3']);
    check('radio: results older than 6 h → the streams are checked again', $r3['status'] === 200 && ($radioHits() - $before) >= 12
        && data($r3)['stations'] === $d1['stations'] && (data($r3)['stale'] ?? null) === false, 'hits ' . ($radioHits() - $before));

    $age($statusFile, 'checked_at', 7 * 3600);
    touch($fakeState . '/radio-down');
    $r4 = req('GET', '/radio', null, ['ip' => '10.42.0.4']);
    check('radio: every stream unreachable → the last good results are served (stale:true)', $r4['status'] === 200 && (data($r4)['stale'] ?? null) === true
        && data($r4)['stations'] === $d1['stations'] && is_file($statusFile . '.failed'), desc($r4));
    $before = $radioHits();
    req('GET', '/radio', null, ['ip' => '10.42.0.4']);
    check('radio: after a failed check, no retry for 10 minutes', $radioHits() === $before);

    $listFile = $radioDir . '/mp3quran.json';
    $age($listFile, 'fetched_at', 2 * 86400);
    $r5 = req('GET', '/radio', null, ['ip' => '10.42.0.5']);
    check('radio: mp3quran down → its last list is kept', $r5['status'] === 200 && isset($byId($r5)['mp3q-1']) && is_file($listFile . '.failed'), desc($r5));
    @unlink($fakeState . '/radio-down');
    @unlink($statusFile . '.failed');
    @unlink($listFile . '.failed');

    $setRadio(array_merge($radioCatalog, [['id' => 't-new', 'name_ar' => 'محطة جديدة', 'name_en' => 'New', 'country' => 'BH', 'category' => 'quran', 'streams' => [$FAKE . '/radio/ogg']]]));
    $r6 = req('GET', '/radio', null, ['ip' => '10.42.0.6']);
    check('radio: a catalogue change is checked at once (no 6 h wait)', ($byId($r6)['t-new']['status'] ?? '') === 'ok', json_encode($byId($r6)['t-new'] ?? null));

    foreach (glob($radioDir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    touch($fakeState . '/radio-down');
    $r7 = req('GET', '/radio', null, ['ip' => '10.42.0.7']);
    $st7 = $byId($r7);
    check('radio: nothing cached and everything down → 200 with the catalogue only, all down', $r7['status'] === 200 && isset($st7['t-ok-first'])
        && !isset($st7['mp3q-1']) && count(array_filter($st7, static fn (array $s): bool => $s['status'] !== 'down')) === 0, desc($r7));
    @unlink($fakeState . '/radio-down');
    foreach (glob($radioDir . '/*') ?: [] as $f) {
        @unlink($f);
    }

    $cli = [];
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($LOCAL . '/tools/check-radio.php') . ' 2>&1', $cli, $cliStatus);
    $cliOut = implode("\n", $cli);
    check('check-radio.php CLI: per-station candidates, chosen URL and status; cache untouched without --refresh', $cliStatus === 0
        && str_contains($cliOut, '[ok  ] t-ok-first') && str_contains($cliOut, '→ ' . $FAKE . '/radio/mp3')
        && str_contains($cliOut, '[DOWN] t-insecure') && str_contains($cliOut, 'works over http only')
        && str_contains($cliOut, 'FAIL ' . $FAKE . '/radio/missing — HTTP 404') && str_contains($cliOut, '[HLS]')
        && !is_file($statusFile), $cliOut);
    $cli = [];
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($LOCAL . '/tools/check-radio.php') . ' --refresh 2>&1', $cli, $cliStatus);
    $cliOut = implode("\n", $cli);
    $before = $radioHits();
    $r8 = req('GET', '/radio', null, ['ip' => '10.42.0.8']);
    check('check-radio.php --refresh: rewrites the cache that GET /radio then serves', $cliStatus === 0 && str_contains($cliOut, 'Cache rewritten')
        && is_file($statusFile) && $r8['status'] === 200 && ($byId($r8)['t-ok-first']['status'] ?? '') === 'ok' && $radioHits() === $before, $cliOut);
} else {
    echo "  (radio checks skipped — pass --local and --fake-upstream)\n";
}

// ───────────────────────────────────────────────────────────────────────────
require __DIR__ . '/smoke-community.php'; // voice rooms & community (needs --local and --fake-upstream)
require __DIR__ . '/smoke-apple.php';     // Sign in with Apple (needs --local and --fake-upstream)

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
