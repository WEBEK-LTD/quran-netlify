<?php
declare(strict_types=1);

namespace NQ\Core;

/** Community groups («الجروبات»): permissions, loading, shaping, deletion. Not the group-khatma rooms (group_rooms). */
final class Groups
{
    /** Moderator permissions (bit flags in cgroup_members.perms). The founder has all of them. */
    public const PERMS = [
        'open_rooms' => 1,
        'schedule_rooms' => 2,
        'accept_members' => 4,
        'kick' => 8,
        'edit_info' => 16,
        'assign_moderators' => 32,
    ];
    public const ALL_PERMS = 63;

    /** @return array<string,mixed> */
    public static function load(int $id, bool $forUpdate = false): array
    {
        $g = Db::one('SELECT * FROM cgroups WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$id]);
        if ($g === null) {
            throw ApiError::notFound('الجروب غير موجود.');
        }
        return $g;
    }

    /** Load a group the viewer may know exists (other-gender groups are 404). @param array<string,mixed> $ctx @return array<string,mixed> */
    public static function visible(array $ctx, int $id): array
    {
        $g = self::load($id);
        if (!Community::canSeeGroup($ctx, $g)) {
            throw ApiError::notFound('الجروب غير موجود.');
        }
        return $g;
    }

    /** @param array<string,mixed>|null $m membership row */
    public static function has(?array $m, string $perm): bool
    {
        if ($m === null) {
            return false;
        }
        if ($m['role'] === 'founder') {
            return true;
        }
        return $m['role'] === 'moderator' && (((int) $m['perms']) & self::PERMS[$perm]) !== 0;
    }

    /** @return list<string> */
    public static function permList(int $bits): array
    {
        $out = [];
        foreach (self::PERMS as $name => $bit) {
            if (($bits & $bit) !== 0) {
                $out[] = $name;
            }
        }
        return $out;
    }

    /** @param mixed $list */
    public static function permBits(mixed $list): int
    {
        if (!is_array($list) || !array_is_list($list)) {
            throw ApiError::validation(['perms' => 'يجب أن تكون قائمة صلاحيات.']);
        }
        $bits = 0;
        foreach ($list as $p) {
            if (!is_string($p) || !isset(self::PERMS[$p])) {
                throw ApiError::validation(['perms' => 'صلاحية غير معروفة.']);
            }
            $bits |= self::PERMS[$p];
        }
        return $bits;
    }

    public static function recount(int $gid): void
    {
        Db::exec('UPDATE cgroups SET member_count = (SELECT COUNT(*) FROM cgroup_members WHERE group_id = ?), updated_at = ? WHERE id = ?', [$gid, Db::now(), $gid]);
    }

    /** Close the group's rooms, remove its photo file and delete it (members, requests, follows cascade). @param array<string,mixed> $g */
    public static function delete(array $g): void
    {
        foreach (Db::all("SELECT * FROM rooms WHERE group_id = ? AND status IN ('open','scheduled')", [(int) $g['id']]) as $room) {
            Rooms::close($room, 'group_deleted');
        }
        Db::exec('DELETE FROM cgroups WHERE id = ?', [(int) $g['id']]);
        Avatar::delete(is_string($g['photo_file'] ?? null) ? $g['photo_file'] : null);
    }

    /**
     * @param array<string,mixed> $g @param array<string,mixed> $ctx @param array<string,mixed>|null $m the viewer's membership
     * @return array<string,mixed>
     */
    public static function shape(array $g, array $ctx, ?array $m, bool $detail = false): array
    {
        $uid = (int) $ctx['id'];
        $out = [
            'id' => (int) $g['id'],
            'name' => (string) $g['name'],
            'description' => (string) $g['description'],
            'privacy' => (string) $g['privacy'],
            'gender_scope' => (string) $g['gender_scope'],
            'photo_url' => Community::photoUrl($g['photo_file'] ?? null),
            'member_count' => (int) $g['member_count'],
            'my_role' => $m['role'] ?? null,
            'my_perms' => $m === null ? [] : ($m['role'] === 'founder' ? array_keys(self::PERMS) : self::permList((int) $m['perms'])),
            'created_at' => Db::iso((string) $g['created_at']),
        ];
        if ($detail) {
            $founder = $g['founder_id'] !== null ? Db::one('SELECT ' . Community::briefCols() . ' FROM users u WHERE u.id = ?', [(int) $g['founder_id']]) : null;
            $req = Db::one('SELECT kind FROM cgroup_requests WHERE group_id = ? AND user_id = ?', [(int) $g['id'], $uid]);
            $out['founder'] = $founder !== null ? Community::brief($founder) : null;
            $out['is_following'] = Db::value('SELECT 1 FROM cgroup_follows WHERE group_id = ? AND user_id = ?', [(int) $g['id'], $uid]) !== null;
            $out['request_pending'] = ($req['kind'] ?? '') === 'request';
            $out['invited'] = ($req['kind'] ?? '') === 'invite';
            $out['allowed_room_scopes'] = array_values(array_unique([(string) $g['gender_scope'], 'mixed']));
            if (self::has($m, 'accept_members')) {
                $out['pending_requests'] = (int) Db::value("SELECT COUNT(*) FROM cgroup_requests WHERE group_id = ? AND kind = 'request'", [(int) $g['id']]);
            }
        }
        return $out;
    }
}
