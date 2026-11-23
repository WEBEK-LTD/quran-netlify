<?php
declare(strict_types=1);

namespace NQ\Core;

/** Fixed-window rate limiter stored in the `rate_limits` table. */
final class RateLimit
{
    /** Named limits: [max hits, window seconds]. */
    public const LIMITS = [
        'login'   => [10, 600],
        'signup'  => [5, 3600],
        'forgot'  => [5, 3600],
        'resend'  => [5, 3600],
        'ai'      => [20, 3600],
        'reading' => [2, 1],
        'writes'  => [120, 60],
        'presence' => [10, 60],
        'avatar'  => [10, 3600],
        'riwayat' => [60, 600],   // uncached riwaya texts fetched from upstream, per IP
    ];

    /**
     * Count one hit for each subject (e.g. "ip:1.2.3.4", "user:5") and throw 429 when any exceeds the limit.
     * @param list<string> $subjects
     */
    public static function hit(string $name, array $subjects): void
    {
        [$max, $window] = self::LIMITS[$name];
        $now = time();
        $windowStart = $now - ($now % $window);
        $expires = gmdate('Y-m-d H:i:s', $windowStart + $window);
        $worstRetry = 0;
        foreach ($subjects as $subject) {
            $bucket = hash('sha256', $name . '|' . $subject);
            Db::exec(
                'INSERT INTO rate_limits (bucket, window_start, hits, expires_at) VALUES (?, ?, 1, ?)
                 ON DUPLICATE KEY UPDATE hits = hits + 1',
                [$bucket, $windowStart, $expires]
            );
            $hits = (int) Db::value('SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?', [$bucket, $windowStart]);
            if ($hits > $max) {
                $worstRetry = max($worstRetry, $windowStart + $window - $now);
            }
        }
        if (random_int(1, 200) === 1) {
            Db::exec('DELETE FROM rate_limits WHERE expires_at < ?', [Db::now(-60)]);
        }
        if ($worstRetry > 0) {
            throw ApiError::rateLimited($worstRetry);
        }
    }

    /** Subjects for the current request: always the IP, plus the user when signed in. @return list<string> */
    public static function subjects(Request $r, ?string $extra = null): array
    {
        $s = ['ip:' . $r->ip];
        if ($r->user !== null) {
            $s[] = 'user:' . $r->user['id'];
        }
        if ($extra !== null) {
            $s[] = $extra;
        }
        return $s;
    }
}
