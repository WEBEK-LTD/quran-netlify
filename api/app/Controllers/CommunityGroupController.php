<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Avatar;
use NQ\Core\Community;
use NQ\Core\Db;
use NQ\Core\Groups;
use NQ\Core\Migrations;
use NQ\Core\Moderation;
use NQ\Core\Push;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Rooms;
use NQ\Core\V;

/**
 * Community groups: public (listed, join directly) or private (invite, or a request approved by someone with the
 * permission); type men / women / mixed (a group of the other gender does not exist for the viewer).
 * Founder: everything incl. transfer and delete. Moderators: the permissions they were given.
 */
final class CommunityGroupController
{
    /** @param array<string,mixed> $ctx @return array{0:array<string,mixed>,1:array<string,mixed>|null} */
    private static function load(Request $r, array $ctx): array
    {
        $g = Groups::visible($ctx, $r->intParam('id'));
        return [$g, Community::membership((int) $g['id'], (int) $ctx['id'])];
    }

    /** @param array<string,mixed>|null $m */
    private static function need(?array $m, string $perm): void
    {
        if (!Groups::has($m, $perm)) {
            throw ApiError::forbidden('ليست لديك صلاحية لهذا الإجراء في الجروب.');
        }
    }

    /** @param array<string,mixed>|null $m */
    private static function founder(?array $m): void
    {
        if (($m['role'] ?? '') !== 'founder') {
            throw ApiError::forbidden('هذا الإجراء لمؤسس الجروب فقط.');
        }
    }

    /** @param array<string,mixed> $b @return array{0:?string,1:?string} validated + moderated name/description */
    private static function texts(int $uid, array $b, ?int $gid, bool $required): array
    {
        $name = array_key_exists('name', $b) || $required ? (string) V::str($b, 'name', 80, true, 3) : null;
        $desc = array_key_exists('description', $b) ? (V::str($b, 'description', 500, false, 0, true) ?? '') : null;
        foreach (['name' => $name, 'description' => $desc] as $f => $v) {
            if ($v !== null && Moderation::hasLink($v)) {
                throw ApiError::validation([$f => 'لا يُسمح بالروابط.']);
            }
        }
        if ($name !== null) {
            Moderation::enforce($uid, 'group_name', $gid, $name);
        }
        if ($desc !== null && $desc !== '') {
            Moderation::enforce($uid, 'group_description', $gid, $desc);
        }
        return [$name, $desc];
    }

    /** GET /community/groups?q= — «اكتشف الجروبات»: public groups of the viewer's type and mixed ones. */
    public static function discover(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$page, $per, $off] = V::page($r, 30);
        $where = "g.privacy = 'public' AND g.gender_scope IN (?, 'mixed')";
        $params = [(string) $ctx['scope']];
        $q = trim(mb_substr((string) $r->q('q', ''), 0, 60));
        if ($q !== '') {
            $where .= ' AND (g.name LIKE ? OR g.description LIKE ?)';
            $like = '%' . Db::likeEscape($q) . '%';
            array_push($params, $like, $like);
        }
        $total = (int) Db::value("SELECT COUNT(*) FROM cgroups g WHERE {$where}", $params);
        $rows = Db::all(
            "SELECT g.*, m.role AS m_role, m.perms AS m_perms FROM cgroups g LEFT JOIN cgroup_members m ON m.group_id = g.id AND m.user_id = ?
             WHERE {$where} ORDER BY g.member_count DESC, g.id DESC LIMIT ? OFFSET ?",
            array_merge([(int) $ctx['id']], $params, [$per, $off])
        );
        $items = array_map(static fn (array $g): array => Groups::shape($g, $ctx, $g['m_role'] !== null ? ['role' => $g['m_role'], 'perms' => $g['m_perms']] : null), $rows);
        return V::paginated($items, $page, $per, $total);
    }

    /** GET /community/groups/mine — «جروباتي» (+ pending invites). */
    public static function mine(Request $r): array
    {
        $ctx = Community::ctx($r);
        $rows = Db::all(
            "SELECT g.*, m.role AS m_role, m.perms AS m_perms FROM cgroup_members m JOIN cgroups g ON g.id = m.group_id
             WHERE m.user_id = ? AND g.gender_scope IN (?, 'mixed') ORDER BY FIELD(m.role, 'founder', 'moderator', 'member'), g.name",
            [(int) $ctx['id'], (string) $ctx['scope']]
        );
        $invites = Db::all(
            "SELECT g.* FROM cgroup_requests q JOIN cgroups g ON g.id = q.group_id WHERE q.user_id = ? AND q.kind = 'invite' AND g.gender_scope IN (?, 'mixed')",
            [(int) $ctx['id'], (string) $ctx['scope']]
        );
        return [
            'items' => array_map(static fn (array $g): array => Groups::shape($g, $ctx, ['role' => $g['m_role'], 'perms' => $g['m_perms']]), $rows),
            'invites' => array_map(static fn (array $g): array => Groups::shape($g, $ctx, null), $invites),
        ];
    }

    public static function create(Request $r): Reply
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $b = $r->body();
        $privacy = V::enum($b, 'privacy', ['public', 'private'], false) ?? 'public';
        $scope = (string) V::enum($b, 'gender_scope', ['men', 'women', 'mixed']);
        if ($scope !== 'mixed' && $scope !== $ctx['scope']) {
            throw ApiError::validation(['gender_scope' => 'يمكنك إنشاء جروب لجنسك أو جروب مختلط فقط.']);
        }
        RateLimit::hit('group_create', ['user:' . $me]);
        [$name, $desc] = self::texts($me, $b, null, true);
        $id = Db::tx(static function () use ($me, $name, $desc, $privacy, $scope): int {
            $id = Db::insert(
                'INSERT INTO cgroups (name, description, privacy, gender_scope, founder_id, member_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
                [$name, $desc ?? '', $privacy, $scope, $me, Db::now(), Db::now()]
            );
            Db::exec("INSERT INTO cgroup_members (group_id, user_id, role, perms, joined_at) VALUES (?, ?, 'founder', ?, ?)", [$id, $me, Groups::ALL_PERMS, Db::now()]);
            return $id;
        });
        return Reply::created(Groups::shape(Groups::load($id), $ctx, Community::membership($id, $me), true));
    }

    public static function show(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        $out = Groups::shape($g, $ctx, $m, true);
        [$vis, $vp] = Community::roomVisibilitySql($ctx);
        $rooms = Db::all("SELECT r.* FROM rooms r WHERE r.group_id = ? AND r.status IN ('open','scheduled') AND {$vis} ORDER BY r.status = 'open' DESC, r.scheduled_at LIMIT 20", array_merge([(int) $g['id']], $vp));
        $out['rooms'] = Rooms::shapeMany($rooms, $ctx);
        return $out;
    }

    public static function update(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'edit_info');
        $b = $r->body();
        [$name, $desc] = self::texts((int) $ctx['id'], $b, (int) $g['id'], false);
        $sets = [];
        $params = [];
        if ($name !== null) {
            $sets[] = 'name = ?';
            $params[] = $name;
        }
        if ($desc !== null) {
            $sets[] = 'description = ?';
            $params[] = $desc;
        }
        if (array_key_exists('privacy', $b)) {
            $sets[] = 'privacy = ?';
            $params[] = (string) V::enum($b, 'privacy', ['public', 'private']);
        }
        if (array_key_exists('gender_scope', $b) && $b['gender_scope'] !== $g['gender_scope']) {
            throw ApiError::validation(['gender_scope' => 'لا يمكن تغيير نوع الجروب بعد إنشائه.']);
        }
        if ($sets !== []) {
            Db::exec('UPDATE cgroups SET ' . implode(', ', $sets) . ', updated_at = ? WHERE id = ?', array_merge($params, [Db::now(), (int) $g['id']]));
        }
        return Groups::shape(Groups::load((int) $g['id']), $ctx, $m, true);
    }

    public static function destroy(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        [$g, $m] = self::load($r, $ctx);
        self::founder($m);
        Groups::delete($g);
        return Reply::empty();
    }

    /** POST /community/groups/{id}/join — public: member now; private: accepts an invite, else sends a request. */
    public static function join(Request $r): array
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        [$g, $m] = self::load($r, $ctx);
        if ($m !== null) {
            return ['status' => 'member'];
        }
        $req = Db::one('SELECT kind FROM cgroup_requests WHERE group_id = ? AND user_id = ?', [(int) $g['id'], $me]);
        if ($g['privacy'] === 'public' || ($req['kind'] ?? '') === 'invite') {
            self::addMember((int) $g['id'], $me);
            return ['status' => 'member'];
        }
        if ($req === null) {
            Db::exec("INSERT IGNORE INTO cgroup_requests (group_id, user_id, kind, created_at) VALUES (?, ?, 'request', ?)", [(int) $g['id'], $me, Db::now()]);
            $mods = array_map('intval', array_column(Db::all(
                "SELECT user_id FROM cgroup_members WHERE group_id = ? AND (role = 'founder' OR (role = 'moderator' AND (perms & ?) <> 0))",
                [(int) $g['id'], Groups::PERMS['accept_members']]
            ), 'user_id'));
            Push::notifyMany($mods, 'join_request', (string) $g['name'], $ctx['name'] . ' يطلب الانضمام إلى الجروب.', ['group_id' => (int) $g['id'], 'user_id' => $me]);
        }
        return ['status' => 'requested'];
    }

    private static function addMember(int $gid, int $uid): void
    {
        Db::tx(static function () use ($gid, $uid): void {
            Db::exec("INSERT IGNORE INTO cgroup_members (group_id, user_id, role, perms, joined_at) VALUES (?, ?, 'member', 0, ?)", [$gid, $uid, Db::now()]);
            Db::exec('DELETE FROM cgroup_requests WHERE group_id = ? AND user_id = ?', [$gid, $uid]);
            Db::exec('DELETE FROM cgroup_follows WHERE group_id = ? AND user_id = ?', [$gid, $uid]); // members are notified anyway
            Groups::recount($gid);
        });
    }

    public static function leave(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        [$g, $m] = self::load($r, $ctx);
        if ($m === null) {
            Db::exec('DELETE FROM cgroup_requests WHERE group_id = ? AND user_id = ?', [(int) $g['id'], (int) $ctx['id']]);
            return Reply::empty();
        }
        if ($m['role'] === 'founder') {
            if ((int) $g['member_count'] > 1) {
                throw new ApiError(409, 'transfer_first', 'انقل ملكية الجروب لعضو آخر قبل المغادرة، أو احذف الجروب.');
            }
            Groups::delete($g);
            return Reply::empty();
        }
        Db::exec('DELETE FROM cgroup_members WHERE group_id = ? AND user_id = ?', [(int) $g['id'], (int) $ctx['id']]);
        Groups::recount((int) $g['id']);
        return Reply::empty();
    }

    /** GET /community/groups/{id}/members — members only for private groups. */
    public static function members(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        if ($g['privacy'] === 'private' && $m === null) {
            throw ApiError::forbidden('قائمة الأعضاء متاحة لأعضاء الجروب فقط.');
        }
        [$page, $per, $off] = V::page($r, 100);
        $rows = Db::all(
            'SELECT m.role, m.perms, m.joined_at, ' . Community::briefCols() . " FROM cgroup_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?
               AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
             ORDER BY FIELD(m.role, 'founder', 'moderator', 'member'), m.joined_at LIMIT ? OFFSET ?",
            [(int) $g['id'], (int) $ctx['id'], (int) $ctx['id'], $per, $off]
        );
        return V::paginated(array_map(static fn (array $u): array => Community::brief($u) + [
            'role' => (string) $u['role'],
            'perms' => $u['role'] === 'founder' ? array_keys(Groups::PERMS) : Groups::permList((int) $u['perms']),
            'joined_at' => Db::iso($u['joined_at']),
        ], $rows), $page, $per, (int) $g['member_count']);
    }

    public static function requests(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'accept_members');
        return ['items' => array_map(static fn (array $u): array => Community::brief($u) + ['created_at' => Db::iso($u['created_at'])], Db::all(
            'SELECT q.created_at, ' . Community::briefCols() . " FROM cgroup_requests q JOIN users u ON u.id = q.user_id WHERE q.group_id = ? AND q.kind = 'request' ORDER BY q.created_at",
            [(int) $g['id']]
        ))];
    }

    public static function acceptRequest(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'accept_members');
        $uid = $r->intParam('uid');
        if (Db::value("SELECT 1 FROM cgroup_requests WHERE group_id = ? AND user_id = ? AND kind = 'request'", [(int) $g['id'], $uid]) === null) {
            throw ApiError::notFound('الطلب غير موجود.');
        }
        self::addMember((int) $g['id'], $uid);
        return ['status' => 'member'];
    }

    public static function declineRequest(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'accept_members');
        Db::exec("DELETE FROM cgroup_requests WHERE group_id = ? AND user_id = ? AND kind = 'request'", [(int) $g['id'], $r->intParam('uid')]);
        return Reply::empty();
    }

    /** POST /community/groups/{id}/invites {user_id} — by members with «قبول الأعضاء». */
    public static function invite(Request $r): Reply
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'accept_members');
        $uid = (int) V::int($r->body(), 'user_id', 1, PHP_INT_MAX >> 1);
        $u = Auth::findUser($uid);
        $uctx = $u !== null && Community::profileRow($uid) !== null ? Community::ctxOf($u) : null;
        if ($uctx === null || Community::blocked((int) $ctx['id'], $uid)) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        if (!Community::canSeeGroup($uctx, $g)) {
            throw new ApiError(422, 'not_eligible', 'هذا الجروب ليس من النوع المناسب لهذا الشخص.');
        }
        if (Community::membership((int) $g['id'], $uid) !== null) {
            return new Reply(['status' => 'member']);
        }
        Db::exec(
            "INSERT INTO cgroup_requests (group_id, user_id, kind, invited_by, created_at) VALUES (?, ?, 'invite', ?, ?)
             ON DUPLICATE KEY UPDATE kind = 'invite', invited_by = VALUES(invited_by)",
            [(int) $g['id'], $uid, (int) $ctx['id'], Db::now()]
        );
        Push::notify($uid, 'join_request', (string) $g['name'], $ctx['name'] . ' دعاك للانضمام إلى الجروب.', ['group_id' => (int) $g['id'], 'invite' => 1]);
        return Reply::created(['status' => 'invited']);
    }

    /** DELETE /community/groups/{id}/members/{uid} — kick (moderators only kick plain members). */
    public static function kick(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'kick');
        $uid = $r->intParam('uid');
        $t = Community::membership((int) $g['id'], $uid);
        if ($t === null) {
            throw ApiError::notFound('ليس عضواً.');
        }
        if ($t['role'] === 'founder' || ($t['role'] === 'moderator' && $m['role'] !== 'founder')) {
            throw ApiError::forbidden('لا يمكنك إخراج هذا العضو.');
        }
        Db::exec('DELETE FROM cgroup_members WHERE group_id = ? AND user_id = ?', [(int) $g['id'], $uid]);
        Groups::recount((int) $g['id']);
        return Reply::empty();
    }

    /** PUT /community/groups/{id}/moderators/{uid} {perms:[…]} — founder, or a moderator with «تعيين مشرفين» (cannot grant that one). */
    public static function setModerator(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'assign_moderators');
        $uid = $r->intParam('uid');
        $t = Community::membership((int) $g['id'], $uid);
        if ($t === null || $t['role'] === 'founder') {
            throw ApiError::notFound('ليس عضواً.');
        }
        $bits = Groups::permBits($r->body()['perms'] ?? null);
        if ($m['role'] !== 'founder') {
            if (($bits & Groups::PERMS['assign_moderators']) !== 0 || ($bits & ~(int) $m['perms']) !== 0) {
                throw ApiError::forbidden('لا يمكنك منح صلاحيات لا تملكها.');
            }
            if ($t['role'] === 'moderator' && ((int) $t['perms'] & Groups::PERMS['assign_moderators']) !== 0) {
                throw ApiError::forbidden('لا يمكنك تعديل صلاحيات هذا المشرف.');
            }
        }
        Db::exec("UPDATE cgroup_members SET role = 'moderator', perms = ? WHERE group_id = ? AND user_id = ?", [$bits, (int) $g['id'], $uid]);
        return ['role' => 'moderator', 'perms' => Groups::permList($bits)];
    }

    public static function removeModerator(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'assign_moderators');
        $uid = $r->intParam('uid');
        $t = Community::membership((int) $g['id'], $uid);
        if ($t === null || $t['role'] !== 'moderator') {
            throw ApiError::notFound('ليس مشرفاً.');
        }
        if ($m['role'] !== 'founder' && ((int) $t['perms'] & Groups::PERMS['assign_moderators']) !== 0) {
            throw ApiError::forbidden('لا يمكنك تعديل صلاحيات هذا المشرف.');
        }
        Db::exec("UPDATE cgroup_members SET role = 'member', perms = 0 WHERE group_id = ? AND user_id = ?", [(int) $g['id'], $uid]);
        return ['role' => 'member'];
    }

    /** POST /community/groups/{id}/transfer {user_id} — founder only; the old founder stays as a full moderator. */
    public static function transfer(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::founder($m);
        $uid = (int) V::int($r->body(), 'user_id', 1, PHP_INT_MAX >> 1);
        if ($uid === (int) $ctx['id'] || Community::membership((int) $g['id'], $uid) === null) {
            throw ApiError::validation(['user_id' => 'اختر عضواً في الجروب.']);
        }
        Db::tx(static function () use ($g, $uid, $ctx): void {
            Db::exec("UPDATE cgroup_members SET role = 'moderator', perms = ? WHERE group_id = ? AND user_id = ?", [Groups::ALL_PERMS, (int) $g['id'], (int) $ctx['id']]);
            Db::exec("UPDATE cgroup_members SET role = 'founder', perms = ? WHERE group_id = ? AND user_id = ?", [Groups::ALL_PERMS, (int) $g['id'], $uid]);
            Db::exec('UPDATE cgroups SET founder_id = ?, updated_at = ? WHERE id = ?', [$uid, Db::now(), (int) $g['id']]);
        });
        return Groups::shape(Groups::load((int) $g['id']), $ctx, Community::membership((int) $g['id'], (int) $ctx['id']), true);
    }

    public static function follow(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        if ($m === null) {
            if ($g['privacy'] !== 'public') {
                throw ApiError::forbidden('يمكن متابعة الجروبات العامة فقط.');
            }
            Db::exec('INSERT IGNORE INTO cgroup_follows (group_id, user_id, created_at) VALUES (?, ?, ?)', [(int) $g['id'], (int) $ctx['id'], Db::now()]);
        }
        return Reply::empty();
    }

    public static function unfollow(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        Db::exec('DELETE FROM cgroup_follows WHERE group_id = ? AND user_id = ?', [$r->intParam('id'), (int) $ctx['id']]);
        return Reply::empty();
    }

    /** POST /community/groups/{id}/photo (multipart `photo`) — founder or «تعديل المعلومات والصورة». */
    public static function uploadPhoto(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'edit_info');
        if (!Avatar::available() || !Migrations::ready()) {
            throw new ApiError(503, 'avatar_unavailable');
        }
        if (!str_starts_with(strtolower((string) $r->header('content-type')), 'multipart/form-data')) {
            throw ApiError::validation(['photo' => 'أرسل الصورة في الحقل photo (multipart/form-data).'], 'اختر صورة لرفعها.');
        }
        RateLimit::hit('avatar', ['user:' . $ctx['id']]);
        $file = Avatar::store((int) $ctx['id'], $r->file('photo'));
        Db::exec('UPDATE cgroups SET photo_file = ?, updated_at = ? WHERE id = ?', [$file, Db::now(), (int) $g['id']]);
        Avatar::delete(is_string($g['photo_file']) ? $g['photo_file'] : null);
        return Groups::shape(Groups::load((int) $g['id']), $ctx, $m, true);
    }

    public static function removePhoto(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$g, $m] = self::load($r, $ctx);
        self::need($m, 'edit_info');
        Db::exec('UPDATE cgroups SET photo_file = NULL, updated_at = ? WHERE id = ?', [Db::now(), (int) $g['id']]);
        Avatar::delete(is_string($g['photo_file']) ? $g['photo_file'] : null);
        return Groups::shape(Groups::load((int) $g['id']), $ctx, $m, true);
    }
}
