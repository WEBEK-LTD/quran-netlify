<?php
declare(strict_types=1);

namespace NQ\Core;

/** Minimal outbound HTTPS client (curl). */
final class Http
{
    /**
     * @param array<string,string> $headers
     * @return array{status:int, json:mixed, raw:string, error:string}
     */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 45): array
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
            curl_setopt($ch, CURLOPT_PROTOCOLS_STR, 'https');
        } else {
            curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
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
}
