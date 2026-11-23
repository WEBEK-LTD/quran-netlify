<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Db;
use NQ\Core\Quran;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Settings;
use NQ\Core\V;

final class MeController
{
    private const KHATMA_TYPES = ['reading', 'memorizing', 'daily', 'listening', 'review'];

    // ── Bookmarks ────────────────────────────────────────────────────────────

    private static function bookmarkList(int $uid): array
    {
        return array_map(static fn (array $b): array => [
            'surah' => (int) $b['surah'], 'ayah' => (int) $b['ayah'], 'created_at' => Db::iso($b['created_at']),
        ], Db::all('SELECT surah, ayah, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC, surah, ayah', [$uid]));
    }

    public static function bookmarks(Request $r): array
    {
        return self::bookmarkList($r->userId());
    }

    public static function replaceBookmarks(Request $r): array
    {
        $uid = $r->userId();
        $items = $r->body()['items'] ?? null;
        if (!is_array($items) || !array_is_list($items)) {
            throw ApiError::validation(['items' => 'يجب أن تكون قائمة.']);
        }
        if (count($items) > 2000) {
            throw ApiError::validation(['items' => 'الحد الأقصى 2000 علامة.']);
        }
        $clean = [];
        foreach ($items as $i => $it) {
            if (!is_array($it)) {
                throw ApiError::validation(["items.$i" => 'عنصر غير صالح.']);
            }
            try {
                [$s, $a] = Quran::fromBody($it);
            } catch (ApiError) {
                throw ApiError::validation(["items.$i" => 'سورة أو آية غير صحيحة.']);
            }
            $clean["$s:$a"] = [$s, $a];
        }
        Db::tx(static function () use ($uid, $clean): void {
            Db::exec('DELETE FROM bookmarks WHERE user_id = ?', [$uid]);
            $now = Db::now();
            foreach (array_chunk(array_values($clean), 200) as $chunk) {
                $sql = 'INSERT INTO bookmarks (user_id, surah, ayah, created_at) VALUES '
                    . implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?)'));
                $params = [];
                foreach ($chunk as [$s, $a]) {
                    array_push($params, $uid, $s, $a, $now);
                }
                Db::exec($sql, $params);
            }
        });
        return self::bookmarkList($uid);
    }

    public static function addBookmark(Request $r): array
    {
        $uid = $r->userId();
        [$s, $a] = Quran::fromBody($r->body());
        if ((int) Db::value('SELECT COUNT(*) FROM bookmarks WHERE user_id = ?', [$uid]) >= 2000) {
            throw ApiError::of(422, 'limit_reached', 'الحد الأقصى 2000 علامة.');
        }
        Db::exec('INSERT IGNORE INTO bookmarks (user_id, surah, ayah, created_at) VALUES (?, ?, ?, ?)', [$uid, $s, $a, Db::now()]);
        return self::bookmarkList($uid);
    }

    public static function deleteBookmark(Request $r): array
    {
        $uid = $r->userId();
        [$s, $a] = Quran::fromParams($r);
        Db::exec('DELETE FROM bookmarks WHERE user_id = ? AND surah = ? AND ayah = ?', [$uid, $s, $a]);
        return self::bookmarkList($uid);
    }

    // ── Notes ────────────────────────────────────────────────────────────────

    private static function noteShape(array $n): array
    {
        return ['surah' => (int) $n['surah'], 'ayah' => (int) $n['ayah'], 'text' => (string) $n['text'], 'updated_at' => Db::iso($n['updated_at'])];
    }

    public static function notes(Request $r): array
    {
        $uid = $r->userId();
        Settings::requireFeature('notes');
        return array_map([self::class, 'noteShape'], Db::all('SELECT surah, ayah, text, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC', [$uid]));
    }

    public static function putNote(Request $r): array
    {
        $uid = $r->userId();
        Settings::requireFeature('notes');
        [$s, $a] = Quran::fromParams($r);
        $text = (string) V::str($r->body(), 'text', 5000, true, 1, true);
        if ((int) Db::value('SELECT COUNT(*) FROM notes WHERE user_id = ?', [$uid]) >= 5000
            && Db::value('SELECT 1 FROM notes WHERE user_id = ? AND surah = ? AND ayah = ?', [$uid, $s, $a]) === null) {
            throw ApiError::of(422, 'limit_reached');
        }
        Db::exec(
            'INSERT INTO notes (user_id, surah, ayah, text, updated_at) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE text = VALUES(text), updated_at = VALUES(updated_at)',
            [$uid, $s, $a, $text, Db::now()]
        );
        return self::noteShape((array) Db::one('SELECT surah, ayah, text, updated_at FROM notes WHERE user_id = ? AND surah = ? AND ayah = ?', [$uid, $s, $a]));
    }

    public static function deleteNote(Request $r): \stdClass
    {
        $uid = $r->userId();
        Settings::requireFeature('notes');
        [$s, $a] = Quran::fromParams($r);
        Db::exec('DELETE FROM notes WHERE user_id = ? AND surah = ? AND ayah = ?', [$uid, $s, $a]);
        return Reply::empty();
    }

    // ── Progress ─────────────────────────────────────────────────────────────

    public static function progress(Request $r): ?array
    {
        $row = Db::one('SELECT surah, ayah, updated_at FROM reading_progress WHERE user_id = ?', [$r->userId()]);
        return $row === null ? null : ['surah' => (int) $row['surah'], 'ayah' => (int) $row['ayah'], 'updated_at' => Db::iso($row['updated_at'])];
    }

    public static function putProgress(Request $r): array
    {
        $uid = $r->userId();
        [$s, $a] = Quran::fromBody($r->body());
        Db::exec(
            'INSERT INTO reading_progress (user_id, surah, ayah, updated_at) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE surah = VALUES(surah), ayah = VALUES(ayah), updated_at = VALUES(updated_at)',
            [$uid, $s, $a, Db::now()]
        );
        return (array) self::progress($r);
    }

    // ── Reading log & stats ──────────────────────────────────────────────────

    /** The user's local date from X-NQ-Date when within ±1 day of the server's UTC date, else the UTC date. */
    public static function userDate(Request $r): string
    {
        $today = gmdate('Y-m-d');
        $h = trim((string) $r->header('x-nq-date'));
        if ($h !== '' && V::isDate($h)) {
            $diff = abs((int) ((strtotime($h . ' 00:00:00 UTC') - strtotime($today . ' 00:00:00 UTC')) / 86400));
            if ($diff <= 1) {
                return $h;
            }
        }
        return $today;
    }

    public static function logReading(Request $r): array
    {
        $uid = $r->userId();
        RateLimit::hit('reading', ['user:' . $uid]);
        [$s, $a] = Quran::fromBody($r->body());
        $date = self::userDate($r);
        Db::exec('INSERT IGNORE INTO reading_log (user_id, read_date, surah, ayah, created_at) VALUES (?, ?, ?, ?, ?)', [$uid, $date, $s, $a, Db::now()]);
        $today = (int) Db::value('SELECT COUNT(*) FROM reading_log WHERE user_id = ? AND read_date = ?', [$uid, $date]);
        return ['today' => $today];
    }

    public static function stats(Request $r): array
    {
        $uid = $r->userId();
        $days = (int) ($r->q('days') ?? '365');
        $days = max(1, min($days, 3660));
        $today = self::userDate($r);
        $since = gmdate('Y-m-d', strtotime($today . ' UTC') - ($days - 1) * 86400);
        $all = Db::all('SELECT read_date, COUNT(*) AS n FROM reading_log WHERE user_id = ? GROUP BY read_date ORDER BY read_date', [$uid]);
        $list = [];
        $total = 0;
        $dates = [];
        foreach ($all as $row) {
            $total += (int) $row['n'];
            $dates[] = (string) $row['read_date'];
            if ($row['read_date'] >= $since && $row['read_date'] <= $today) {
                $list[] = ['date' => (string) $row['read_date'], 'ayahs' => (int) $row['n']];
            }
        }
        // best streak over all days
        $best = 0;
        $run = 0;
        $prev = null;
        foreach ($dates as $d) {
            $ts = strtotime($d . ' UTC');
            $run = ($prev !== null && $ts - $prev === 86400) ? $run + 1 : 1;
            $best = max($best, $run);
            $prev = $ts;
        }
        // current streak: ends today, or yesterday if nothing read yet today
        $set = array_flip($dates);
        $cursor = strtotime($today . ' UTC');
        if (!isset($set[gmdate('Y-m-d', $cursor)])) {
            $cursor -= 86400;
        }
        $streak = 0;
        while (isset($set[gmdate('Y-m-d', $cursor)])) {
            $streak++;
            $cursor -= 86400;
        }
        return ['days' => $list, 'total_ayahs' => $total, 'streak' => $streak, 'best_streak' => $best];
    }

    // ── Hifz ─────────────────────────────────────────────────────────────────

    public static function hifz(Request $r): ?array
    {
        $uid = $r->userId();
        Settings::requireFeature('hifz');
        $row = Db::one('SELECT data, client_updated_at FROM hifz WHERE user_id = ?', [$uid]);
        if ($row === null) {
            return null;
        }
        $data = json_decode((string) $row['data'], true);
        return ['data' => is_array($data) && $data !== [] ? $data : new \stdClass(), 'updated_at' => Db::iso($row['client_updated_at'])];
    }

    public static function putHifz(Request $r): array
    {
        $uid = $r->userId();
        Settings::requireFeature('hifz');
        $b = $r->body();
        $data = $b['data'] ?? null;
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw ApiError::validation(['data' => 'يجب أن تكون كائناً.']);
        }
        $updated = V::datetime($b, 'updated_at', false) ?? gmdate('Y-m-d H:i:s.v');
        $completed = 0;
        $status = $data['surahStatus'] ?? null;
        if (is_array($status)) {
            foreach ($status as $k => $v) {
                $n = (int) $k;
                if ($v === 'completed' && $n >= 1 && $n <= 114 && (string) $n === (string) $k) {
                    $completed++;
                }
            }
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > 60000) {
            throw ApiError::validation(['data' => 'البيانات كبيرة جداً.']);
        }
        Db::tx(static function () use ($uid, $json, $updated, $completed): void {
            Db::exec(
                'INSERT INTO hifz (user_id, data, client_updated_at, updated_at) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE data = VALUES(data), client_updated_at = VALUES(client_updated_at), updated_at = VALUES(updated_at)',
                [$uid, $json, $updated, Db::now()]
            );
            Db::exec('UPDATE users SET hifz_completed = ? WHERE id = ?', [$completed, $uid]);
        });
        return (array) self::hifz($r);
    }

    // ── Khatmat ──────────────────────────────────────────────────────────────

    private static function khatmaShape(array $k): array
    {
        return [
            'id' => (int) $k['id'],
            'type' => (string) $k['type'],
            'start_date' => (string) $k['start_date'],
            'end_date' => $k['end_date'] !== null ? (string) $k['end_date'] : null,
            'notes' => (string) $k['notes'],
            'created_at' => Db::iso($k['created_at']),
        ];
    }

    public static function khatmat(Request $r): array
    {
        $uid = $r->userId();
        Settings::requireFeature('khatma');
        return array_map([self::class, 'khatmaShape'], Db::all('SELECT * FROM khatmat WHERE user_id = ? ORDER BY start_date DESC, id DESC', [$uid]));
    }

    /** @return array{type:?string,start_date:?string,end_date:?string,notes:?string} */
    private static function khatmaInput(array $b, bool $partial): array
    {
        $type = array_key_exists('type', $b) || !$partial ? V::enum($b, 'type', self::KHATMA_TYPES, !$partial) : null;
        $start = array_key_exists('start_date', $b) || !$partial ? V::date($b, 'start_date', !$partial) : null;
        $end = array_key_exists('end_date', $b) ? V::date($b, 'end_date', false) : null;
        $notes = array_key_exists('notes', $b) ? (V::str($b, 'notes', 2000, false, 0, true) ?? '') : null;
        return ['type' => $type, 'start_date' => $start, 'end_date' => $end, 'notes' => $notes];
    }

    public static function createKhatma(Request $r): Reply
    {
        $uid = $r->userId();
        Settings::requireFeature('khatma');
        $b = $r->body();
        $in = self::khatmaInput($b, false);
        if ($in['end_date'] !== null && $in['end_date'] < $in['start_date']) {
            throw ApiError::validation(['end_date' => 'تاريخ الانتهاء قبل تاريخ البدء.']);
        }
        if ((int) Db::value('SELECT COUNT(*) FROM khatmat WHERE user_id = ?', [$uid]) >= 5000) {
            throw ApiError::of(422, 'limit_reached');
        }
        $id = Db::insert(
            'INSERT INTO khatmat (user_id, type, start_date, end_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$uid, $in['type'], $in['start_date'], $in['end_date'], $in['notes'] ?? '', Db::now(), Db::now()]
        );
        return Reply::created(self::khatmaShape((array) Db::one('SELECT * FROM khatmat WHERE id = ?', [$id])));
    }

    public static function updateKhatma(Request $r): array
    {
        $uid = $r->userId();
        Settings::requireFeature('khatma');
        $id = $r->intParam('id');
        $row = Db::one('SELECT * FROM khatmat WHERE id = ? AND user_id = ?', [$id, $uid]);
        if ($row === null) {
            throw ApiError::notFound();
        }
        $b = $r->body();
        $in = self::khatmaInput($b, true);
        $type = $in['type'] ?? $row['type'];
        $start = $in['start_date'] ?? $row['start_date'];
        $end = array_key_exists('end_date', $b) ? $in['end_date'] : $row['end_date'];
        $notes = $in['notes'] ?? $row['notes'];
        if ($end !== null && $end < $start) {
            throw ApiError::validation(['end_date' => 'تاريخ الانتهاء قبل تاريخ البدء.']);
        }
        Db::exec(
            'UPDATE khatmat SET type = ?, start_date = ?, end_date = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [$type, $start, $end, $notes, Db::now(), $id, $uid]
        );
        return self::khatmaShape((array) Db::one('SELECT * FROM khatmat WHERE id = ?', [$id]));
    }

    public static function deleteKhatma(Request $r): \stdClass
    {
        $uid = $r->userId();
        Settings::requireFeature('khatma');
        $n = Db::exec('DELETE FROM khatmat WHERE id = ? AND user_id = ?', [$r->intParam('id'), $uid]);
        if ($n === 0) {
            throw ApiError::notFound();
        }
        return Reply::empty();
    }
}
