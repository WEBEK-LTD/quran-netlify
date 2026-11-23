<?php
declare(strict_types=1);

namespace NQ\Core;

/** Input validation helpers. Each throws ApiError::validation on bad input. */
final class V
{
    private static function fail(string $field, string $msg): never
    {
        throw ApiError::validation([$field => $msg]);
    }

    /** Remove control characters (keeps \n and \t when $multiline). */
    public static function clean(string $s, bool $multiline = false): string
    {
        $s = $multiline
            ? (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', str_replace("\r\n", "\n", $s))
            : (string) preg_replace('/[\x00-\x1F\x7F]/u', '', $s);
        return trim($s);
    }

    /** @param array<string,mixed> $b */
    public static function str(array $b, string $key, int $max, bool $required = true, int $min = 1, bool $multiline = false): ?string
    {
        if (!array_key_exists($key, $b) || $b[$key] === null) {
            if ($required) {
                self::fail($key, 'هذا الحقل مطلوب.');
            }
            return null;
        }
        if (!is_string($b[$key]) && !is_int($b[$key]) && !is_float($b[$key])) {
            self::fail($key, 'قيمة غير صالحة.');
        }
        $v = self::clean((string) $b[$key], $multiline);
        if (!mb_check_encoding($v, 'UTF-8')) {
            self::fail($key, 'قيمة غير صالحة.');
        }
        $len = mb_strlen($v);
        if ($len < $min) {
            self::fail($key, $min <= 1 ? 'هذا الحقل مطلوب.' : "يجب ألا يقل عن {$min} أحرف.");
        }
        if ($len > $max) {
            self::fail($key, "يجب ألا يزيد عن {$max} حرفاً.");
        }
        return $v;
    }

    /** @param array<string,mixed> $b */
    public static function int(array $b, string $key, int $min, int $max, bool $required = true): ?int
    {
        if (!array_key_exists($key, $b) || $b[$key] === null) {
            if ($required) {
                self::fail($key, 'هذا الحقل مطلوب.');
            }
            return null;
        }
        $v = $b[$key];
        if (is_string($v) && preg_match('/^-?\d{1,10}$/', $v)) {
            $v = (int) $v;
        }
        if (is_float($v) && floor($v) === $v) {
            $v = (int) $v;
        }
        if (!is_int($v) || $v < $min || $v > $max) {
            self::fail($key, "يجب أن يكون رقماً بين {$min} و {$max}.");
        }
        return $v;
    }

    /** @param array<string,mixed> $b */
    public static function bool(array $b, string $key, bool $required = true): ?bool
    {
        if (!array_key_exists($key, $b) || $b[$key] === null) {
            if ($required) {
                self::fail($key, 'هذا الحقل مطلوب.');
            }
            return null;
        }
        $v = $b[$key];
        if (is_bool($v)) {
            return $v;
        }
        if ($v === 0 || $v === 1 || $v === '0' || $v === '1') {
            return (bool) (int) $v;
        }
        self::fail($key, 'يجب أن تكون القيمة صحيحة أو خاطئة.');
    }

    /** @param array<string,mixed> $b @param list<string> $allowed */
    public static function enum(array $b, string $key, array $allowed, bool $required = true): ?string
    {
        $v = self::str($b, $key, 50, $required, $required ? 1 : 0);
        if ($v === null || ($v === '' && !$required)) {
            return null;
        }
        if (!in_array($v, $allowed, true)) {
            self::fail($key, 'قيمة غير مسموحة.');
        }
        return $v;
    }

    /** @param array<string,mixed> $b */
    public static function email(array $b, string $key = 'email'): string
    {
        $v = mb_strtolower((string) self::str($b, $key, 254));
        if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
            self::fail($key, 'البريد الإلكتروني غير صحيح.');
        }
        return $v;
    }

    /** @param array<string,mixed> $b */
    public static function password(array $b, string $key = 'password'): string
    {
        $v = $b[$key] ?? null;
        if (!is_string($v) || $v === '') {
            self::fail($key, 'كلمة المرور مطلوبة.');
        }
        if (mb_strlen($v) < 8) {
            self::fail($key, 'يجب ألا تقل كلمة المرور عن 8 أحرف.');
        }
        if (strlen($v) > 72) {
            self::fail($key, 'كلمة المرور طويلة جداً (الحد الأقصى 72 بايت).');
        }
        return $v;
    }

    public static function isDate(string $v): bool
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) {
            return false;
        }
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) && (int) $m[1] >= 1900 && (int) $m[1] <= 2200;
    }

    /** @param array<string,mixed> $b */
    public static function date(array $b, string $key, bool $required = true): ?string
    {
        $v = self::str($b, $key, 10, $required, $required ? 1 : 0);
        if ($v === null || $v === '') {
            if ($required) {
                self::fail($key, 'هذا الحقل مطلوب.');
            }
            return null;
        }
        if (!self::isDate($v)) {
            self::fail($key, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD.');
        }
        return $v;
    }

    /**
     * Parse an ISO-8601 date/time (or epoch milliseconds) into a UTC DATETIME string.
     * @param array<string,mixed> $b
     */
    public static function datetime(array $b, string $key, bool $required = true): ?string
    {
        if (!array_key_exists($key, $b) || $b[$key] === null || $b[$key] === '') {
            if ($required) {
                self::fail($key, 'هذا الحقل مطلوب.');
            }
            return null;
        }
        $v = $b[$key];
        if (is_int($v) || is_float($v)) {
            $sec = $v > 1e11 ? $v / 1000 : $v;
            return gmdate('Y-m-d H:i:s', (int) $sec);
        }
        if (!is_string($v) || strlen($v) > 40) {
            self::fail($key, 'تاريخ غير صالح.');
        }
        try {
            $d = new \DateTimeImmutable($v, new \DateTimeZone('UTC'));
        } catch (\Exception) {
            self::fail($key, 'تاريخ غير صالح.');
        }
        $y = (int) $d->format('Y');
        if ($y < 1970 || $y > 2200) {
            self::fail($key, 'تاريخ غير صالح.');
        }
        return $d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    }

    /** @return array{0:int,1:int,2:int} page, per_page, offset */
    public static function page(Request $r, int $defaultPer = 50): array
    {
        $page = (int) ($r->q('page') ?? '1');
        $per = (int) ($r->q('per_page') ?? (string) $defaultPer);
        $page = max(1, min($page, 100000));
        $per = max(1, min($per, 100));
        return [$page, $per, ($page - 1) * $per];
    }

    /** @param list<mixed> $items @return array<string,mixed> */
    public static function paginated(array $items, int $page, int $per, int $total): array
    {
        return ['items' => $items, 'page' => $page, 'per_page' => $per, 'total' => $total];
    }
}
