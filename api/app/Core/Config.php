<?php
declare(strict_types=1);

namespace NQ\Core;

/** Read-only access to config.php (which lives outside the web root). */
final class Config
{
    /** @var array<string,mixed> */
    private static array $values = [];
    private static string $baseDir = '';

    /** @param array<string,mixed> $values */
    public static function init(string $baseDir, array $values): void
    {
        self::$baseDir = rtrim($baseDir, '/');
        $defaults = [
            'db' => ['host' => 'localhost', 'name' => '', 'user' => '', 'pass' => '', 'charset' => 'utf8mb4', 'port' => 3306],
            'app_key' => '',
            'site_url' => 'https://nuralquran.net',
            'api_url' => 'https://api.nuralquran.net',
            'cookie_domain' => '.nuralquran.net',
            'cors_origins' => [],
            'mail_from' => 'no-reply@nuralquran.net',
            'mail_transport' => 'mail',   // 'mail' (PHP mail()) or 'log' (write to storage/mail, for local testing)
            'trust_proxy' => false,       // true only behind a reverse proxy you control (uses X-Forwarded-For)
            'app_scheme' => 'nuralquran', // native app deep-link scheme
        ];
        self::$values = array_replace($defaults, $values);
        self::$values['db'] = array_replace($defaults['db'], is_array($values['db'] ?? null) ? $values['db'] : []);
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::$values[$key] ?? $default;
    }

    /** @return array<string,mixed> */
    public static function db(): array
    {
        return self::$values['db'];
    }

    public static function baseDir(): string
    {
        return self::$baseDir;
    }

    public static function storageDir(string $sub = ''): string
    {
        $dir = self::$baseDir . '/storage' . ($sub !== '' ? '/' . $sub : '');
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        return $dir;
    }

    public static function siteUrl(): string
    {
        return rtrim((string) self::get('site_url'), '/');
    }

    public static function apiUrl(): string
    {
        return rtrim((string) self::get('api_url'), '/');
    }

    /** The raw 32-byte application key. */
    public static function appKey(): string
    {
        $raw = base64_decode((string) self::get('app_key'), true);
        if ($raw === false || strlen($raw) !== 32) {
            throw new \RuntimeException('app_key in config.php must be base64 of 32 bytes');
        }
        return $raw;
    }
}
