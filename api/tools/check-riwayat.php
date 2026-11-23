<?php
declare(strict_types=1);

/**
 * Check the live sources of the «الإجازة والقراءات» page from the server:
 *
 *   php ~/nuralquran-api/tools/check-riwayat.php            # report only
 *   php ~/nuralquran-api/tools/check-riwayat.php --refresh  # also rewrite the audio cache used by GET /v1/riwayat/audio
 *   php ~/nuralquran-api/tools/check-riwayat.php --no-head  # skip the HEAD request on each sample MP3
 *
 * Prints, per rawi, how many mp3quran reciters were found and one sample MP3 URL (with its HTTP status), the
 * moshaf names that matched no rawi, and the fetch status of one surah of every text edition. Exit code 1 when
 * the reciters list or a text edition could not be fetched at all.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$base = dirname(__DIR__);
require $base . '/app/bootstrap.php';

use NQ\Core\Config;
use NQ\Core\Http;
use NQ\Core\Riwayat;

$cfgFile = nq_config_path();
Config::init(nq_base_dir(), is_file($cfgFile) ? (array) require $cfgFile : []);

$opt = getopt('', ['refresh', 'no-head', 'surah:', 'edition:']);
$surah = max(1, min(114, (int) ($opt['surah'] ?? 1)));
$failed = false;

$names = [
    'hafs' => 'حفص عن عاصم', 'shuba' => 'شعبة عن عاصم', 'warsh' => 'ورش عن نافع', 'qalun' => 'قالون عن نافع',
    'bazzi' => 'البزي عن ابن كثير', 'qunbul' => 'قنبل عن ابن كثير', 'duri_abuamr' => 'الدوري عن أبي عمرو', 'susi' => 'السوسي عن أبي عمرو',
    'hisham' => 'هشام عن ابن عامر', 'ibndhakwan' => 'ابن ذكوان عن ابن عامر', 'khalaf_hamza' => 'خلف عن حمزة', 'khallad' => 'خلاد عن حمزة',
    'abulharith' => 'أبو الحارث عن الكسائي', 'duri_kisai' => 'الدوري عن الكسائي', 'ibnwardan' => 'ابن وردان عن أبي جعفر',
    'ibnjammaz' => 'ابن جماز عن أبي جعفر', 'ruways' => 'رويس عن يعقوب', 'rawh' => 'روح عن يعقوب', 'ishaq' => 'إسحاق عن خلف العاشر',
    'idris' => 'إدريس عن خلف العاشر',
];

echo "== Audio (mp3quran reciters)\n";
$log = [];
$reciters = Riwayat::fetchReciters($log);
foreach ($log as $line) {
    echo "  {$line}\n";
}
if ($reciters === null) {
    $failed = true;
    echo "  !! could not fetch the reciters list from any upstream\n";
} else {
    $map = Riwayat::buildAudioMap($reciters);
    $total = 0;
    foreach ($map['rawis'] as $id => $list) {
        $total += count($list);
        $label = $names[$id] ?? '';
        $line = sprintf('  %-13s %s%s %3d', $id, $label, str_repeat(' ', max(0, 22 - mb_strlen($label))), count($list));
        if ($list !== []) {
            $first = $list[0];
            $s = in_array($surah, $first['surahs'], true) ? $surah : $first['surahs'][0];
            $url = $first['server'] . str_pad((string) $s, 3, '0', STR_PAD_LEFT) . '.mp3';
            $status = '';
            if (!isset($opt['no-head'])) {
                $h = Http::request('HEAD', $url, [], null, 15);
                $status = ' [HTTP ' . $h['status'] . ($h['error'] !== '' ? ' ' . $h['error'] : '') . ']';
            }
            $line .= '  ' . $first['reciter'] . ' — ' . $first['moshaf'] . "\n" . str_repeat(' ', 44) . $url . $status;
        } else {
            $line .= '  (no reciter found)';
        }
        echo $line, "\n";
    }
    echo "  total entries: {$total}\n";
    if ($map['unmatched'] !== []) {
        echo "  moshaf names that matched no rawi (name → count):\n";
        foreach (array_slice($map['unmatched'], 0, 40, true) as $n => $c) {
            echo "    {$n} → {$c}\n";
        }
    }
    if (isset($opt['refresh'])) {
        $file = Riwayat::audioCacheFile();
        @unlink($file);
        @unlink($file . '.failed');
        $m = Riwayat::audioMap();
        echo $m !== null ? "  cache refreshed: {$file} (updated_at {$m['updated_at']})\n" : "  !! cache refresh failed\n";
    }
}

echo "\n== Text (fawazahmed0/quran-api, King Fahd Complex texts) — surah {$surah}\n";
$editions = isset($opt['edition']) ? [(string) $opt['edition']] : Riwayat::EDITIONS;
foreach ($editions as $ed) {
    if (!Riwayat::validEdition($ed)) {
        echo "  {$ed}: not one of the supported editions\n";
        $failed = true;
        continue;
    }
    $cached = Riwayat::cachedText($ed, $surah);
    $log = [];
    // fetch even when cached, to check the upstream itself (the cache is rewritten with the same text)
    $ayahs = Riwayat::fetchText($ed, $surah, $log);
    echo "  {$ed}: " . ($ayahs !== null ? count($ayahs) . ' ayahs — «' . mb_substr($ayahs[0], 0, 40) . '»' : 'FAILED') . ($cached !== null ? ' (was cached)' : '') . "\n";
    foreach ($log as $line) {
        echo "      {$line}\n";
    }
    if ($ayahs === null) {
        $failed = true;
    }
}

echo "\n" . ($failed ? 'Some checks failed.' : 'All sources reachable.') . "\n";
exit($failed ? 1 : 0);
