<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Db;
use NQ\Core\Integrations;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Settings;
use NQ\Core\V;

final class PublicController
{
    public static function health(Request $r): array
    {
        $db = false;
        try {
            $db = (int) Db::value('SELECT 1') === 1;
        } catch (\Throwable $e) {
            error_log('[nq] health: database unavailable: ' . $e->getMessage());
        }
        if (!$db) {
            throw new ApiError(503, 'server', 'قاعدة البيانات غير متاحة حالياً.', ['status' => 'degraded', 'db' => false]);
        }
        return ['status' => 'ok', 'db' => true];
    }

    public static function settings(Request $r): array
    {
        $s = Settings::all();
        return [
            'app_name' => $s['app_name'],
            'description' => $s['description'],
            'announcement' => $s['announcement'],
            'maintenance_mode' => $s['maintenance_mode'],
            'allow_signup' => $s['allow_signup'],
            'features' => $s['features'],
            'google_login' => Integrations::googleConfigured(),
        ];
    }

    /** @param array<string,mixed> $b */
    public static function broadcastShape(array $b): array
    {
        return [
            'id' => (int) $b['id'],
            'title' => (string) $b['title'],
            'body' => (string) $b['body'],
            'type' => (string) $b['type'],
            'created_at' => Db::iso($b['created_at']),
            'expires_at' => Db::iso($b['expires_at']),
        ];
    }

    public static function broadcasts(Request $r): array
    {
        $rows = Db::all(
            'SELECT * FROM broadcasts WHERE expires_at IS NULL OR expires_at > ? ORDER BY id DESC LIMIT 20',
            [Db::now()]
        );
        return array_map([self::class, 'broadcastShape'], $rows);
    }

    public static function leaderboard(Request $r): array
    {
        Settings::requireFeature('leaderboard');
        $type = $r->q('type', 'reading');
        $period = $r->q('period', 'all');
        if (!in_array($type, ['reading', 'hifz', 'khatma'], true)) {
            throw ApiError::validation(['type' => 'قيمة غير مسموحة.']);
        }
        if (!in_array($period, ['week', 'month', 'all'], true)) {
            throw ApiError::validation(['period' => 'قيمة غير مسموحة.']);
        }
        $since = match ($period) {
            'week' => gmdate('Y-m-d', time() - 6 * 86400),
            'month' => gmdate('Y-m-d', time() - 29 * 86400),
            default => '1970-01-01',
        };
        $rows = match ($type) {
            // reading score = distinct ayahs read per day, summed over the period
            'reading' => Db::all(
                'SELECT u.id, u.name, COUNT(*) AS score FROM reading_log l JOIN users u ON u.id = l.user_id
                 WHERE u.show_on_leaderboard = 1 AND l.read_date >= ?
                 GROUP BY u.id, u.name ORDER BY score DESC, u.id ASC LIMIT 50',
                [$since]
            ),
            'hifz' => Db::all(
                'SELECT u.id, u.name, u.hifz_completed AS score FROM users u
                 WHERE u.show_on_leaderboard = 1 AND u.hifz_completed > 0
                 ORDER BY score DESC, u.id ASC LIMIT 50'
            ),
            'khatma' => Db::all(
                'SELECT u.id, u.name, COUNT(*) AS score FROM khatmat k JOIN users u ON u.id = k.user_id
                 WHERE u.show_on_leaderboard = 1 AND k.created_at >= ?
                 GROUP BY u.id, u.name ORDER BY score DESC, u.id ASC LIMIT 50',
                [$since . ' 00:00:00']
            ),
        };
        $me = $r->user !== null ? (int) $r->user['id'] : null;
        $out = [];
        $rank = 0;
        $prevScore = null;
        foreach ($rows as $i => $row) {
            $score = (int) $row['score'];
            if ($score !== $prevScore) {
                $rank = $i + 1;
                $prevScore = $score;
            }
            $out[] = [
                'rank' => $rank,
                'name' => (string) $row['name'] !== '' ? (string) $row['name'] : 'مستخدم',
                'score' => $score,
                'is_me' => $me !== null && (int) $row['id'] === $me,
            ];
        }
        return $out;
    }

    public static function presence(Request $r): \stdClass
    {
        $b = $r->body();
        $vid = V::str($b, 'visitor_id', 64, true, 8);
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', (string) $vid)) {
            throw ApiError::validation(['visitor_id' => 'معرّف غير صالح.']);
        }
        $path = V::str($b, 'path', 255, false, 0) ?? '/';
        RateLimit::hit('presence', ['visitor:' . $vid]);
        $uid = $r->user !== null ? (int) $r->user['id'] : null;
        Db::exec(
            'INSERT INTO presence (visitor_id, user_id, path, last_seen) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), path = VALUES(path), last_seen = VALUES(last_seen)',
            [$vid, $uid, $path, Db::now()]
        );
        if (random_int(1, 100) === 1) {
            Db::exec('DELETE FROM presence WHERE last_seen < ?', [Db::now(-86400)]);
        }
        return Reply::empty();
    }
}
