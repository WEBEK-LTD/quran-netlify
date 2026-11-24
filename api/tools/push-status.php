<?php
declare(strict_types=1);

/**
 * Push diagnostics (CLI, run on the server):
 *   php ~/nuralquran-api/tools/push-status.php                 # registered devices + the last queued pushes and their errors
 *   php ~/nuralquran-api/tools/push-status.php --test=EMAIL    # queue a test notification to that account's devices and send it now
 * Prints no tokens in full and no secrets.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$base = dirname(__DIR__);
require $base . '/app/bootstrap.php';

use NQ\Core\Config;
use NQ\Core\Db;
use NQ\Core\Migrations;
use NQ\Core\Push;

$cfgFile = nq_config_path();
if (!is_file($cfgFile)) {
    fwrite(STDERR, "config.php not found — install the API first.\n");
    exit(2);
}
Config::init(nq_base_dir(), (array) require $cfgFile);
Migrations::ensure();

$opt = getopt('', ['test::']);
$mask = static fn (string $t): string => strlen($t) > 16 ? substr($t, 0, 8) . '…' . substr($t, -6) : $t;

echo "== integrations\n";
foreach (['fcm_service_account', 'apns_key_p8', 'apns_key_id', 'apns_team_id', 'apns_bundle_id', 'apns_environment'] as $k) {
    $v = \NQ\Core\Integrations::get($k);
    echo sprintf("  %-20s %s\n", $k, $v === null || $v === '' ? '(not set)' : (in_array($k, ['fcm_service_account', 'apns_key_p8'], true) ? 'set' : $v));
}
echo "  curl HTTP/2: " . ((curl_version()['features'] & CURL_VERSION_HTTP2) ? 'yes' : 'NO (APNs needs HTTP/2)') . "\n";

echo "\n== devices (latest 15)\n";
foreach (Db::all('SELECT d.id, d.user_id, u.email, d.provider, d.platform, d.app_version, d.token, d.last_seen_at FROM devices d JOIN users u ON u.id = d.user_id ORDER BY d.last_seen_at DESC LIMIT 15') as $d) {
    echo sprintf("  #%d user %d %-28s %-4s %-7s v%-8s %s  seen %s\n", $d['id'], $d['user_id'], mb_substr((string) $d['email'], 0, 28), $d['provider'], $d['platform'], $d['app_version'], $mask((string) $d['token']), $d['last_seen_at']);
}
echo '  total: ' . (int) Db::value('SELECT COUNT(*) FROM devices') . "\n";

echo "\n== push queue (latest 15)\n";
foreach (Db::all('SELECT q.id, q.status, q.attempts, q.last_error, q.created_at, q.sent_at, d.provider, d.user_id FROM push_queue q LEFT JOIN devices d ON d.id = q.device_id ORDER BY q.id DESC LIMIT 15') as $q) {
    echo sprintf("  #%d %-7s %-4s user %s tries %d  %s  %s\n", $q['id'], $q['status'], (string) $q['provider'], (string) $q['user_id'], $q['attempts'], $q['created_at'], $q['last_error'] ? 'ERR: ' . $q['last_error'] : ($q['sent_at'] ? 'sent ' . $q['sent_at'] : ''));
}
foreach (Db::all('SELECT status, COUNT(*) n FROM push_queue GROUP BY status') as $s) {
    echo "  {$s['status']}: {$s['n']}\n";
}

echo "\n== notifications (latest 5)\n";
foreach (Db::all('SELECT id, user_id, type, created_at FROM notifications ORDER BY id DESC LIMIT 5') as $n) {
    echo "  #{$n['id']} user {$n['user_id']} {$n['type']} {$n['created_at']}\n";
}

if (isset($opt['test']) && $opt['test'] !== false && $opt['test'] !== '') {
    $email = (string) $opt['test'];
    $uid = (int) Db::value('SELECT id FROM users WHERE email = ?', [$email]);
    if ($uid === 0) {
        echo "\n!! no account with that email\n";
        exit(1);
    }
    echo "\n== test push to user {$uid}\n";
    Push::notify($uid, 'test', 'نور القرآن', 'إشعار تجريبي — الإشعارات تعمل ✓', [], false);
    $r = Push::process(50, 20.0);
    echo '  ' . json_encode($r) . "\n";
    foreach (Db::all('SELECT q.id, q.status, q.last_error, d.provider FROM push_queue q JOIN devices d ON d.id = q.device_id WHERE d.user_id = ? ORDER BY q.id DESC LIMIT 5', [$uid]) as $q) {
        echo "  #{$q['id']} {$q['provider']} {$q['status']} " . ($q['last_error'] ?? '') . "\n";
    }
}
