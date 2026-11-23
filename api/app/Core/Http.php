<?php
declare(strict_types=1);

namespace NQ\Core;

/** Minimal outbound HTTPS client (curl), plus a parallel stream prober for the radio checker. */
final class Http
{
    /**
     * $allowHttp permits plain http:// (only for local test upstreams; production calls stay https-only).
     * $maxBytes > 0 aborts responses larger than that. $curlOpts are extra curl options (e.g. HTTP/2 for APNs).
     * @param array<string,string> $headers
     * @param array<int,mixed> $curlOpts
     * @return array{status:int, json:mixed, raw:string, error:string}
     */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 45, bool $allowHttp = false, int $maxBytes = 0, array $curlOpts = []): array
    {
        $ch = curl_init($url);
        $h = [];
        foreach ($headers as $k => $v) {
            $h[] = $k . ': ' . $v;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $h,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'NurAlQuran-API/1.0',
        ]);
        if (defined('CURLOPT_PROTOCOLS_STR')) {
            curl_setopt($ch, CURLOPT_PROTOCOLS_STR, $allowHttp ? 'http,https' : 'https');
        } else {
            curl_setopt($ch, CURLOPT_PROTOCOLS, $allowHttp ? (CURLPROTO_HTTP | CURLPROTO_HTTPS) : CURLPROTO_HTTPS);
        }
        if ($method === 'HEAD') {
            curl_setopt($ch, CURLOPT_NOBODY, true);
        }
        if ($curlOpts !== []) {
            curl_setopt_array($ch, $curlOpts);
        }
        if ($maxBytes > 0) {
            curl_setopt($ch, CURLOPT_NOPROGRESS, false);
            curl_setopt($ch, CURLOPT_XFERINFOFUNCTION, static fn ($c, int $dlTotal, int $dlNow): int => $dlNow > $maxBytes ? 1 : 0);
        }
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        $err = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $raw = is_string($raw) ? $raw : '';
        $json = $raw !== '' ? json_decode($raw, true) : null;
        return ['status' => $status, 'json' => $json, 'raw' => $raw, 'error' => $err];
    }

    /** @param array<string,mixed> $data @param array<string,string> $headers */
    public static function postJson(string $url, array $data, array $headers = [], int $timeout = 45): array
    {
        $headers['Content-Type'] = 'application/json';
        $headers['Accept'] = 'application/json';
        return self::request('POST', $url, $headers, (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $timeout);
    }

    /** @param array<string,string> $data */
    public static function postForm(string $url, array $data, int $timeout = 20): array
    {
        return self::request('POST', $url, ['Content-Type' => 'application/x-www-form-urlencoded', 'Accept' => 'application/json'], http_build_query($data), $timeout);
    }

    /**
     * Probe several (audio) URLs in parallel with a short GET: follow up to 5 redirects (http/https only), keep at most
     * $maxBytes of the body (then hang up — live streams never end), give up after $timeout seconds per URL.
     * Plain http is allowed here because this only reads a few bytes server-side; callers decide what a browser may get.
     * No Range header is sent: many Icecast/Shoutcast servers answer a Range request with 416 or an empty 206.
     *
     * Each result: status (last hop; 0 = no response), headers (last hop, lower-case names), chain (every URL visited,
     * redirects resolved, the last one is the URL that answered), body (≤ $maxBytes), bytes, error ('' when the transfer
     * ended normally or was cut off on purpose after $maxBytes), time (s).
     *
     * @param array<string,string> $urls key => url
     * @param array<string,string> $headers
     * @return array<string,array{status:int, headers:array<string,string>, chain:list<string>, body:string, bytes:int, error:string, time:float}>
     */
    public static function probeMany(array $urls, int $maxBytes = 65536, int $timeout = 8, int $concurrency = 16, array $headers = []): array
    {
        $out = [];
        $queue = $urls;
        $mh = curl_multi_init();
        $active = [];   // (int) handle id => [key, handle]
        $state = [];    // key => mutable transfer state
        $h = ['Accept: */*', 'Icy-MetaData: 0'];
        foreach ($headers as $k => $v) {
            $h[] = $k . ': ' . $v;
        }
        $add = static function (string $key, string $url) use ($mh, &$active, &$state, $maxBytes, $timeout, $h): void {
            $state[$key] = ['headers' => [], 'chain' => [$url], 'body' => '', 'bytes' => 0, 'full' => false];
            $st = &$state[$key];
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_HTTPGET => true,
                CURLOPT_HTTPHEADER => $h,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 5,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_USERAGENT => 'NurAlQuran-RadioCheck/1.0',
                CURLOPT_HEADERFUNCTION => static function ($c, string $line) use (&$st): int {
                    $t = trim($line);
                    if ($t === '') {
                        return strlen($line);
                    }
                    if (preg_match('#^(HTTP/\S+|ICY)\s+\d{3}#i', $t)) {
                        $st['headers'] = [];   // a new hop starts: keep only the last response's headers
                        return strlen($line);
                    }
                    $p = strpos($t, ':');
                    if ($p !== false) {
                        $name = strtolower(trim(substr($t, 0, $p)));
                        $value = trim(substr($t, $p + 1));
                        $st['headers'][$name] = $value;
                        if ($name === 'location' && $value !== '') {
                            $st['chain'][] = self::resolveUrl((string) end($st['chain']), $value);
                        }
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => static function ($c, string $data) use (&$st, $maxBytes): int {
                    $room = $maxBytes - strlen($st['body']);
                    if ($room > 0) {
                        $st['body'] .= substr($data, 0, $room);
                    }
                    $st['bytes'] += strlen($data);
                    if ($st['bytes'] >= $maxBytes) {
                        $st['full'] = true;
                        return 0; // enough: hang up (curl reports a write error, which we ignore)
                    }
                    return strlen($data);
                },
            ]);
            if (defined('CURLOPT_PROTOCOLS_STR')) {
                curl_setopt($ch, CURLOPT_PROTOCOLS_STR, 'http,https');
                curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS_STR, 'http,https');
            } else {
                curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
                curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
            }
            curl_multi_add_handle($mh, $ch);
            $active[spl_object_id($ch)] = [$key, $ch, microtime(true)];
            unset($st);
        };
        do {
            while ($queue !== [] && count($active) < max(1, $concurrency)) {
                $key = (string) array_key_first($queue);
                $url = (string) $queue[$key];
                unset($queue[$key]);
                $add($key, $url);
            }
            curl_multi_exec($mh, $running);
            while (($info = curl_multi_info_read($mh)) !== false) {
                $ch = $info['handle'];
                $id = spl_object_id($ch);
                [$key, , $started] = $active[$id];
                $st = $state[$key];
                $err = $info['result'] === CURLE_OK || $st['full'] ? '' : (curl_error($ch) ?: 'curl error ' . $info['result']);
                $out[$key] = [
                    'status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
                    'headers' => $st['headers'],
                    'chain' => $st['chain'],
                    'body' => $st['body'],
                    'bytes' => $st['bytes'],
                    'error' => $err,
                    'time' => round(microtime(true) - $started, 2),
                ];
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
                unset($active[$id], $state[$key]);
            }
            if (($running > 0 || $active !== []) && curl_multi_select($mh, 0.5) === -1) {
                usleep(20000);
            }
        } while ($queue !== [] || $active !== []);
        curl_multi_close($mh);
        // keep the caller's order
        $ordered = [];
        foreach (array_keys($urls) as $k) {
            $ordered[(string) $k] = $out[(string) $k];
        }
        return $ordered;
    }

    /** Plain http is only ever allowed to this machine (local LiveKit API, test stand-ins). */
    public static function isLocalHttp(string $url): bool
    {
        $p = parse_url($url);
        return is_array($p) && ($p['scheme'] ?? '') === 'http' && in_array($p['host'] ?? '', ['127.0.0.1', 'localhost', '[::1]'], true);
    }

    /** Resolve a Location header against the URL that sent it. */
    public static function resolveUrl(string $base, string $ref): string
    {
        if (preg_match('#^[a-z][a-z0-9+.-]*://#i', $ref)) {
            return $ref;
        }
        $b = parse_url($base);
        if (!is_array($b) || !isset($b['scheme'], $b['host'])) {
            return $ref;
        }
        $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($ref, '//')) {
            return $b['scheme'] . ':' . $ref;
        }
        if (str_starts_with($ref, '/')) {
            return $origin . $ref;
        }
        if (str_starts_with($ref, '?')) {
            return $origin . ($b['path'] ?? '/') . $ref;
        }
        $dir = preg_replace('#/[^/]*$#', '/', $b['path'] ?? '/');
        return $origin . ($dir === '' ? '/' : $dir) . $ref;
    }
}
