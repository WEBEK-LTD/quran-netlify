<?php
declare(strict_types=1);

namespace NQ\Core;

/** App-wide settings stored as JSON values in `app_settings`, merged over defaults. */
final class Settings
{
    public const FEATURES = ['hifz', 'khatma', 'khatma_group', 'leaderboard', 'ijaza', 'ai_assistant', 'notes', 'search'];

    /** @var array<string,mixed>|null */
    private static ?array $cache = null;

    /** @return array<string,mixed> */
    public static function defaults(): array
    {
        return [
            'app_name' => 'نور القرآن',
            'description' => 'تطبيق لقراءة القرآن الكريم وحفظه وتدبّره.',
            'announcement' => '',
            'maintenance_mode' => false,
            'allow_signup' => true,
            'features' => array_fill_keys(self::FEATURES, true),
        ];
    }

    /** @return array<string,mixed> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $s = self::defaults();
        foreach (Db::all('SELECT name, value FROM app_settings') as $row) {
            $v = json_decode((string) $row['value'], true);
            $k = (string) $row['name'];
            if (!array_key_exists($k, $s)) {
                continue;
            }
            if ($k === 'features') {
                if (is_array($v)) {
                    foreach (self::FEATURES as $f) {
                        if (array_key_exists($f, $v)) {
                            $s['features'][$f] = (bool) $v[$f];
                        }
                    }
                }
            } elseif (is_bool($s[$k])) {
                $s[$k] = (bool) $v;
            } else {
                $s[$k] = is_string($v) ? $v : $s[$k];
            }
        }
        return self::$cache = $s;
    }

    public static function get(string $key): mixed
    {
        return self::all()[$key] ?? null;
    }

    public static function feature(string $name): bool
    {
        return (bool) (self::all()['features'][$name] ?? true);
    }

    /** @param array<string,mixed> $values */
    public static function save(array $values): void
    {
        foreach ($values as $k => $v) {
            Db::exec(
                'INSERT INTO app_settings (name, value, updated_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)',
                [$k, json_encode($v, JSON_UNESCAPED_UNICODE), Db::now()]
            );
        }
        self::$cache = null;
    }

    /** Insert defaults that are missing (install / upgrade). */
    public static function seedDefaults(): void
    {
        foreach (self::defaults() as $k => $v) {
            Db::exec(
                'INSERT IGNORE INTO app_settings (name, value, updated_at) VALUES (?, ?, ?)',
                [$k, json_encode($v, JSON_UNESCAPED_UNICODE), Db::now()]
            );
        }
        self::$cache = null;
    }

    public static function requireFeature(string $name): void
    {
        if (!self::feature($name)) {
            throw ApiError::of(403, 'feature_disabled');
        }
    }
}
