<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Community;
use NQ\Core\Db;
use NQ\Core\Migrations;
use NQ\Core\Moderation;
use NQ\Core\Push;
use NQ\Core\PushText;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Rooms;
use NQ\Core\Settings;
use NQ\Core\V;

/** Community profile, people, friends, follows, blocks, devices, notifications and reports. */
final class CommunityController
{
    public const REPORT_REASONS = [
        'harassment' => 'تحرّش أو إساءة',
        'hate' => 'كراهية أو تحريض',
        'sexual' => 'محتوى غير لائق أو جنسي',
        'spam' => 'إزعاج أو إعلانات',
        'impersonation' => 'انتحال شخصية',
        'inappropriate_photo' => 'صورة غير لائقة',
        'child_safety' => 'خطر على طفل',
        'violence' => 'عنف أو تهديد',
        'gender_rules' => 'مخالفة الفصل بين الجنسين',
        'other' => 'سبب آخر',
    ];

    // ── Own community profile ────────────────────────────────────────────────

    /** @param array<string,mixed> $u */
    private static function selfShape(array $u): array
    {
        $uid = (int) $u['id'];
        $p = Community::profileRow($uid);
        $age = Community::age($u['birthdate'] ?? null);
        $missing = Community::missing($u);
        $minor = $age !== null && $age < Community::ADULT_AGE;
        $s = Community::roomsBan($uid);
        return [
            'joined' => $p !== null,
            'eligible' => $missing === [] && $age !== null && $age >= Community::MIN_AGE,
            'missing' => $missing,
            'gender' => in_array($u['gender'] ?? null, ['male', 'female'], true) ? $u['gender'] : null,
            'birthdate' => $u['birthdate'] ?: null,
            'age' => $age,
            'is_minor' => $minor,
            'underage' => $age !== null && $age < Community::MIN_AGE,
            'locked' => ['gender' => $p !== null, 'birthdate' => $p !== null], // after joining: only via support/admin
            // agreed to the terms (zero tolerance for abuse); false → the app asks once (PATCH {terms_accepted: true})
            'terms_accepted' => $p !== null && (!array_key_exists('terms_accepted_at', $p) || $p['terms_accepted_at'] !== null),
            'user' => Community::brief($u),
            'profile' => $p === null ? null : [
                'bio' => (string) $p['bio'],
                'facebook_url' => $p['facebook_url'],
                'instagram_url' => $p['instagram_url'],
                'is_private' => (int) $p['is_private'] === 1 || $minor,
                'private_forced' => $minor,
                'dm_policy' => $minor ? 'none' : (string) $p['dm_policy'],
                'counters' => self::counters($uid, $p),
            ],
            'suspension' => $s === null ? null : [
                'scope' => (string) $s['scope'], 'source' => (string) $s['source'], 'reason' => (string) $s['reason'],
                'until' => Db::iso($s['until']), 'permanent' => $s['until'] === null && ((int) $s['locked'] === 1 || $s['source'] === 'admin'),
            ],
            'muted_types' => $p === null ? [] : array_values(array_filter(explode(',', (string) $p['muted_types']))),
        ];
    }

    /** @param array<string,mixed> $p @return array<string,int> */
    private static function counters(int $uid, array $p): array
    {
        return [
            'friends' => (int) Db::value('SELECT COUNT(*) FROM friendships WHERE user_id = ?', [$uid]),
            'followers' => (int) Db::value('SELECT COUNT(*) FROM follows WHERE followee_id = ?', [$uid]),
            'following' => (int) Db::value('SELECT COUNT(*) FROM follows WHERE follower_id = ?', [$uid]),
            'claps_sent' => (int) $p['claps_sent'],
            'claps_received' => (int) $p['claps_received'],
        ];
    }

    public static function myProfile(Request $r): array
    {
        $r->userId();
        Settings::requireFeature('rooms');
        return self::selfShape((array) $r->user);
    }

    /**
     * PATCH /me/community-profile — gender and birthdate can be given until the account joins the community (both set),
     * then they are locked (409 gender_locked / birthdate_locked; corrections by an admin via support).
     */
    public static function updateMyProfile(Request $r): array
    {
        $uid = $r->userId();
        Settings::requireFeature('rooms');
        $b = $r->body();
        $u = (array) $r->user;
        $joined = Community::profileRow($uid) !== null;
        $terms = array_key_exists('terms_accepted', $b) ? V::bool($b, 'terms_accepted') : null;
        if ($terms === false) {
            throw ApiError::validation(['terms_accepted' => 'يجب الموافقة على الشروط.']);
        }
        $sets = [];
        $params = [];
        if (array_key_exists('gender', $b)) {
            $g = (string) V::enum($b, 'gender', ['male', 'female']);
            if ($joined && $g !== $u['gender']) {
                throw new ApiError(409, 'gender_locked', 'لا يمكن تغيير الجنس بعد تحديده. تواصل مع الدعم إن كان هناك خطأ.');
            }
            $sets[] = 'gender = ?';
            $params[] = $g;
        }
        if (array_key_exists('birthdate', $b)) {
            $bd = (string) V::date($b, 'birthdate');
            if ($bd > gmdate('Y-m-d') || $bd < '1900-01-01') {
                throw ApiError::validation(['birthdate' => 'تاريخ غير صالح.']);
            }
            if ($joined && $bd !== (string) $u['birthdate']) {
                throw new ApiError(409, 'birthdate_locked', 'لا يمكن تغيير تاريخ الميلاد بعد تحديده. تواصل مع الدعم إن كان هناك خطأ.');
            }
            $sets[] = 'birthdate = ?';
            $params[] = $bd;
        }
        if ($sets !== [] && !$joined && $terms !== true && Migrations::ready() && Community::clientAsksTerms($r)) {
            $after = $u;
            foreach ($sets as $i => $col) {
                $after[substr($col, 0, (int) strpos($col, ' '))] = $params[$i];
            }
            if (Community::missing($after) === []) {
                // joining (gender + birthdate complete) needs the agreement to the terms (the gate's checkbox); nothing is saved without it
                throw new ApiError(422, 'terms_required', 'وافق على شروط الاستخدام وقواعد الغرف والمجتمع أولاً.', ['fields' => ['terms_accepted' => 'يجب الموافقة على الشروط.']]);
            }
        }
        if ($sets !== []) {
            Db::exec('UPDATE users SET ' . implode(', ', $sets) . ', updated_at = ? WHERE id = ?', array_merge($params, [Db::now(), $uid]));
            $u = (array) Auth::findUser($uid);
            $r->user = $u;
            if (Community::missing($u) === []) {
                Community::ensureProfileRow($uid); // joined: gender + birthdate are now locked (also for under-13s)
            }
        }
        if ($terms === true && Migrations::ready()) {
            if (Community::profileRow($uid) === null) {
                throw new ApiError(409, 'community_profile_required', 'أكمل بياناتك (الجنس وتاريخ الميلاد) قبل دخول الغرف والمجتمع.', ['missing' => Community::missing((array) Auth::findUser($uid))]);
            }
            Db::exec('UPDATE community_profiles SET terms_accepted_at = COALESCE(terms_accepted_at, ?), updated_at = ? WHERE user_id = ?', [Db::now(), Db::now(), $uid]);
        }
        $profileFields = array_intersect(array_keys($b), ['bio', 'facebook_url', 'instagram_url', 'is_private', 'dm_policy']);
        if ($profileFields !== []) {
            $ctx = Community::ctx($r);
            $pf = [];
            $pp = [];
            if (array_key_exists('bio', $b)) {
                $bio = V::str($b, 'bio', 300, false, 0, true) ?? '';
                if (Moderation::hasLink($bio)) {
                    throw ApiError::validation(['bio' => 'لا يُسمح بالروابط في النبذة (استخدم حقلي فيسبوك وإنستغرام).']);
                }
                Moderation::enforce($uid, 'bio', null, $bio);
                $pf[] = 'bio = ?';
                $pp[] = $bio;
            }
            foreach (['facebook_url' => 'facebook', 'instagram_url' => 'instagram'] as $f => $kind) {
                if (array_key_exists($f, $b)) {
                    $pf[] = "{$f} = ?";
                    $pp[] = Community::socialUrl($b[$f], $f, $kind);
                }
            }
            if (array_key_exists('is_private', $b)) {
                $pf[] = 'is_private = ?';
                $pp[] = (int) V::bool($b, 'is_private');
            }
            if (array_key_exists('dm_policy', $b)) {
                $pf[] = 'dm_policy = ?';
                $pp[] = (string) V::enum($b, 'dm_policy', ['everyone', 'same_gender', 'friends']);
            }
            Db::exec('UPDATE community_profiles SET ' . implode(', ', $pf) . ', updated_at = ? WHERE user_id = ?', array_merge($pp, [Db::now(), (int) $ctx['id']]));
        }
        return self::selfShape((array) Auth::findUser($uid));
    }

    // ── Other people ─────────────────────────────────────────────────────────

    /** @return array<string,mixed> a user who is a visible community member, else 404 */
    private static function person(array $ctx, int $id): array
    {
        $t = Auth::findUser($id);
        if ($t === null || Community::profileRow($id) === null || ($id !== (int) $ctx['id'] && Community::blocked((int) $ctx['id'], $id))) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        return $t;
    }

    /** The room a person is in now, if this viewer may see it. @return array<string,mixed>|null */
    public static function inRoomNow(array $ctx, int $uid): ?array
    {
        $room = Db::one(
            "SELECT r.* FROM room_participants p JOIN rooms r ON r.id = p.room_id WHERE p.user_id = ? AND p.present = 1 AND r.status = 'open' ORDER BY p.joined_at DESC LIMIT 1",
            [$uid]
        );
        return $room !== null && Community::canSeeRoom($ctx, $room) ? ['id' => (int) $room['id'], 'title' => (string) $room['title'], 'gender_scope' => (string) $room['gender_scope']] : null;
    }

    public static function show(Request $r): array
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        $t = self::person($ctx, $id);
        $p = (array) Community::profileRow($id);
        $minor = Community::isMinor($t);
        $private = (int) $p['is_private'] === 1 || $minor;
        $isMe = $id === $me;
        $friend = !$isMe && Community::friends($me, $id);
        $full = $isMe || $friend || !$private;
        $out = Community::brief($t) + [
            'is_private' => $private,
            'is_me' => $isMe,
            'relation' => [
                'is_friend' => $friend,
                'i_follow' => !$isMe && Community::follows($me, $id),
                'follows_me' => !$isMe && Community::follows($id, $me),
                'request_sent' => !$isMe && Db::value('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', [$me, $id]) !== null,
                'request_received' => !$isMe && Db::value('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', [$id, $me]) !== null,
            ],
            'can_friend' => !$isMe && !$friend && !$ctx['minor'] && !$minor,
            'can_message' => !$isMe && MessagesController::startRule($ctx, $t) === null,
            'lists_visible' => $isMe || $friend,   // who: friends / followers / clappers
        ];
        if ($full) {
            $out['bio'] = (string) $p['bio'];
            $out['facebook_url'] = $p['facebook_url'];
            $out['instagram_url'] = $p['instagram_url'];
            $out['counters'] = self::counters($id, $p);
            $out['in_room'] = self::inRoomNow($ctx, $id);
            $out['joined_at'] = Db::iso((string) $p['joined_at']);
        }
        return $out;
    }

    /** @return array{0:string,1:list<mixed>} SQL excluding people blocked either way (alias u). */
    private static function notBlocked(int $me): array
    {
        return ['NOT EXISTS (SELECT 1 FROM blocks bx WHERE (bx.blocker_id = ? AND bx.blocked_id = u.id) OR (bx.blocker_id = u.id AND bx.blocked_id = ?))', [$me, $me]];
    }

    /** friends | followers | following | clappers of a person — visible to that person's friends (and themselves). */
    public static function lists(Request $r): array
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        self::person($ctx, $id);
        $kind = $r->param('kind');
        if ($id !== $me && !Community::friends($me, $id)) {
            throw ApiError::forbidden('هذه القائمة متاحة لأصدقاء صاحب الحساب فقط.');
        }
        return self::listOf($id, $me, $kind, $r);
    }

    private static function listOf(int $id, int $viewer, string $kind, Request $r): array
    {
        [$page, $per, $off] = V::page($r, 50);
        [$nb, $nbp] = self::notBlocked($viewer);
        [$join, $order, $extra] = match ($kind) {
            'friends' => ['JOIN friendships x ON x.friend_id = u.id AND x.user_id = ?', 'x.created_at DESC', ''],
            'followers' => ['JOIN follows x ON x.follower_id = u.id AND x.followee_id = ?', 'x.created_at DESC', ''],
            'following' => ['JOIN follows x ON x.followee_id = u.id AND x.follower_id = ?', 'x.created_at DESC', ''],
            'clappers' => ['JOIN clap_tallies x ON x.from_id = u.id AND x.to_id = ?', 'x.claps DESC, x.last_at DESC', ', x.claps'],
            default => throw ApiError::notFound(),
        };
        $total = (int) Db::value("SELECT COUNT(*) FROM users u {$join} WHERE {$nb}", array_merge([$id], $nbp));
        $rows = Db::all('SELECT ' . Community::briefCols() . "{$extra} FROM users u {$join} WHERE {$nb} ORDER BY {$order} LIMIT ? OFFSET ?", array_merge([$id], $nbp, [$per, $off]));
        $items = array_map(static fn (array $u): array => Community::brief($u) + (isset($u['claps']) ? ['claps' => (int) $u['claps']] : []), $rows);
        return V::paginated($items, $page, $per, $total);
    }

    /** GET /me/friends|followers|following */
    public static function myList(Request $r): array
    {
        $ctx = Community::ctx($r);
        return self::listOf((int) $ctx['id'], (int) $ctx['id'], $r->param('kind'), $r);
    }

    public static function search(Request $r): array
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        RateLimit::hit('search', ['user:' . $me]);
        $q = trim(mb_substr((string) $r->q('q', ''), 0, 60));
        if (mb_strlen($q) < 2) {
            return ['items' => []];
        }
        [$nb, $nbp] = self::notBlocked($me);
        $rows = Db::all(
            'SELECT ' . Community::briefCols() . ", EXISTS(SELECT 1 FROM friendships f WHERE f.user_id = ? AND f.friend_id = u.id) AS is_friend,
                EXISTS(SELECT 1 FROM follows fo WHERE fo.follower_id = ? AND fo.followee_id = u.id) AS i_follow
             FROM users u JOIN community_profiles cp ON cp.user_id = u.id
             WHERE u.id <> ? AND u.gender = ? AND u.name LIKE ? AND {$nb}
               AND NOT EXISTS (SELECT 1 FROM bans ab WHERE ab.user_id = u.id AND ab.scope = 'app' AND (ab.until IS NULL OR ab.until > ?))
             ORDER BY u.name = ? DESC, u.name LIMIT 30",
            // Owner decision 12: people search lists only members of the searcher's own gender.
            array_merge([$me, $me, $me, (string) $ctx['gender'], '%' . Db::likeEscape($q) . '%'], $nbp, [Db::now(), $q])
        );
        return ['items' => array_map(static fn (array $u): array => Community::brief($u) + [
            'is_friend' => (int) $u['is_friend'] === 1, 'i_follow' => (int) $u['i_follow'] === 1,
        ], $rows)];
    }

    /** Friends who are in a room right now that this viewer may see («نشاط الأصدقاء»). */
    public static function friendsActivity(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$vis, $vp] = Community::roomVisibilitySql($ctx);
        $rows = Db::all(
            'SELECT ' . Community::briefCols() . ", r.id AS room_id, r.title AS room_title, r.gender_scope AS room_scope, p.role
             FROM friendships f JOIN users u ON u.id = f.friend_id
             JOIN room_participants p ON p.user_id = u.id AND p.present = 1
             JOIN rooms r ON r.id = p.room_id AND r.status = 'open'
             WHERE f.user_id = ? AND {$vis} ORDER BY p.joined_at DESC LIMIT 100",
            array_merge([(int) $ctx['id']], $vp)
        );
        return ['items' => array_map(static fn (array $u): array => Community::brief($u) + [
            'room' => ['id' => (int) $u['room_id'], 'title' => (string) $u['room_title'], 'gender_scope' => (string) $u['room_scope']],
            'role' => (string) $u['role'],
        ], $rows)];
    }

    // ── Friends & follows ────────────────────────────────────────────────────

    /** @param array<string,mixed> $ctx @param array<string,mixed> $t */
    private static function friendshipAllowed(array $ctx, array $t): void
    {
        if ($ctx['minor'] || Community::isMinor($t)) {
            throw new ApiError(403, 'minor_restricted', 'الصداقة والرسائل غير متاحة لمن هم دون 18 سنة.');
        }
    }

    private static function makeFriends(int $a, int $b): void
    {
        Db::tx(static function () use ($a, $b): void {
            Db::exec('INSERT IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)', [$a, $b, Db::now(), $b, $a, Db::now()]);
            Db::exec('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [$a, $b, $b, $a]);
        });
    }

    public static function friendRequest(Request $r): Reply
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        if ($id === $me) {
            throw ApiError::badRequest('لا يمكنك إضافة نفسك.');
        }
        $t = self::person($ctx, $id);
        self::friendshipAllowed($ctx, $t);
        RateLimit::hit('social', ['user:' . $me]);
        if (Community::friends($me, $id)) {
            throw new ApiError(409, 'conflict', 'أنتما صديقان بالفعل.');
        }
        if (Db::value('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', [$id, $me]) !== null) {
            self::makeFriends($me, $id); // they already asked: accepting by asking back
            Push::notify($id, 'friend_accept', $ctx['name'], 'قبل طلب الصداقة.', ['user_id' => $me]);
            return new Reply(['status' => 'friends']);
        }
        $new = Db::exec('INSERT IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)', [$me, $id, Db::now()]) === 1;
        // a request that is never accepted leaves the requester as a follower
        Db::exec('INSERT IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)', [$me, $id, Db::now()]);
        if ($new) {
            Push::notify($id, 'friend_request', $ctx['name'], 'أرسل لك طلب صداقة.', ['user_id' => $me]);
        }
        return Reply::created(['status' => 'requested']);
    }

    public static function cancelFriendRequest(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        Db::exec('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?', [(int) $ctx['id'], $r->intParam('id')]);
        return Reply::empty();
    }

    public static function friendRequests(Request $r): array
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $map = static fn (array $u): array => Community::brief($u) + ['created_at' => Db::iso($u['created_at'])];
        return [
            'incoming' => array_map($map, Db::all('SELECT ' . Community::briefCols() . ', fr.created_at FROM friend_requests fr JOIN users u ON u.id = fr.from_id WHERE fr.to_id = ? ORDER BY fr.created_at DESC LIMIT 200', [$me])),
            'outgoing' => array_map($map, Db::all('SELECT ' . Community::briefCols() . ', fr.created_at FROM friend_requests fr JOIN users u ON u.id = fr.to_id WHERE fr.from_id = ? ORDER BY fr.created_at DESC LIMIT 200', [$me])),
        ];
    }

    public static function acceptFriend(Request $r): array
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        if (Db::value('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', [$id, $me]) === null) {
            throw ApiError::notFound('طلب الصداقة غير موجود.');
        }
        $t = self::person($ctx, $id);
        self::friendshipAllowed($ctx, $t);
        self::makeFriends($me, $id);
        Push::notify($id, 'friend_accept', $ctx['name'], 'قبل طلب صداقتك.', ['user_id' => $me]);
        return ['status' => 'friends'];
    }

    public static function declineFriend(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        Db::exec('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?', [$r->intParam('id'), (int) $ctx['id']]); // they stay a follower
        return Reply::empty();
    }

    public static function unfriend(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        Db::exec('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [$me, $id, $id, $me]);
        return Reply::empty();
    }

    public static function follow(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        if ($id === $me) {
            throw ApiError::badRequest('لا يمكنك متابعة نفسك.');
        }
        self::person($ctx, $id);
        RateLimit::hit('social', ['user:' . $me]);
        Db::exec('INSERT IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)', [$me, $id, Db::now()]);
        return Reply::empty();
    }

    public static function unfollow(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        Db::exec('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', [(int) $ctx['id'], $r->intParam('id')]);
        return Reply::empty();
    }

    public static function removeFollower(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        Db::exec('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', [$r->intParam('id'), (int) $ctx['id']]);
        return Reply::empty();
    }

    public static function block(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $id = $r->intParam('id');
        if ($id === $me || Auth::findUser($id) === null) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        Db::tx(static function () use ($me, $id): void {
            Db::exec('INSERT IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', [$me, $id, Db::now()]);
            Db::exec('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [$me, $id, $id, $me]);
            Db::exec('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)', [$me, $id, $id, $me]);
            Db::exec('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [$me, $id, $id, $me]);
        });
        return Reply::empty();
    }

    public static function unblock(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        Db::exec('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [(int) $ctx['id'], $r->intParam('id')]);
        return Reply::empty();
    }

    public static function blocks(Request $r): array
    {
        $ctx = Community::ctx($r, true);
        return ['items' => array_map([Community::class, 'brief'], Db::all(
            'SELECT ' . Community::briefCols() . ' FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC',
            [(int) $ctx['id']]
        ))];
    }

    // ── Devices & notifications ──────────────────────────────────────────────

    public static function registerDevice(Request $r): Reply
    {
        $uid = $r->userId();
        $b = $r->body();
        $provider = (string) V::enum($b, 'provider', ['fcm', 'apns']);
        $token = (string) V::str($b, 'token', 255);
        $platform = V::enum($b, 'platform', ['android', 'ios', 'web'], false) ?? ($provider === 'apns' ? 'ios' : 'android');
        $ver = V::str($b, 'app_version', 32, false, 0) ?? '';
        if ($provider === 'apns' ? !preg_match('/^[A-Fa-f0-9]{64,200}$/', $token) : !preg_match('/^[A-Za-z0-9_:.\-]{20,255}$/', $token)) {
            throw ApiError::validation(['token' => 'رمز الجهاز غير صالح.']);
        }
        if ($provider === 'apns') {
            $token = strtolower($token);
        }
        Db::exec(
            'INSERT INTO devices (user_id, provider, token, platform, app_version, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), provider = VALUES(provider), platform = VALUES(platform),
               app_version = VALUES(app_version), last_seen_at = VALUES(last_seen_at)',
            [$uid, $provider, $token, $platform, $ver, Db::now(), Db::now()]
        );
        // keep the 10 most recent devices per account
        $old = Db::all('SELECT id FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC, id DESC LIMIT 100 OFFSET 10', [$uid]);
        foreach ($old as $o) {
            Db::exec('DELETE FROM devices WHERE id = ?', [(int) $o['id']]);
        }
        return Reply::created(['provider' => $provider, 'platform' => $platform]);
    }

    public static function removeDevice(Request $r): \stdClass
    {
        $uid = $r->userId();
        $token = (string) V::str($r->body(), 'token', 255);
        Db::exec('DELETE FROM devices WHERE user_id = ? AND (token = ? OR token = ?)', [$uid, $token, strtolower($token)]);
        return Reply::empty();
    }

    /** GET /me/notifications?after_id=&limit= — ETag/304 for cheap polling. */
    public static function notifications(Request $r): Reply
    {
        $uid = $r->userId();
        $after = max(0, (int) ($r->q('after_id') ?? '0'));
        $limit = max(1, min(100, (int) ($r->q('limit') ?? '50')));
        $stat = Db::one('SELECT COALESCE(MAX(id), 0) AS max_id, COALESCE(SUM(read_at IS NULL), 0) AS unread FROM notifications WHERE user_id = ?', [$uid]) ?? ['max_id' => 0, 'unread' => 0];
        $langNow = (string) (Db::one('SELECT lang FROM users WHERE id = ?', [$uid])['lang'] ?? 'ar');
        $etag = 'W/"n' . $stat['max_id'] . '-' . $stat['unread'] . '-' . $after . '-' . $limit . '-' . $langNow . '"';
        if ($r->header('if-none-match') === $etag) {
            return new Reply(null, 304, ['ETag' => $etag]);
        }
        $rows = Db::all(
            'SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT ?',
            [$uid, $after, $limit]
        );
        $lang = $langNow;
        return new Reply([
            'items' => array_map(static fn (array $n): array => [
                'id' => (int) $n['id'], 'type' => (string) $n['type'],
                'title' => PushText::tr((string) $n['title'], $lang), 'body' => PushText::tr((string) $n['body'], $lang),
                'data' => json_decode((string) $n['data'], true) ?: new \stdClass(), 'read' => $n['read_at'] !== null, 'created_at' => Db::iso($n['created_at']),
            ], $rows),
            'unread' => (int) $stat['unread'],
            'max_id' => (int) $stat['max_id'],
        ], 200, ['ETag' => $etag]);
    }

    public static function readNotifications(Request $r): \stdClass
    {
        $uid = $r->userId();
        $b = $r->body();
        if (($b['all'] ?? false) === true) {
            Db::exec('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [Db::now(), $uid]);
            return Reply::empty();
        }
        $ids = $b['ids'] ?? [];
        if (!is_array($ids) || !array_is_list($ids) || count($ids) > 200) {
            throw ApiError::validation(['ids' => 'قائمة غير صالحة.']);
        }
        $ids = array_values(array_filter(array_map('intval', $ids), static fn (int $i): bool => $i > 0));
        if ($ids !== []) {
            Db::exec('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([Db::now(), $uid], $ids));
        }
        return Reply::empty();
    }

    public static function notificationPrefs(Request $r): array
    {
        $uid = $r->userId();
        $muted = array_filter(explode(',', (string) (Db::value('SELECT muted_types FROM community_profiles WHERE user_id = ?', [$uid]) ?? '')));
        return ['types' => array_map(static fn (string $t): array => ['type' => $t, 'muted' => in_array($t, $muted, true)], Push::MUTABLE)];
    }

    public static function saveNotificationPrefs(Request $r): array
    {
        $ctx = Community::ctx($r, true);
        $m = $r->body()['muted'] ?? null;
        if (!is_array($m) || !array_is_list($m)) {
            throw ApiError::validation(['muted' => 'يجب أن تكون قائمة.']);
        }
        foreach ($m as $t) {
            if (!is_string($t) || !in_array($t, Push::MUTABLE, true)) {
                throw ApiError::validation(['muted' => 'نوع إشعار غير معروف.']);
            }
        }
        Db::exec('UPDATE community_profiles SET muted_types = ?, updated_at = ? WHERE user_id = ?', [implode(',', array_unique($m)), Db::now(), (int) $ctx['id']]);
        return self::notificationPrefs($r);
    }

    // ── Reports ──────────────────────────────────────────────────────────────

    public static function reportReasons(Request $r): array
    {
        return ['items' => array_map(static fn (string $k, string $v): array => ['id' => $k, 'label' => $v], array_keys(self::REPORT_REASONS), self::REPORT_REASONS)];
    }

    /** POST /reports {target_type, target_id, reason, details?} — anything can be reported; evidence is kept for the admins. */
    public static function report(Request $r): Reply
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $b = $r->body();
        $type = (string) V::enum($b, 'target_type', ['user', 'room_message', 'dm_message', 'room', 'photo', 'group', 'group_photo']);
        $tid = (int) V::int($b, 'target_id', 1, PHP_INT_MAX >> 1);
        $reason = (string) V::enum($b, 'reason', array_keys(self::REPORT_REASONS));
        $details = V::str($b, 'details', 1000, false, 0, true) ?? '';
        RateLimit::hit('report', ['user:' . $me]);
        $nf = static fn () => throw ApiError::notFound('العنصر المبلّغ عنه غير موجود.');
        $targetUser = null;
        $snapshot = [];
        switch ($type) {
            case 'user':
            case 'photo':
                $u = Auth::findUser($tid);
                if ($u === null || $tid === $me) {
                    $nf();
                }
                $p = Community::profileRow($tid);
                $targetUser = $tid;
                $snapshot = ['name' => $u['name'], 'avatar_url' => Auth::avatarUrl($u), 'bio' => $p['bio'] ?? ''];
                break;
            case 'room_message':
                $m = Db::one("SELECT * FROM room_messages WHERE id = ? AND kind = 'chat'", [$tid]);
                if ($m === null || (Rooms::participant((int) $m['room_id'], $me) === null && !Community::canSeeRoom($ctx, Rooms::load((int) $m['room_id'])))) {
                    $nf();
                }
                Db::exec('UPDATE room_messages SET reported = 1 WHERE id = ?', [$tid]); // survives the room closing
                $targetUser = $m['user_id'] !== null ? (int) $m['user_id'] : null;
                $snapshot = ['room_id' => (int) $m['room_id'], 'body' => $m['body'], 'created_at' => Db::iso($m['created_at'])];
                break;
            case 'dm_message':
                $m = Db::one('SELECT m.* FROM dm_messages m WHERE m.id = ? AND m.deleted_at IS NULL AND (m.sender_id = ? OR m.recipient_id = ?)', [$tid, $me, $me]);
                if ($m === null) {
                    $nf();
                }
                Db::exec('UPDATE dm_messages SET reported = 1 WHERE id = ?', [$tid]); // survives deletion by either side
                $targetUser = $m['sender_id'] !== null ? (int) $m['sender_id'] : null;
                $snapshot = ['conversation_id' => $m['conversation_id'] !== null ? (int) $m['conversation_id'] : null, 'body' => $m['body'],
                    'sender_id' => $targetUser, 'created_at' => Db::iso($m['created_at'])];
                break;
            case 'room':
                $room = Db::one('SELECT * FROM rooms WHERE id = ?', [$tid]);
                if ($room === null || (!Community::canSeeRoom($ctx, $room) && Rooms::participant($tid, $me) === null)) {
                    $nf();
                }
                $targetUser = $room['owner_id'] !== null ? (int) $room['owner_id'] : null;
                $snapshot = ['title' => $room['title'], 'gender_scope' => $room['gender_scope'], 'status' => $room['status']];
                break;
            default: // group, group_photo
                $g = Db::one('SELECT * FROM cgroups WHERE id = ?', [$tid]);
                if ($g === null || !Community::canSeeGroup($ctx, $g)) {
                    $nf();
                }
                $targetUser = $g['founder_id'] !== null ? (int) $g['founder_id'] : null;
                $snapshot = ['name' => $g['name'], 'description' => $g['description'], 'photo_url' => Community::photoUrl($g['photo_file'])];
        }
        $existing = Db::value("SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'", [$me, $type, $tid]);
        if ($existing !== null) {
            return new Reply(['id' => (int) $existing, 'status' => 'open']);
        }
        $id = Db::insert(
            "INSERT INTO reports (reporter_id, source, target_type, target_id, target_user_id, reason, details, snapshot, status, created_at)
             VALUES (?, 'user', ?, ?, ?, ?, ?, ?, 'open', ?)",
            [$me, $type, $tid, $targetUser, $reason, $details, (string) json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), Db::now()]
        );
        return Reply::created(['id' => $id, 'status' => 'open']);
    }
}
