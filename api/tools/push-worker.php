<?php
declare(strict_types=1);

/**
 * Community background worker: sends queued push notifications (FCM / APNs) and runs the room housekeeping
 * (auto-close rooms with nobody on stage, 10-minute reminders, cancelling scheduled rooms that never started,
 * expired suspensions, old queue rows). The API also does this in small batches after responses; this cron job makes
 * it independent of traffic.
 *
 *   php ~/nuralquran-api/tools/push-worker.php                 # one pass (housekeeping + up to 200 pushes)
 *   php ~/nuralquran-api/tools/push-worker.php --loop=55       # keep draining for 55 s (cron: every minute)
 *   php ~/nuralquran-api/tools/push-worker.php --batch=50 --no-tick
 *
 * cPanel → Cron Jobs (every minute):
 *   * * * * * /opt/cpanel/ea-php82/root/usr/bin/php /home/nuralqur/nuralquran-api/tools/push-worker.php --loop=55 >/dev/null 2>&1
 * Only one worker runs at a time (lock file in storage/).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$base = dirname(__DIR__);
require $base . '/app/bootstrap.php';

use NQ\Core\Config;
use NQ\Core\Migrations;
use NQ\Core\Push;
use NQ\Core\Rooms;

$cfgFile = nq_config_path();
if (!is_file($cfgFile)) {
    fwrite(STDERR, "config.php not found — install the API first.\n");
    exit(2);
}
Config::init(nq_base_dir(), (array) require $cfgFile);

$opt = getopt('', ['loop::', 'batch::', 'no-tick', 'quiet']);
$loop = max(0, min(600, (int) ($opt['loop'] ?? 0)));
$batch = max(1, min(500, (int) ($opt['batch'] ?? 200)));
$quiet = isset($opt['quiet']);

$lock = fopen(Config::storageDir() . '/push-worker.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    if (!$quiet) {
        echo "another worker is running\n";
    }
    exit(0);
}

Migrations::ensure();
$until = microtime(true) + $loop;
$total = ['sent' => 0, 'failed' => 0, 'retry' => 0, 'dropped' => 0];
$ticked = false;
do {
    if (!isset($opt['no-tick']) && !$ticked) {
        try {
            Rooms::tick();
        } catch (\Throwable $e) {
            fwrite(STDERR, 'housekeeping failed: ' . $e->getMessage() . "\n");
        }
        $ticked = true;
    }
    $s = Push::process($batch, 50.0);
    foreach ($s as $k => $v) {
        $total[$k] += $v;
    }
    $idle = array_sum($s) === 0;
    if ($loop > 0 && microtime(true) < $until) {
        if ($idle) {
            sleep(2);
        }
        if (!isset($opt['no-tick']) && time() % 30 < 2) {
            $ticked = false; // housekeeping every ~30 s while looping
        }
    }
} while ($loop > 0 && microtime(true) < $until);

if (!$quiet) {
    printf("push: sent %d, retry %d, failed %d, dropped devices %d\n", $total['sent'], $total['retry'], $total['failed'], $total['dropped']);
}
flock($lock, LOCK_UN);
exit(0);
