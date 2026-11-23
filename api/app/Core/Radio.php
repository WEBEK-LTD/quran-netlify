<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * GET /v1/radio: the curated catalogue (RadioCatalog) + the mp3quran.net 24/7 channels, each with the stream the
 * browser should play and whether it works.
 *
 *  - mp3quran list: GET <mp3quran>/radios?language=ar (+ language=eng for English names), cached 24 h in
 *    storage/cache/radio/mp3quran.json; stale copy served when a refresh fails (retried after 10 min).
 *  - stream check: every candidate URL of every station is probed in parallel (Http::probeMany: short GET, ≤ 32 KB,
 *    8 s), at most once per 6 h; results in storage/cache/radio/status.json. When a check reaches nothing at all
 *    (the server lost its network) the previous results are kept and the check is retried after 10 min.
 *  - only browser-safe URLs are ever returned: https (or http://127.0.0.1 for the local test upstream). An http
 *    candidate counts only if it redirects to https; the browser then gets the first URL of the redirect chain from
 *    which every hop is https.
 *
 * Config overrides for local tests only: `radio_catalog` (list of stations replacing RadioCatalog::STATIONS),
 * `radio_upstream_mp3quran` (list of base URLs ending in /api/v3).
 */
final class Radio
{
    public const CHECK_TTL = 21600;      // re-check the streams at most every 6 h
    public const LIST_TTL = 86400;       // refresh the mp3quran list at most once a day
    public const RETRY = 600;            // after a failed refresh, serve the stale copy this long before retrying
    public const PROBE_BYTES = 32768;    // read at most this much of each stream (≤ 64 KB)
    public const MIN_BYTES = 2048;       // a stream must deliver at least this much audio within the timeout
    public const PROBE_TIMEOUT = 8;
    public const CONCURRENCY = 16;

    public const MP3QURAN_UPSTREAMS = [
        'https://www.mp3quran.net/api/v3',
        'https://mp3quran.net/api/v3',
    ];

    private const HLS_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl'];
    private const PLS_TYPES = ['audio/x-scpls', 'application/pls+xml', 'audio/scpls'];

    // ─── public entry points ────────────────────────────────────────────────

    /**
     * The payload of GET /v1/radio. $refresh: 'auto' (check when the cached results are older than CHECK_TTL),
     * 'never' (cache only) or 'force'.
     * @return array{checked_at:?string, stale:bool, stations:list<array<string,mixed>>}
     */
    public static function payload(string $refresh = 'auto'): array
    {
        $stations = self::stations($refresh === 'force');
        $status = self::readStatus();
        if ($refresh === 'force' || ($refresh === 'auto' && self::needsCheck($stations, $status))) {
            $status = self::refreshStatus($stations, $refresh === 'force') ?? $status;
        }
        return self::shape($stations, $status);
    }

    /** Whether the cached check results are missing, old, or don't cover the current catalogue. */
    public static function needsCheck(?array $stations = null, ?array $status = null): bool
    {
        $stations ??= self::stations();
        $status ??= self::readStatus();
        $now = time();
        if (is_file(self::statusFile() . '.failed') && $now - (int) @file_get_contents(self::statusFile() . '.failed') < self::RETRY) {
            return false;
        }
        if ($status === null || $now - (int) $status['checked_at'] >= self::CHECK_TTL) {
            return true;
        }
        foreach ($stations as $s) {
            if ($s['streams'] !== [] && (($status['stations'][$s['id']]['fp'] ?? '') !== self::fingerprint($s))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Curated catalogue + mp3quran channels (deduplicated by stream URL and by name).
     * @return list<array{id:string,name_ar:string,name_en:string,country:string,category:string,featured:bool,source:string,streams:list<string>}>
     */
    public static function stations(bool $forceList = false, array &$log = []): array
    {
        $out = [];
        $seenUrl = [];
        $seenName = [];
        foreach (self::catalog() as $s) {
            $out[] = $s;
            foreach ($s['streams'] as $u) {
                $seenUrl[self::urlKey($u)] = true;
            }
            $seenName[Riwayat::norm($s['name_ar'])] = true;
        }
        $list = self::mp3quranList($forceList, $log);
        foreach ($list['stations'] ?? [] as $s) {
            $k = self::urlKey($s['streams'][0]);
            $n = Riwayat::norm($s['name_ar']);
            if (isset($seenUrl[$k]) || isset($seenName[$n])) {
                continue;
            }
            $seenUrl[$k] = true;
            $seenName[$n] = true;
            $out[] = $s;
        }
        return $out;
    }

    /** @return list<array{id:string,name_ar:string,name_en:string,country:string,category:string,featured:bool,source:string,streams:list<string>}> */
    public static function catalog(): array
    {
        $raw = Config::get('radio_catalog');
        $raw = is_array($raw) && $raw !== [] ? $raw : RadioCatalog::STATIONS;
        $out = [];
        $ids = [];
        foreach ($raw as $s) {
            $id = (string) ($s['id'] ?? '');
            if (!preg_match('/^[a-z0-9][a-z0-9-]{1,63}$/', $id) || isset($ids[$id])) {
                continue;
            }
            $ids[$id] = true;
            $cat = in_array($s['category'] ?? '', RadioCatalog::CATEGORIES, true) ? (string) $s['category'] : 'programs';
            $streams = [];
            foreach ((array) ($s['streams'] ?? []) as $u) {
                $u = trim((string) $u);
                if (self::isHttpUrl($u) && !in_array($u, $streams, true)) {
                    $streams[] = $u;
                }
            }
            $out[] = [
                'id' => $id,
                'name_ar' => (string) ($s['name_ar'] ?? $id),
                'name_en' => (string) ($s['name_en'] ?? ($s['name_ar'] ?? $id)),
                'country' => preg_match('/^[A-Z]{2}$/', (string) ($s['country'] ?? '')) ? (string) $s['country'] : '',
                'category' => $cat,
                'featured' => (bool) ($s['featured'] ?? false),
                'source' => 'catalog',
                'streams' => $streams,
            ];
        }
        return $out;
    }

    // ─── mp3quran ───────────────────────────────────────────────────────────

    /**
     * The mp3quran channels, refreshed at most once per LIST_TTL (stale copy on failure). Null when never fetched
     * and unreachable.
     * @return array{fetched_at:int, stale:bool, stations:list<array<string,mixed>>}|null
     */
    public static function mp3quranList(bool $force = false, array &$log = []): ?array
    {
        $file = self::listFile();
        $cached = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
        $cached = is_array($cached) && isset($cached['fetched_at'], $cached['stations']) && is_array($cached['stations']) ? $cached : null;
        $now = time();
        $fresh = $cached !== null && $now - (int) $cached['fetched_at'] < self::LIST_TTL;
        $failedAt = is_file($file . '.failed') ? (int) @file_get_contents($file . '.failed') : 0;
        if (!$force && ($fresh || $now - $failedAt < self::RETRY)) {
            return $cached !== null ? $cached + ['stale' => !$fresh] : null;
        }
        $lock = @fopen($file . '.lock', 'c');
        if ($lock !== false && !flock($lock, LOCK_EX | ($force ? 0 : LOCK_NB))) {
            fclose($lock);
            return $cached !== null ? $cached + ['stale' => !$fresh] : null;
        }
        try {
            $stations = self::fetchMp3quran($log);
            if ($stations !== null) {
                $doc = ['fetched_at' => $now, 'stations' => $stations];
                self::writeAtomic($file, (string) json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                @unlink($file . '.failed');
                return $doc + ['stale' => false];
            }
            self::writeAtomic($file . '.failed', (string) $now);
            return $cached !== null ? $cached + ['stale' => true] : null;
        } finally {
            if ($lock !== false) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    /**
     * GET <base>/radios?language=ar from the first upstream that answers (English names from language=eng, optional).
     * @param list<string> $log
     * @return list<array<string,mixed>>|null
     */
    public static function fetchMp3quran(array &$log = []): ?array
    {
        foreach (self::mp3quranUpstreams() as $base) {
            $url = $base . '/radios?language=ar';
            $res = Http::request('GET', $url, ['Accept' => 'application/json'], null, 20, self::isLoopback($url), 4_000_000);
            $list = is_array($res['json']) ? ($res['json']['radios'] ?? null) : null;
            $ok = $res['status'] === 200 && is_array($list) && $list !== [];
            $log[] = sprintf('%s → HTTP %d%s', $url, $res['status'], $ok ? ' ok, ' . count($list) . ' radios' : ' (unusable' . ($res['error'] !== '' ? ': ' . $res['error'] : '') . ')');
            if (!$ok) {
                continue;
            }
            $en = [];
            $resEn = Http::request('GET', $base . '/radios?language=eng', ['Accept' => 'application/json'], null, 20, self::isLoopback($url), 4_000_000);
            foreach ((array) (is_array($resEn['json']) ? ($resEn['json']['radios'] ?? []) : []) as $r) {
                if (is_array($r) && isset($r['id'], $r['name'])) {
                    $en[(int) $r['id']] = trim((string) $r['name']);
                }
            }
            $log[] = sprintf('%s/radios?language=eng → HTTP %d, %d English names', $base, $resEn['status'], count($en));
            return self::parseMp3quran($list, $en);
        }
        return null;
    }

    /**
     * mp3quran radios → stations. Pure (tests, CLI). Only https URLs on a public host name; duplicates dropped.
     * @param list<mixed> $list @param array<int,string> $en
     * @return list<array<string,mixed>>
     */
    public static function parseMp3quran(array $list, array $en = []): array
    {
        $out = [];
        $seen = [];
        foreach ($list as $r) {
            if (!is_array($r)) {
                continue;
            }
            $id = (int) ($r['id'] ?? 0);
            $name = trim((string) preg_replace('/\s+/u', ' ', (string) ($r['name'] ?? '')));
            $url = trim((string) ($r['url'] ?? ''));
            if ($id <= 0 || $name === '' || !self::browserSafe($url) || !self::publicHost($url)) {
                continue;
            }
            $k = self::urlKey($url);
            $n = Riwayat::norm($name);
            if (isset($seen[$k]) || isset($seen[$n])) {
                continue;
            }
            $seen[$k] = $seen[$n] = true;
            $out[] = [
                'id' => 'mp3q-' . $id,
                'name_ar' => $name,
                'name_en' => ($en[$id] ?? '') !== '' ? $en[$id] : $name,
                'country' => '',
                'category' => self::mp3quranCategory($name),
                'featured' => false,
                'source' => 'mp3quran',
                'streams' => [$url],
            ];
        }
        return $out;
    }

    public static function mp3quranCategory(string $name): string
    {
        $n = Riwayat::norm($name);
        if (str_contains($n, 'تفسير') || str_contains($n, 'التفسير')) {
            return 'tafsir';
        }
        foreach (['رقيه', 'اذكار', 'الاذكار', 'فتاوي', 'سيره', 'السيره', 'دروس', 'محاضرات', 'احاديث', 'الحديث', 'ترجمه', 'تكبيرات', 'قصص', 'فضائل'] as $w) {
            if (str_contains($n, $w)) {
                return 'programs';
            }
        }
        return 'recitation';
    }

    // ─── stream check ───────────────────────────────────────────────────────

    /**
     * Probe every candidate of every station; per station the first candidate that works wins.
     * @param list<array<string,mixed>> $stations
     * @param array<string,list<string>>|null $trace receives, per station id, one line per candidate tried
     * @return array<string,array{fp:string,status:string,url:?string,hls:bool,bitrate:?int,content_type:string,checked_at:int}>
     */
    public static function check(array $stations, ?array &$trace = null): array
    {
        $urls = [];
        foreach ($stations as $s) {
            foreach ($s['streams'] as $i => $u) {
                $urls[$s['id'] . '#' . $i] = $u;
            }
        }
        $probes = $urls !== [] ? Http::probeMany($urls, self::PROBE_BYTES, self::PROBE_TIMEOUT, self::CONCURRENCY) : [];
        $evals = [];
        $follow = [];
        foreach ($probes as $k => $p) {
            $evals[$k] = self::evaluate($p);
            if ($evals[$k]['playlist'] !== null) {
                $follow[$k] = $evals[$k]['playlist'];
            }
        }
        // plain .m3u / .pls playlists: probe the stream they point to (one level)
        if ($follow !== []) {
            foreach (Http::probeMany($follow, self::PROBE_BYTES, self::PROBE_TIMEOUT, self::CONCURRENCY) as $k => $p) {
                $e = self::evaluate($p);
                $e['reason'] = 'playlist → ' . $follow[$k] . ': ' . $e['reason'];
                $e['playlist'] = null;
                $evals[$k] = $e;
            }
        }
        $now = time();
        $out = [];
        $trace = [];
        foreach ($stations as $s) {
            $pick = null;
            foreach ($s['streams'] as $i => $u) {
                $e = $evals[$s['id'] . '#' . $i];
                $trace[$s['id']][] = sprintf('%s %s — %s', $e['ok'] ? 'OK  ' : 'FAIL', $u, $e['reason']);
                if ($e['ok'] && $pick === null) {
                    $pick = $e;
                }
            }
            if ($s['streams'] === []) {
                $trace[$s['id']][] = 'FAIL (no stream URL in the catalogue)';
            }
            $fallback = self::firstBrowserSafe($s['streams']);
            $out[$s['id']] = [
                'fp' => self::fingerprint($s),
                'status' => $pick !== null ? 'ok' : 'down',
                'url' => $pick['url'] ?? $fallback,
                'hls' => $pick !== null ? $pick['hls'] : ($fallback !== null && self::looksHls($fallback)),
                'bitrate' => $pick['bitrate'] ?? null,
                'content_type' => $pick['content_type'] ?? '',
                'checked_at' => $now,
            ];
        }
        return $out;
    }

    /**
     * Is this probe a stream a browser can play? Pure (tests).
     * @param array{status:int, headers:array<string,string>, chain:list<string>, body:string, bytes:int, error:string} $p
     * @return array{ok:bool, url:?string, hls:bool, bitrate:?int, content_type:string, reason:string, playlist:?string}
     */
    public static function evaluate(array $p): array
    {
        $fail = static fn (string $why, string $ct = ''): array => ['ok' => false, 'url' => null, 'hls' => false, 'bitrate' => null, 'content_type' => $ct, 'reason' => $why, 'playlist' => null];
        $h = $p['headers'];
        $ct = strtolower(trim(explode(';', (string) ($h['content-type'] ?? ''))[0]));
        $status = $p['status'];
        if ($status === 0) {
            return $fail('no response' . ($p['error'] !== '' ? ': ' . $p['error'] : ''));
        }
        if ($status !== 200 && $status !== 206) {
            return $fail('HTTP ' . $status, $ct);
        }
        $chain = $p['chain'];
        $browserUrl = self::browserUrl($chain);
        $body = $p['body'];
        $head = ltrim(substr($body, 0, 512), "\xEF\xBB\xBF \t\r\n");
        $bitrate = self::icyBitrate($h['icy-br'] ?? null);
        $isPlaylistType = in_array($ct, self::HLS_TYPES, true) || str_starts_with($head, '#EXTM3U');
        if ($isPlaylistType && str_contains($body, '#EXT-X-')) {
            if ($browserUrl === null) {
                return $fail('HLS playlist only reachable over http', $ct);
            }
            // segments / variants given as absolute http URLs would be blocked as mixed content
            foreach (preg_split('/\r?\n/', $body) ?: [] as $line) {
                $line = trim($line);
                if ($line !== '' && $line[0] !== '#' && preg_match('#^http://#i', $line) && !self::browserSafe($line)) {
                    return $fail('HLS playlist references http:// media', $ct);
                }
            }
            if ($bitrate === null && preg_match('/BANDWIDTH=(\d+)/', $body, $m)) {
                $bitrate = (int) round((int) $m[1] / 1000);
            }
            return ['ok' => true, 'url' => $browserUrl, 'hls' => true, 'bitrate' => $bitrate, 'content_type' => $ct, 'reason' => 'HLS ' . $ct . self::via($chain), 'playlist' => null];
        }
        if ($isPlaylistType || in_array($ct, self::PLS_TYPES, true) || stripos($head, '[playlist]') === 0) {
            $entry = self::playlistEntry($body, (string) end($chain));
            return $entry !== null
                ? ['ok' => false, 'url' => null, 'hls' => false, 'bitrate' => null, 'content_type' => $ct, 'reason' => 'playlist', 'playlist' => $entry]
                : $fail('playlist without a stream URL', $ct);
        }
        $icy = false;
        foreach (array_keys($h) as $name) {
            $icy = $icy || str_starts_with($name, 'icy-');
        }
        $audioType = str_starts_with($ct, 'audio/') || $ct === 'application/ogg' || $ct === 'video/mp2t';
        $sniffed = self::sniffAudio($body);
        if (!$audioType && !$icy && !$sniffed) {
            return $fail('not audio (' . ($ct !== '' ? $ct : 'no content-type') . ')', $ct);
        }
        if ($head !== '' && $head[0] === '<') {
            return $fail('HTML page, not a stream', $ct);
        }
        if ($p['bytes'] < self::MIN_BYTES) {
            return $fail(sprintf('only %d bytes of audio%s', $p['bytes'], $p['error'] !== '' ? ' (' . $p['error'] . ')' : ''), $ct);
        }
        if ($browserUrl === null) {
            // Some hosts (e.g. radiojar) answer an https URL with a redirect to a tokenised
            // http URL. Browsers auto-upgrade such mixed-content audio to https, so if the
            // final host also serves the stream over https, the original https URL works.
            $first = $chain[0] ?? '';
            $last = (string) end($chain);
            if (str_starts_with($first, 'https://') && str_starts_with($last, 'http://')
                && self::httpsServesAudio('https://' . substr($last, 7))) {
                $browserUrl = $first;
            } else {
                return $fail('works over http only (blocked as mixed content on https)', $ct);
            }
        }
        return ['ok' => true, 'url' => $browserUrl, 'hls' => false, 'bitrate' => $bitrate, 'content_type' => $ct !== '' ? $ct : ($icy ? 'icy' : 'audio'),
            'reason' => trim(($ct !== '' ? $ct : 'audio') . ($icy ? ' (ICY)' : '') . ($bitrate ? ' ' . $bitrate . ' kbps' : '') . self::via($chain)), 'playlist' => null];
    }

    /**
     * The URL to give the browser: the first URL of the redirect chain from which every hop is browser-safe.
     * @param list<string> $chain
     */
    public static function browserUrl(array $chain): ?string
    {
        $pick = null;
        for ($i = count($chain) - 1; $i >= 0; $i--) {
            if (!self::browserSafe($chain[$i])) {
                break;
            }
            $pick = $chain[$i];
        }
        return $pick;
    }

    /** Quick check that an https URL answers with audio (used for the http→https upgrade case). */
    private static function httpsServesAudio(string $url): bool
    {
        if (!function_exists('curl_init') || !self::publicHost($url)) {
            return false;
        }
        $ch = curl_init($url);
        $got = '';
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => ['Icy-MetaData: 0', 'User-Agent: NurAlQuran-RadioCheck/1.0'],
            CURLOPT_WRITEFUNCTION => static function ($c, $data) use (&$got) {
                $got .= $data;
                return strlen($got) >= 4096 ? 0 : strlen($data); // stop after 4 KB
            },
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $ct = strtolower((string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        curl_close($ch);
        return in_array($code, [200, 206], true) && strlen($got) >= 1024
            && (str_starts_with($ct, 'audio/') || $ct === 'application/ogg' || self::sniffAudio($got));
    }

    /** https, or plain http to 127.0.0.1 (the local test upstream; a loopback address is a secure context in browsers). */
    public static function browserSafe(string $url): bool
    {
        $p = parse_url($url);
        if (!is_array($p) || empty($p['host']) || isset($p['user'])) {
            return false;
        }
        $scheme = strtolower((string) ($p['scheme'] ?? ''));
        return $scheme === 'https' || ($scheme === 'http' && $p['host'] === '127.0.0.1');
    }

    // ─── status cache ───────────────────────────────────────────────────────

    /** @return array{checked_at:int, stations:array<string,array<string,mixed>>}|null */
    public static function readStatus(): ?array
    {
        $file = self::statusFile();
        $doc = is_file($file) ? json_decode((string) @file_get_contents($file), true) : null;
        return is_array($doc) && isset($doc['checked_at'], $doc['stations']) && is_array($doc['stations']) ? $doc : null;
    }

    /**
     * Run the check and store it. Returns the new status, or null when another check is running (non-forced) or when
     * the check reached nothing while the previous one had working stations (the previous results are kept).
     * @param list<array<string,mixed>> $stations
     */
    public static function refreshStatus(array $stations, bool $force = false, ?array &$trace = null): ?array
    {
        $file = self::statusFile();
        $lock = @fopen($file . '.lock', 'c');
        if ($lock !== false && !flock($lock, LOCK_EX | ($force ? 0 : LOCK_NB))) {
            fclose($lock);
            return null;
        }
        try {
            if (function_exists('set_time_limit')) {
                @set_time_limit(180);
            }
            return self::storeStatus(self::check($stations, $trace));
        } finally {
            if ($lock !== false) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    /**
     * Store check results (Radio::check). When they reach nothing at all while the previous check had working stations
     * (the server lost its network), the previous results are kept, null is returned and the next try is in RETRY s.
     * @param array<string,array<string,mixed>> $result
     */
    public static function storeStatus(array $result): ?array
    {
        $file = self::statusFile();
        $prev = self::readStatus();
        $okNow = count(array_filter($result, static fn (array $r): bool => $r['status'] === 'ok'));
        $okBefore = $prev !== null ? count(array_filter($prev['stations'], static fn ($r): bool => is_array($r) && ($r['status'] ?? '') === 'ok')) : 0;
        if ($okNow === 0 && $okBefore > 0) {
            self::writeAtomic($file . '.failed', (string) time());
            return null;
        }
        $doc = ['checked_at' => time(), 'stations' => $result];
        self::writeAtomic($file, (string) json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        @unlink($file . '.failed');
        return $doc;
    }

    /**
     * @param list<array<string,mixed>> $stations
     * @return array{checked_at:?string, stale:bool, stations:list<array<string,mixed>>}
     */
    public static function shape(array $stations, ?array $status): array
    {
        $rows = [];
        foreach ($stations as $s) {
            $st = $status['stations'][$s['id']] ?? null;
            $known = is_array($st) && ($st['fp'] ?? '') === self::fingerprint($s);
            $url = $known ? ($st['url'] ?? null) : self::firstBrowserSafe($s['streams']);
            $rows[] = [
                'id' => $s['id'],
                'name_ar' => $s['name_ar'],
                'name_en' => $s['name_en'],
                'country' => $s['country'] !== '' ? $s['country'] : null,
                'category' => $s['category'],
                'featured' => $s['featured'],
                'source' => $s['source'],
                'url' => is_string($url) && self::browserSafe($url) ? $url : null,
                'hls' => $known ? (bool) ($st['hls'] ?? false) : ($url !== null && self::looksHls((string) $url)),
                'status' => $s['streams'] === [] ? 'down' : ($known ? (string) $st['status'] : 'unknown'),
                'bitrate' => $known && isset($st['bitrate']) ? (int) $st['bitrate'] : null,
            ];
        }
        $checked = $status !== null ? (int) $status['checked_at'] : null;
        return [
            'checked_at' => $checked !== null ? gmdate('Y-m-d\TH:i:s\Z', $checked) : null,
            'stale' => $checked === null || time() - $checked >= self::CHECK_TTL,
            'stations' => $rows,
        ];
    }

    public static function statusFile(): string
    {
        return Config::storageDir('cache/radio') . '/status.json';
    }

    public static function listFile(): string
    {
        return Config::storageDir('cache/radio') . '/mp3quran.json';
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    /** @param array<string,mixed> $s */
    public static function fingerprint(array $s): string
    {
        return substr(sha1(implode("\n", $s['streams'])), 0, 12);
    }

    /** @param list<string> $streams */
    private static function firstBrowserSafe(array $streams): ?string
    {
        foreach ($streams as $u) {
            if (self::browserSafe($u)) {
                return $u;
            }
        }
        return null;
    }

    private static function looksHls(string $url): bool
    {
        return (bool) preg_match('#\.m3u8($|\?)#i', $url);
    }

    private static function icyBitrate(mixed $v): ?int
    {
        return is_string($v) && preg_match('/^\s*(\d{1,4})/', $v, $m) && (int) $m[1] > 0 ? (int) $m[1] : null;
    }

    /** MP3 / AAC (ADTS) frame sync, ID3, Ogg or FLAC magic at the start of the body. */
    private static function sniffAudio(string $b): bool
    {
        if ($b === '') {
            return false;
        }
        if (str_starts_with($b, 'ID3') || str_starts_with($b, 'OggS') || str_starts_with($b, 'fLaC')) {
            return true;
        }
        // look for two frame syncs in the first KB (a single 0xFF Ex byte pair occurs by chance in any data)
        return preg_match_all('/\xFF[\xE0-\xFF]/', substr($b, 0, 4096)) >= 2 && !str_contains(substr($b, 0, 256), '<');
    }

    private static function playlistEntry(string $body, string $base): ?string
    {
        foreach (preg_split('/\r?\n/', $body) ?: [] as $line) {
            $line = trim($line);
            if (preg_match('/^File\d+=(.+)$/i', $line, $m)) {
                $line = trim($m[1]);
            } elseif ($line === '' || $line[0] === '#' || $line[0] === '[' || str_contains($line, '=')) {
                continue;
            }
            $u = Http::resolveUrl($base, $line);
            if (self::isHttpUrl($u)) {
                return $u;
            }
        }
        return null;
    }

    /** @param list<string> $chain */
    private static function via(array $chain): string
    {
        return count($chain) > 1 ? ' via ' . (count($chain) - 1) . ' redirect(s) → ' . end($chain) : '';
    }

    private static function isHttpUrl(string $u): bool
    {
        $p = parse_url($u);
        return is_array($p) && in_array(strtolower((string) ($p['scheme'] ?? '')), ['http', 'https'], true) && !empty($p['host']) && !isset($p['user']);
    }

    /** A DNS name (not an IP literal, not localhost) — for URLs that come from a third-party API. */
    private static function publicHost(string $url): bool
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '127.0.0.1') {
            return self::mp3quranUpstreams() !== self::MP3QURAN_UPSTREAMS; // only with the local test upstream
        }
        return $host !== '' && $host !== 'localhost' && filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) === false
            && (bool) preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $host);
    }

    /** scheme-insensitive, lower-case host, no trailing slash: «https://Qurango.net/radio/mix/» ≡ «http://qurango.net/radio/mix». */
    private static function urlKey(string $u): string
    {
        $p = parse_url($u);
        if (!is_array($p)) {
            return $u;
        }
        return strtolower((string) ($p['host'] ?? '')) . (isset($p['port']) ? ':' . $p['port'] : '') . rtrim((string) ($p['path'] ?? ''), '/') . (isset($p['query']) ? '?' . $p['query'] : '');
    }

    /** @return list<string> */
    private static function mp3quranUpstreams(): array
    {
        $v = Config::get('radio_upstream_mp3quran');
        $list = is_string($v) && $v !== '' ? [$v] : (is_array($v) && $v !== [] ? $v : self::MP3QURAN_UPSTREAMS);
        return array_values(array_map(static fn ($u): string => rtrim((string) $u, '/'), $list));
    }

    private static function isLoopback(string $url): bool
    {
        $p = parse_url($url);
        return is_array($p) && ($p['scheme'] ?? '') === 'http' && in_array($p['host'] ?? '', ['127.0.0.1', 'localhost'], true);
    }

    private static function writeAtomic(string $file, string $contents): void
    {
        $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $contents) !== false) {
            @chmod($tmp, 0600);
            if (!@rename($tmp, $file)) {
                @unlink($tmp);
            }
        }
    }
}
