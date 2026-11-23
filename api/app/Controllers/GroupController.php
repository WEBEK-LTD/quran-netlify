<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Crypto;
use NQ\Core\Db;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Settings;
use NQ\Core\V;

/** Group khatma rooms (dedicated to a deceased person; parts are juz' or hizb). */
final class GroupController
{
    private const MAX_ROOMS_PER_OWNER = 20;

    private static function guard(Request $r): int
    {
        $uid = $r->userId();
        Settings::requireFeature('khatma_group');
        return $uid;
    }

    private static function totalParts(string $mode): int
    {
        return $mode === 'hizb' ? 60 : 30;
    }

    /** @return array<string,mixed> */
    private static function loadRoom(Request $r, bool $forUpdate = false): array
    {
        $code = strtoupper($r->param('code'));
        if (!preg_match('/^[' . Crypto::CODE_ALPHABET . ']{7}$/', $code)) {
            throw ApiError::notFound('الختمة غير موجودة.');
        }
        $room = Db::one('SELECT * FROM group_rooms WHERE code = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$code]);
        if ($room === null) {
            throw ApiError::notFound('الختمة غير موجودة.');
        }
        return $room;
    }

    private static function requireOwner(array $room, int $uid): void
    {
        if ((int) $room['owner_id'] !== $uid) {
            throw ApiError::forbidden('هذا الإجراء متاح لمنشئ الختمة فقط.');
        }
    }

    /** @param array<string,mixed> $room @return array<string,mixed> */
    private static function shape(array $room, int $uid, bool $withParts): array
    {
        $out = [
            'code' => (string) $room['code'],
            'deceased_name' => (string) $room['deceased_name'],
            'mode' => (string) $room['mode'],
            'is_public' => (int) $room['is_public'] === 1,
            'completions' => (int) $room['completions'],
            'owner_id' => (int) $room['owner_id'],
            'is_owner' => (int) $room['owner_id'] === $uid,
            'created_at' => Db::iso($room['created_at']),
        ];
        if (array_key_exists('done_count', $room)) {
            $out['done_count'] = (int) $room['done_count'];
            $out['total'] = (int) $room['total'];
        }
        if ($withParts) {
            $takers = [];
            foreach (Db::all('SELECT id, part_index, user_id, name, done FROM group_takers WHERE room_code = ? ORDER BY id', [$room['code']]) as $t) {
                $takers[(int) $t['part_index']][] = [
                    'id' => (int) $t['id'],
                    'name' => (string) $t['name'],
                    'user_id' => (int) $t['user_id'],
                    'done' => (int) $t['done'] === 1,
                    'is_me' => (int) $t['user_id'] === $uid,
                ];
            }
            $parts = [];
            $done = 0;
            foreach (Db::all('SELECT * FROM group_parts WHERE room_code = ? ORDER BY part_index', [$room['code']]) as $p) {
                $i = (int) $p['part_index'];
                $done += (int) $p['done'];
                $parts[] = [
                    'part_index' => $i,
                    'label' => (string) $p['label'],
                    'assignee' => (string) $p['assignee'],
                    'done' => (int) $p['done'] === 1,
                    'done_by_name' => $p['done_by_name'] !== null ? (string) $p['done_by_name'] : null,
                    'done_at' => Db::iso($p['done_at']),
                    'takers' => $takers[$i] ?? [],
                ];
            }
            $out['parts'] = $parts;
            $out['done_count'] = $done;
            $out['total'] = count($parts);
        }
        return $out;
    }

    private static function fresh(string $code, int $uid): array
    {
        return self::shape((array) Db::one('SELECT * FROM group_rooms WHERE code = ?', [$code]), $uid, true);
    }

    private const LIST_SQL = 'SELECT r.*,
        (SELECT COUNT(*) FROM group_parts p WHERE p.room_code = r.code AND p.done = 1) AS done_count,
        (SELECT COUNT(*) FROM group_parts p WHERE p.room_code = r.code) AS total
        FROM group_rooms r';

    // ── Endpoints ────────────────────────────────────────────────────────────

    public static function create(Request $r): Reply
    {
        $uid = self::guard($r);
        $b = $r->body();
        $name = V::str($b, 'deceased_name', 100, false, 0) ?? '';
        $mode = (string) V::enum($b, 'mode', ['juz', 'hizb']);
        $isPublic = V::bool($b, 'is_public', false) ?? false;
        $total = self::totalParts($mode);
        $word = $mode === 'hizb' ? 'الحزب' : 'الجزء';

        $parts = [];
        $input = $b['parts'] ?? [];
        if (!is_array($input) || ($input !== [] && !array_is_list($input))) {
            throw ApiError::validation(['parts' => 'يجب أن تكون قائمة.']);
        }
        if (count($input) > $total) {
            throw ApiError::validation(['parts' => "الحد الأقصى {$total} جزءاً."]);
        }
        foreach ($input as $n => $p) {
            if (!is_array($p)) {
                throw ApiError::validation(["parts.$n" => 'عنصر غير صالح.']);
            }
            try {
                $idx = (int) V::int($p, 'part_index', 1, $total);
                $label = V::str($p, 'label', 100, false, 0);
                $assignee = V::str($p, 'assignee', 100, false, 0) ?? '';
            } catch (ApiError) {
                throw ApiError::validation(["parts.$n" => 'بيانات الجزء غير صحيحة.']);
            }
            if (isset($parts[$idx])) {
                throw ApiError::validation(["parts.$n" => 'رقم الجزء مكرر.']);
            }
            $parts[$idx] = [$label !== null && $label !== '' ? $label : "{$word} {$idx}", $assignee];
        }
        if ($parts === []) {
            for ($i = 1; $i <= $total; $i++) {
                $parts[$i] = ["{$word} {$i}", ''];
            }
        }
        ksort($parts);

        if ((int) Db::value('SELECT COUNT(*) FROM group_rooms WHERE owner_id = ?', [$uid]) >= self::MAX_ROOMS_PER_OWNER) {
            throw ApiError::of(422, 'limit_reached', 'وصلت إلى الحد الأقصى (20 ختمة). احذف ختمة قديمة لإنشاء جديدة.');
        }

        $code = null;
        for ($try = 0; $try < 12 && $code === null; $try++) {
            $candidate = Crypto::randomCode(7);
            try {
                Db::tx(static function () use ($candidate, $uid, $name, $mode, $isPublic, $parts): void {
                    Db::exec(
                        'INSERT INTO group_rooms (code, owner_id, deceased_name, mode, is_public, completions, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
                        [$candidate, $uid, $name, $mode, $isPublic, Db::now(), Db::now()]
                    );
                    $sql = 'INSERT INTO group_parts (room_code, part_index, label, assignee) VALUES '
                        . implode(',', array_fill(0, count($parts), '(?, ?, ?, ?)'));
                    $params = [];
                    foreach ($parts as $idx => [$label, $assignee]) {
                        array_push($params, $candidate, $idx, $label, $assignee);
                    }
                    Db::exec($sql, $params);
                });
                $code = $candidate;
            } catch (\PDOException $e) {
                if (($e->errorInfo[1] ?? 0) !== 1062) {
                    throw $e;
                }
            }
        }
        if ($code === null) {
            throw new \RuntimeException('could not allocate a unique room code');
        }
        return Reply::created(self::fresh($code, $uid));
    }

    public static function mine(Request $r): array
    {
        $uid = self::guard($r);
        $rows = Db::all(
            self::LIST_SQL . ' WHERE r.owner_id = ? OR r.code IN (SELECT m.room_code FROM group_members m WHERE m.user_id = ?)
             ORDER BY r.created_at DESC LIMIT 200',
            [$uid, $uid]
        );
        return array_map(static fn (array $room): array => self::shape($room, $uid, false), $rows);
    }

    public static function publicRooms(Request $r): array
    {
        $uid = self::guard($r);
        [$page, $per, $off] = V::page($r, 30);
        $total = (int) Db::value('SELECT COUNT(*) FROM group_rooms WHERE is_public = 1');
        $rows = Db::all(self::LIST_SQL . ' WHERE r.is_public = 1 ORDER BY r.created_at DESC LIMIT ? OFFSET ?', [$per, $off]);
        return V::paginated(array_map(static fn (array $room): array => self::shape($room, $uid, false), $rows), $page, $per, $total);
    }

    public static function show(Request $r): array
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        if ((int) $room['owner_id'] !== $uid) {
            Db::exec('INSERT IGNORE INTO group_members (room_code, user_id, joined_at) VALUES (?, ?, ?)', [$room['code'], $uid, Db::now()]);
        }
        return self::shape($room, $uid, true);
    }

    public static function update(Request $r): array
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        self::requireOwner($room, $uid);
        $b = $r->body();
        if (array_key_exists('is_public', $b)) {
            Db::exec('UPDATE group_rooms SET is_public = ?, updated_at = ? WHERE code = ?', [(bool) V::bool($b, 'is_public'), Db::now(), $room['code']]);
        }
        return self::fresh((string) $room['code'], $uid);
    }

    public static function newRound(Request $r): array
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        self::requireOwner($room, $uid);
        Db::tx(static function () use ($room): void {
            Db::exec('UPDATE group_parts SET done = 0, done_by_name = NULL, done_at = NULL WHERE room_code = ?', [$room['code']]);
            Db::exec('DELETE FROM group_takers WHERE room_code = ?', [$room['code']]);
            Db::exec('UPDATE group_rooms SET completions = completions + 1, updated_at = ? WHERE code = ?', [Db::now(), $room['code']]);
        });
        return self::fresh((string) $room['code'], $uid);
    }

    public static function destroy(Request $r): \stdClass
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        self::requireOwner($room, $uid);
        Db::exec('DELETE FROM group_rooms WHERE code = ?', [$room['code']]);
        return Reply::empty();
    }

    public static function leave(Request $r): \stdClass
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        if ((int) $room['owner_id'] === $uid) {
            throw ApiError::forbidden('لا يمكن لمنشئ الختمة مغادرتها، يمكنه حذفها بدلاً من ذلك.');
        }
        Db::tx(static function () use ($room, $uid): void {
            Db::exec('DELETE FROM group_members WHERE room_code = ? AND user_id = ?', [$room['code'], $uid]);
            // unfinished claims are released; finished ones stay recorded
            $parts = Db::all('SELECT DISTINCT part_index FROM group_takers WHERE room_code = ? AND user_id = ? AND done = 0', [$room['code'], $uid]);
            Db::exec('DELETE FROM group_takers WHERE room_code = ? AND user_id = ? AND done = 0', [$room['code'], $uid]);
            foreach ($parts as $p) {
                self::recompute((string) $room['code'], (int) $p['part_index']);
            }
        });
        return Reply::empty();
    }

    /** @return array<string,mixed> */
    private static function loadPart(Request $r, array $room): array
    {
        $i = $r->intParam('i');
        $part = Db::one('SELECT * FROM group_parts WHERE room_code = ? AND part_index = ?', [$room['code'], $i]);
        if ($part === null) {
            throw ApiError::notFound('الجزء غير موجود.');
        }
        return $part;
    }

    public static function claim(Request $r): array
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        $part = self::loadPart($r, $room);
        $name = V::str($r->body(), 'name', 60, false, 0);
        if ($name === null || $name === '') {
            $name = (string) ($r->user['name'] ?? '') ?: 'مستخدم';
        }
        Db::tx(static function () use ($room, $part, $uid, $name): void {
            Db::exec(
                'INSERT INTO group_takers (room_code, part_index, user_id, name, done, created_at) VALUES (?, ?, ?, ?, 0, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name)',
                [$room['code'], (int) $part['part_index'], $uid, $name, Db::now()]
            );
            if ((int) $room['owner_id'] !== $uid) {
                Db::exec('INSERT IGNORE INTO group_members (room_code, user_id, joined_at) VALUES (?, ?, ?)', [$room['code'], $uid, Db::now()]);
            }
        });
        return self::fresh((string) $room['code'], $uid);
    }

    public static function release(Request $r): array
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        $part = self::loadPart($r, $room);
        Db::tx(static function () use ($room, $part, $uid): void {
            Db::exec('DELETE FROM group_takers WHERE room_code = ? AND part_index = ? AND user_id = ?', [$room['code'], (int) $part['part_index'], $uid]);
            self::recompute((string) $room['code'], (int) $part['part_index']);
        });
        return self::fresh((string) $room['code'], $uid);
    }

    public static function done(Request $r): array
    {
        $uid = self::guard($r);
        $room = self::loadRoom($r);
        $part = self::loadPart($r, $room);
        $done = (bool) V::bool($r->body(), 'done');
        $idx = (int) $part['part_index'];
        $code = (string) $room['code'];
        $taker = Db::one('SELECT id FROM group_takers WHERE room_code = ? AND part_index = ? AND user_id = ?', [$code, $idx, $uid]);
        $isOwner = (int) $room['owner_id'] === $uid;
        if ($taker === null && !$isOwner) {
            throw ApiError::forbidden('يمكن فقط لمن اختار هذا الجزء (أو منشئ الختمة) تعليمه كمكتمل.');
        }
        Db::tx(static function () use ($taker, $done, $code, $idx, $r): void {
            if ($taker !== null) {
                Db::exec('UPDATE group_takers SET done = ?, done_at = ? WHERE id = ?', [$done, $done ? Db::now() : null, (int) $taker['id']]);
                self::recompute($code, $idx);
            } elseif ($done) {
                // owner marks a part done directly
                Db::exec('UPDATE group_parts SET done = 1, done_by_name = ?, done_at = ? WHERE room_code = ? AND part_index = ?', [(string) ($r->user['name'] ?? ''), Db::now(), $code, $idx]);
            } else {
                Db::exec('UPDATE group_takers SET done = 0, done_at = NULL WHERE room_code = ? AND part_index = ?', [$code, $idx]);
                Db::exec('UPDATE group_parts SET done = 0, done_by_name = NULL, done_at = NULL WHERE room_code = ? AND part_index = ?', [$code, $idx]);
            }
            Db::exec('UPDATE group_rooms SET updated_at = ? WHERE code = ?', [Db::now(), $code]);
        });
        return self::fresh($code, $uid);
    }

    /** A part is done when any of its takers is done. */
    private static function recompute(string $code, int $idx): void
    {
        $first = Db::one(
            'SELECT name, done_at FROM group_takers WHERE room_code = ? AND part_index = ? AND done = 1 ORDER BY done_at ASC, id ASC LIMIT 1',
            [$code, $idx]
        );
        if ($first !== null) {
            Db::exec('UPDATE group_parts SET done = 1, done_by_name = ?, done_at = ? WHERE room_code = ? AND part_index = ?', [$first['name'], $first['done_at'], $code, $idx]);
        } else {
            Db::exec('UPDATE group_parts SET done = 0, done_by_name = NULL, done_at = NULL WHERE room_code = ? AND part_index = ?', [$code, $idx]);
        }
    }
}
