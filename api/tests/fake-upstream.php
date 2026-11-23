<?php
declare(strict_types=1);

/**
 * A stand-in for the riwayat upstreams, for the local smoke test only (php -S 127.0.0.1:<port> tests/fake-upstream.php):
 *   /broken/…                         → 500 (the first text upstream, to prove the fallback works)
 *   /text/<edition>/<surah>.json      → tests/fixtures/<edition>-<surah>.json (real King Fahd Complex samples), else 404
 *   /bad/<edition>/<surah>.json       → 200 with a wrong shape
 *   /mp3quran/api/v3/reciters         → tests/fixtures/mp3quran-reciters.json (503 while the flag file <state>/down exists)
 *   /mp3quran/api/v3/radios?language= → tests/fixtures/mp3quran-radios-<ar|eng>.json, «{BASE}» = this server
 *   /radio/…                          → fake radio streams for the radio checker (see radioRoute() below);
 *                                       /radio/* and /mp3quran/api/v3/radios answer 503 while <state>/radio-down exists
 * <state> is sys_get_temp_dir()/nq-fake-upstream-<port>; every request path is appended to <state>/requests.log
 * so the smoke test can tell whether the API answered from its cache.
 */
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$fx = __DIR__ . '/fixtures';
$state = sys_get_temp_dir() . '/nq-fake-upstream-' . ($_SERVER['SERVER_PORT'] ?? '0');
@mkdir($state, 0700, true);
file_put_contents($state . '/requests.log', $path . "\n", FILE_APPEND);
$self = 'http://127.0.0.1:' . ($_SERVER['SERVER_PORT'] ?? '0');

if ($path === '/mp3quran/api/v3/radios' || str_starts_with($path, '/radio/')) {
    if (is_file($state . '/radio-down')) {
        http_response_code(503);
        header('Content-Type: text/plain');
        echo 'down';
        return;
    }
    if ($path === '/mp3quran/api/v3/radios') {
        header('Content-Type: application/json; charset=utf-8');
        $lang = ($_GET['language'] ?? 'ar') === 'eng' ? 'eng' : 'ar';
        echo str_replace('{BASE}', $self, (string) file_get_contents($fx . '/mp3quran-radios-' . $lang . '.json'));
        return;
    }
    radioRoute($path, $self);
    return;
}
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

/** Fake radio streams: every kind of answer the radio checker has to tell apart. */
function radioRoute(string $path, string $self): void
{
    $mp3 = "ID3\x03\x00\x00\x00\x00\x00\x00" . str_repeat("\xFF\xFB\x90\x64" . str_repeat("\x00", 413), 100); // ≈ 42 KB of MP3 frames
    $send = static function (string $type, string $body, array $headers = []): void {
        header('Content-Type: ' . $type);
        foreach ($headers as $k => $v) {
            header($k . ': ' . $v);
        }
        echo $body;
    };
    $redirect = static function (string $to): void {
        http_response_code(302);
        header('Location: ' . $to);
    };
    match (true) {
        $path === '/radio/mp3', str_starts_with($path, '/radio/q/') => $send('audio/mpeg', $mp3, ['icy-br' => '128', 'icy-name' => 'Fake Quran']),
        $path === '/radio/ogg' => $send('application/ogg', 'OggS' . str_repeat("\x00\x02", 12000)),
        $path === '/radio/aac-octet' => $send('application/octet-stream', str_repeat("\xFF\xF1\x50\x80\x02\x1F\xFC" . str_repeat("\x21", 249), 40)),
        $path === '/radio/tiny' => $send('audio/mpeg', substr($mp3, 0, 300)),
        $path === '/radio/html' => $send('text/html; charset=utf-8', '<!doctype html><title>Listen live</title>' . str_repeat(' ', 5000)),
        $path === '/radio/hls.m3u8' => $send('application/vnd.apple.mpegurl', "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS=\"mp4a.40.2\"\nchunks.m3u8\n"),
        $path === '/radio/hls-http.m3u8' => $send('application/vnd.apple.mpegurl', "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nhttp://example.com/seg1.ts\n"),
        $path === '/radio/playlist.m3u' => $send('audio/x-mpegurl', "#EXTM3U\n#EXTINF:-1,Fake\n{$self}/radio/ogg\n"),
        $path === '/radio/playlist.pls' => $send('audio/x-scpls', "[playlist]\nNumberOfEntries=1\nFile1={$self}/radio/mp3\nTitle1=Fake\n"),
        $path === '/radio/redirect' => $redirect('/radio/mp3'),
        $path === '/radio/up' => $redirect($self . '/radio/mp3'),
        $path === '/radio/to-localhost' => $redirect('http://localhost:' . ($_SERVER['SERVER_PORT'] ?? '0') . '/radio/mp3'),
        default => (static function (): void {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo 'no such stream';
        })(),
    };
}
