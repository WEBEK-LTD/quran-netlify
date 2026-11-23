<?php
declare(strict_types=1);

/**
 * Check the radio streams of the «الإذاعة» page from the server:
 *
 *   php ~/nuralquran-api/tools/check-radio.php              # probe every stream now and print the result (cache untouched)
 *   php ~/nuralquran-api/tools/check-radio.php --refresh    # same, and rewrite the caches GET /v1/radio serves
 *   php ~/nuralquran-api/tools/check-radio.php --only=kw-quran,ae-sharjah-quran   # some stations only (never written)
 *   php ~/nuralquran-api/tools/check-radio.php --catalog    # the curated stations only, without the mp3quran channels
 *
 * Prints, per station, every candidate URL with what it answered, then the URL the browser will get and the status.
 * Exit code 1 when a featured (official national) station is down or the mp3quran list could not be fetched.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$base = dirname(__DIR__);
require $base . '/app/bootstrap.php';

use NQ\Core\Config;
use NQ\Core\Radio;

$cfgFile = nq_config_path();
Config::init(nq_base_dir(), is_file($cfgFile) ? (array) require $cfgFile : []);

$opt = getopt('', ['refresh', 'only:', 'catalog']);
$refresh = isset($opt['refresh']);
$only = isset($opt['only']) ? array_filter(array_map('trim', explode(',', (string) $opt['only']))) : [];
$failed = false;

echo "== mp3quran.net channels\n";
$stations = [];
if (isset($opt['catalog'])) {
    $stations = Radio::catalog();
    echo "  (skipped: --catalog)\n";
} else {
    $log = [];
    // with --refresh the list is re-fetched; otherwise the cached copy is used when it is fresh
    $stations = Radio::stations($refresh, $log);
    foreach ($log as $line) {
        echo "  {$line}\n";
    }
    $list = Radio::mp3quranList();
    if ($list === null) {
        $failed = true;
        echo "  !! could not fetch the mp3quran radios list from any upstream\n";
    } else {
        echo sprintf("  %d channels, fetched %s%s\n", count($list['stations']), gmdate('Y-m-d H:i', (int) $list['fetched_at']) . ' UTC', $list['stale'] ? ' (stale)' : '');
    }
}
if ($only !== []) {
    $stations = array_values(array_filter($stations, static fn (array $s): bool => in_array($s['id'], $only, true)));
    if ($stations === []) {
        echo "\nNo station matches --only.\n";
        exit(1);
    }
}

echo "\n== Streams (" . count($stations) . ' stations, probed in parallel: ≤ ' . (Radio::PROBE_BYTES / 1024) . ' KB, ' . Radio::PROBE_TIMEOUT . " s each)\n";
$t0 = microtime(true);
$trace = [];
$result = Radio::check($stations, $trace);
$ok = 0;
foreach ($stations as $s) {
    $r = $result[$s['id']];
    $ok += $r['status'] === 'ok' ? 1 : 0;
    $flag = $r['status'] === 'ok' ? 'ok  ' : 'DOWN';
    echo sprintf("\n[%s] %s  %s — %s%s (%s, %s)\n", $flag, $s['id'], $s['name_ar'], $s['name_en'], $s['featured'] ? ' ★' : '', $s['country'] !== '' ? $s['country'] : '--', $s['category']);
    foreach ($trace[$s['id']] ?? [] as $line) {
        echo "       {$line}\n";
    }
    if ($r['status'] === 'ok') {
        echo '    → ' . $r['url'] . ($r['hls'] ? '  [HLS]' : '') . ($r['bitrate'] ? '  ' . $r['bitrate'] . ' kbps' : '') . "\n";
    }
    if ($s['featured'] && $r['status'] !== 'ok') {
        $failed = true;
    }
}
echo sprintf("\n%d of %d stations work (%.1f s).\n", $ok, count($stations), microtime(true) - $t0);

if ($refresh && $only === [] && !isset($opt['catalog'])) {
    $doc = Radio::storeStatus($result);
    echo $doc !== null
        ? 'Cache rewritten: ' . Radio::statusFile() . ' (checked_at ' . gmdate('Y-m-d\TH:i:s\Z', (int) $doc['checked_at']) . ")\n"
        : "!! cache NOT rewritten (nothing reachable now; the previous results are kept)\n";
} elseif ($refresh) {
    echo "(--refresh ignored with --only / --catalog: the cache always holds every station)\n";
}

echo "\n" . ($failed ? 'Some official stations are down — see the candidates above (RadioCatalog.php).' : 'All official stations work.') . "\n";
exit($failed ? 1 : 0);
