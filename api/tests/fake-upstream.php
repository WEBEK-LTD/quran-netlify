<?php
declare(strict_types=1);

/**
 * A stand-in for the riwayat upstreams, for the local smoke test only (php -S 127.0.0.1:<port> tests/fake-upstream.php):
 *   /broken/…                         → 500 (the first text upstream, to prove the fallback works)
 *   /text/<edition>/<surah>.json      → tests/fixtures/<edition>-<surah>.json (real King Fahd Complex samples), else 404
 *   /bad/<edition>/<surah>.json       → 200 with a wrong shape
 *   /mp3quran/api/v3/reciters         → tests/fixtures/mp3quran-reciters.json (503 while the flag file <state>/down exists)
 * <state> is sys_get_temp_dir()/nq-fake-upstream-<port>; every request path is appended to <state>/requests.log
 * so the smoke test can tell whether the API answered from its cache.
 */
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$fx = __DIR__ . '/fixtures';
$state = sys_get_temp_dir() . '/nq-fake-upstream-' . ($_SERVER['SERVER_PORT'] ?? '0');
@mkdir($state, 0700, true);
file_put_contents($state . '/requests.log', $path . "\n", FILE_APPEND);
header('Content-Type: application/json; charset=utf-8');

if (str_starts_with($path, '/broken/')) {
    http_response_code(500);
    echo '{"error":"boom"}';
    return;
}
if (preg_match('#^/(text|bad)/(ara-quran[a-z]+)/(\d{1,3})\.json$#', $path, $m)) {
    $file = $fx . '/' . $m[2] . '-' . $m[3] . '.json';
    if (!is_file($file)) {
        http_response_code(404);
        echo '{"error":"not found"}';
        return;
    }
    echo $m[1] === 'bad' ? '{"chapter":[{"chapter":1,"verse":1}]}' : file_get_contents($file);
    return;
}
if ($path === '/mp3quran/api/v3/reciters') {
    if (is_file($state . '/down')) {
        http_response_code(503);
        echo '{"error":"down"}';
        return;
    }
    echo file_get_contents($fx . '/mp3quran-reciters.json');
    return;
}
http_response_code(404);
echo '{"error":"no route"}';
