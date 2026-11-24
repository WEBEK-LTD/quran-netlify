<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Who may do what in the community (rooms, groups, friends, DMs):
 *   - gender + birthdate are required and set once (community_profiles row = "joined"; later changes by admins only);
 *   - under 13: refused; 13–17 ("minor"): rooms (incl. mixed, may speak), follows; no DMs, no friendship, private profile;
 *   - gender separation: a room/group of the other gender leaves no trace anywhere (see canSeeRoom/canSeeGroup and
 *     roomVisibilitySql, used by every list, search, profile and notification fan-out);
 *   - blocks hide profiles, DMs and rooms both ways.
 */
final class Community
{
    public const MIN_AGE = 13;
    public const ADULT_AGE = 18;

    /** @var array<int,array<string,mixed>|false> */
    private static array $suspensions = [];

    public static function age(?string $birthdate, ?int $now = null): ?int
    {
        if ($birthdate === null || !V::isDate(substr($birthdate, 0, 10))) {
            return null;
        }
        [$y, $m, $d] = array_map('intval', explode('-', substr($birthdate, 0, 10)));
        $now ??= time();
        $age = (int) gmdate('Y', $now) - $y;
        if ((int) gmdate('n', $now) < $m || ((int) gmdate('n', $now) === $m && (int) gmdate('j', $now) < $d)) {
            $age--;
        }
        return $age;
    }

    /** 'men' | 'women' for a user gender. */
    public static function scopeOf(?string $gender): ?string
    {
        return $gender === 'male' ? 'men' : ($gender === 'female' ? 'women' : null);
    }

    /** @return array<string,mixed>|null */
    public static function profileRow(int $uid): ?array
    {
        return Db::one('SELECT * FROM community_profiles WHERE user_id = ?', [$uid]);
    }

    /** Whether the member agreed to the rooms & community terms (true while the column does not exist yet). */
    public static function termsAccepted(int $uid): bool
    {
        if (!Migrations::ready()) {
            return true;
        }
        return Db::value('SELECT terms_accepted_at FROM community_profiles WHERE user_id = ?', [$uid]) !== null;
    }

    public static function ensureProfileRow(int $uid): void
    {
        if (Db::value('SELECT 1 FROM community_profiles WHERE user_id = ?', [$uid]) !== null) {
            return;
        }
        Db::exec('INSERT IGNORE INTO community_profiles (user_id, joined_at, updated_at) VALUES (?, ?, ?)', [$uid, Db::now(), Db::now()]);
    }

    /** @param array<string,mixed> $u @return list<string> */
    public static function missing(array $u): array
    {
        $m = [];
        if (!in_array($u['gender'] ?? null, ['male', 'female'], true)) {
            $m[] = 'gender';
        }
        if (empty($u['birthdate'])) {
            $m[] = 'birthdate';
        }
        return $m;
    }

    /** @param array<string,mixed> $u */
    public static function isMinor(array $u): bool
    {
        $a = self::age($u['birthdate'] ?? null);
        return $a !== null && $a < self::ADULT_AGE;
    }

    /**
     * The signed-in community member, or an error:
     *   409 community_profile_required (+ missing: ["gender","birthdate"]) — call PATCH /me/community-profile first;
     *   403 underage; 403 community_suspended (unless $allowSuspended).
     * @return array{id:int, name:string, gender:string, scope:string, age:int, minor:bool, is_admin:bool, avatar_url:?string}
     */
    public static function ctx(Request $r, bool $allowSuspended = false): array
    {
        $uid = $r->userId();
        Settings::requireFeature('rooms');
        $u = (array) $r->user;
        $missing = self::missing($u);
        if ($missing !== []) {
            throw new ApiError(409, 'community_profile_required', 'أكمل بياناتك (الجنس وتاريخ الميلاد) قبل دخول الغرف والمجتمع.', ['missing' => $missing]);
        }
        $age = (int) self::age((string) $u['birthdate']);
        if ($age < self::MIN_AGE) {
            throw new ApiError(403, 'underage', 'الغرف والمجتمع متاحة لمن أعمارهم 13 سنة فأكثر.');
        }
        self::ensureProfileRow($uid); // first entry of an account that already had gender + birthdate: they are now locked
        // The terms (zero tolerance for objectionable content and abusive users) must be accepted once, also by members
        // who joined before the agreement existed. Safety and leaving actions ($allowSuspended: block, unfollow, reports…) stay open.
        if (!$allowSuspended && !self::termsAccepted($uid)) {
            throw new ApiError(409, 'terms_required', 'وافق على شروط الاستخدام وقواعد الغرف والمجتمع أولاً.');
        }
        if (!$allowSuspended) {
            $s = self::suspension($uid);
            if ($s !== null) {
                throw self::suspendedError($s);
            }
        }
        return [
            'id' => $uid,
            'name' => (string) $u['name'],
            'gender' => (string) $u['gender'],
            'scope' => (string) self::scopeOf((string) $u['gender']),
            'age' => $age,
            'minor' => $age < self::ADULT_AGE,
            'is_admin' => (int) ($u['is_admin'] ?? 0) === 1,
            'avatar_url' => Auth::avatarUrl($u),
        ];
    }

    /** @return array<string,mixed>|null the active community suspension or rooms ban */
    public static function suspension(int $uid): ?array
    {
        if (!array_key_exists($uid, self::$suspensions)) {
            $row = Db::one('SELECT * FROM community_bans WHERE user_id = ? AND (until IS NULL OR until > ?)', [$uid, Db::now()]);
            self::$suspensions[$uid] = $row ?? false;
        }
        $s = self::$suspensions[$uid];
        if ($s === false || $s['scope'] !== 'community') {
            return null;
        }
        return $s;
    }

    /** Rooms ban (scope rooms) or community suspension. @return array<string,mixed>|null */
    public static function roomsBan(int $uid): ?array
    {
        self::suspension($uid);
        $s = self::$suspensions[$uid] ?? false;
        return $s === false ? null : $s;
    }

    public static function forgetSuspension(int $uid): void
    {
        unset(self::$suspensions[$uid]);
    }

    /** @param array<string,mixed> $s */
    public static function suspendedError(array $s): ApiError
    {
        $rooms = $s['scope'] === 'rooms';
        $msg = $rooms ? 'تم منعك من الغرف الصوتية' : 'تم إيقاف حسابك في المجتمع';
        if (!empty($s['until'])) {
            $msg .= ' حتى ' . substr((string) $s['until'], 0, 10);
        } elseif ($s['source'] === 'dictionary' && (int) $s['locked'] === 0) {
            $msg .= ' حتى تراجع الإدارة الأمر';
        }
        return new ApiError(403, $rooms ? 'rooms_banned' : 'community_suspended', $msg . '.', [
            'until' => Db::iso($s['until'] ?? null),
            'permanent' => empty($s['until']) && ((int) $s['locked'] === 1 || $s['source'] === 'admin'),
        ]);
    }

    /** @param array<string,mixed> $ctx */
    public static function requireRooms(array $ctx): void
    {
        $s = self::roomsBan((int) $ctx['id']);
        if ($s !== null) {
            throw self::suspendedError($s);
        }
    }

    public static function blocked(int $a, int $b): bool
    {
        return Db::value('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1', [$a, $b, $b, $a]) !== null;
    }

    public static function friends(int $a, int $b): bool
    {
        return Db::value('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?', [$a, $b]) !== null;
    }

    public static function follows(int $a, int $b): bool
    {
        return Db::value('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', [$a, $b]) !== null;
    }

    /** Columns for brief() from a users alias. */
    public static function briefCols(string $a = 'u'): string
    {
        return "{$a}.id, {$a}.name, {$a}.avatar_url" . (Migrations::ready() ? ", {$a}.avatar_file" : '');
    }

    /** @param array<string,mixed> $u @return array{id:int, name:string, avatar_url:?string} */
    public static function brief(array $u): array
    {
        return ['id' => (int) $u['id'], 'name' => (string) $u['name'], 'avatar_url' => Auth::avatarUrl($u)];
    }

    /** @return array<string,mixed>|null the membership row */
    public static function membership(int $groupId, int $uid): ?array
    {
        return Db::one('SELECT * FROM cgroup_members WHERE group_id = ? AND user_id = ?', [$groupId, $uid]);
    }

    /** A group of the other gender does not exist for this viewer. @param array<string,mixed> $ctx @param array<string,mixed> $g */
    public static function canSeeGroup(array $ctx, array $g): bool
    {
        return $g['gender_scope'] === 'mixed' || $g['gender_scope'] === $ctx['scope'];
    }

    /**
     * Whether a room exists for this viewer (lists, search, profiles, notifications, joining).
     * @param array<string,mixed> $ctx @param array<string,mixed> $room
     */
    public static function canSeeRoom(array $ctx, array $room): bool
    {
        if (!in_array($room['status'], ['open', 'scheduled'], true)) {
            return false;
        }
        if ($room['gender_scope'] !== 'mixed' && $room['gender_scope'] !== $ctx['scope']) {
            return false;
        }
        if ($room['visibility'] === 'group_members') {
            if ($room['group_id'] === null || self::membership((int) $room['group_id'], (int) $ctx['id']) === null) {
                return false;
            }
        }
        if ($room['owner_id'] !== null && (int) $room['owner_id'] !== (int) $ctx['id'] && self::blocked((int) $ctx['id'], (int) $room['owner_id'])) {
            return false;
        }
        return true;
    }

    /**
     * SQL condition equivalent to canSeeRoom (for lists). Use with "FROM rooms r".
     * @param array<string,mixed> $ctx @return array{0:string, 1:list<mixed>}
     */
    public static function roomVisibilitySql(array $ctx, string $a = 'r'): array
    {
        $me = (int) $ctx['id'];
        return [
            "{$a}.gender_scope IN (?, 'mixed')
             AND ({$a}.visibility = 'public_by_type' OR EXISTS (SELECT 1 FROM cgroup_members vm WHERE vm.group_id = {$a}.group_id AND vm.user_id = ?))
             AND ({$a}.owner_id IS NULL OR {$a}.owner_id = ? OR NOT EXISTS (SELECT 1 FROM blocks vb WHERE (vb.blocker_id = ? AND vb.blocked_id = {$a}.owner_id) OR (vb.blocker_id = {$a}.owner_id AND vb.blocked_id = ?)))",
            [(string) $ctx['scope'], $me, $me, $me, $me],
        ];
    }

    /**
     * A viewer context for another user (for notification fan-out), or null when they are not an eligible member.
     * @param array<string,mixed> $u users row with id, name, gender, birthdate, is_admin
     * @return array<string,mixed>|null
     */
    public static function ctxOf(array $u): ?array
    {
        $scope = self::scopeOf($u['gender'] ?? null);
        $age = self::age($u['birthdate'] ?? null);
        if ($scope === null || $age === null || $age < self::MIN_AGE) {
            return null;
        }
        return ['id' => (int) $u['id'], 'name' => (string) $u['name'], 'gender' => (string) $u['gender'], 'scope' => $scope, 'age' => $age,
            'minor' => $age < self::ADULT_AGE, 'is_admin' => (int) ($u['is_admin'] ?? 0) === 1, 'avatar_url' => null];
    }

    /** Group photos are stored like profile photos (storage/avatars, served by GET /v1/avatars/…). */
    public static function photoUrl(?string $file): ?string
    {
        return is_string($file) && Avatar::validName($file) ? Avatar::url($file) : null;
    }

    /**
     * Account deletion: close the user's rooms, hand founded groups to the senior moderator (or member), delete groups
     * left empty. Everything else cascades (or is kept anonymised when it is report evidence).
     */
    public static function onAccountDelete(int $uid): void
    {
        foreach (Db::all("SELECT * FROM rooms WHERE owner_id = ? AND status IN ('open','scheduled')", [$uid]) as $room) {
            Rooms::close($room, 'owner_deleted');
        }
        foreach (Db::all("SELECT g.* FROM cgroups g JOIN cgroup_members m ON m.group_id = g.id WHERE m.user_id = ? AND m.role = 'founder'", [$uid]) as $g) {
            $next = Db::one(
                "SELECT user_id FROM cgroup_members WHERE group_id = ? AND user_id <> ? ORDER BY role = 'moderator' DESC, joined_at, user_id LIMIT 1",
                [(int) $g['id'], $uid]
            );
            if ($next === null) {
                Groups::delete($g);
            } else {
                Db::exec("UPDATE cgroup_members SET role = 'founder', perms = ? WHERE group_id = ? AND user_id = ?", [Groups::ALL_PERMS, (int) $g['id'], (int) $next['user_id']]);
                Db::exec('UPDATE cgroups SET founder_id = ?, updated_at = ? WHERE id = ?', [(int) $next['user_id'], Db::now(), (int) $g['id']]);
            }
        }
        Db::exec('UPDATE cgroups g SET member_count = (SELECT COUNT(*) FROM cgroup_members m WHERE m.group_id = g.id) WHERE g.id IN (SELECT group_id FROM cgroup_members WHERE user_id = ?)', [$uid]);
    }

    /** Validate an optional Facebook/Instagram profile link (https, those hosts only). */
    public static function socialUrl(mixed $v, string $field, string $kind): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_string($v) || strlen($v) > 255) {
            throw ApiError::validation([$field => 'رابط غير صالح.']);
        }
        $v = trim($v);
        if (!preg_match('#^https?://#i', $v)) {
            $v = 'https://' . $v;
        }
        $p = parse_url($v);
        $host = strtolower((string) ($p['host'] ?? ''));
        $hosts = $kind === 'facebook' ? ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'] : ['instagram.com', 'www.instagram.com'];
        if (!is_array($p) || !in_array($host, $hosts, true) || isset($p['user']) || isset($p['port']) || preg_match('/[\s<>"\']/', $v)) {
            throw ApiError::validation([$field => $kind === 'facebook' ? 'يُسمح فقط برابط حساب على facebook.com.' : 'يُسمح فقط برابط حساب على instagram.com.']);
        }
        $path = (string) ($p['path'] ?? '');
        if ($path === '' || $path === '/') {
            throw ApiError::validation([$field => 'أدخل رابط حسابك كاملاً.']);
        }
        return 'https://' . $host . $path . (isset($p['query']) ? '?' . $p['query'] : '');
    }
}
