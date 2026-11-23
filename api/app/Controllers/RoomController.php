<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Community;
use NQ\Core\Db;
use NQ\Core\Groups;
use NQ\Core\LiveKit;
use NQ\Core\Moderation;
use NQ\Core\Push;
use NQ\Core\Quran;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Rooms;
use NQ\Core\V;

/**
 * Live audio rooms (no recording). Roles: owner (everything), moderator (stage, mute, kick, shared page),
 * speaker, listener (hand, chat, reactions). Audio flows through LiveKit; chat, reactions and room events go through
 * this API (moderated, rate-limited) and are broadcast with LiveKit SendData.
 */
final class RoomController
{
    private const CHAT_MAX = 500;

    private static function nowMs(int $plusMs = 0): string
    {
        $t = microtime(true) + $plusMs / 1000;
        return gmdate('Y-m-d H:i:s', (int) floor($t)) . sprintf('.%03d', (int) (($t - floor($t)) * 1000));
    }

    /** @param array<string,mixed> $ctx */
    private static function ctx(Request $r): array
    {
        $ctx = Community::ctx($r);
        Community::requireRooms($ctx);
        return $ctx;
    }

    /** The viewer's role in a room (owner even before joining). @param array<string,mixed> $room */
    private static function roleOf(array $room, int $uid): ?string
    {
        $p = Rooms::participant((int) $room['id'], $uid);
        if ($p !== null && (int) $p['kicked'] === 0) {
            return (string) $p['role'];
        }
        return (int) ($room['owner_id'] ?? 0) === $uid ? 'owner' : null;
    }

    /** @param array<string,mixed> $room */
    private static function requireOpen(array $room): void
    {
        if ($room['status'] !== 'open') {
            throw new ApiError(409, 'room_not_open', $room['status'] === 'scheduled' ? 'الغرفة لم تبدأ بعد.' : 'الغرفة مغلقة.');
        }
    }

    /** @param list<string> $roles */
    private static function requireRole(?string $role, array $roles): void
    {
        if ($role === null || !in_array($role, $roles, true)) {
            throw ApiError::forbidden($roles === ['owner'] ? 'هذا الإجراء لمالك الغرفة فقط.' : 'هذا الإجراء لمالك الغرفة ومشرفيها فقط.');
        }
    }

    /** @param array<string,mixed> $room @return array<string,mixed> the participant row (present), else 404 */
    private static function presentTarget(array $room, int $uid): array
    {
        $p = Rooms::participant((int) $room['id'], $uid);
        if ($p === null || (int) $p['present'] !== 1 || (int) $p['kicked'] === 1) {
            throw ApiError::notFound('هذا الشخص ليس في الغرفة الآن.');
        }
        return $p;
    }

    // ── Hub ──────────────────────────────────────────────────────────────────

    /** GET /rooms?tab=live|scheduled|groups|mine&q=&page=&per_page= */
    public static function index(Request $r): array
    {
        $ctx = Community::ctx($r);
        [$page, $per, $off] = V::page($r, 30);
        [$vis, $vp] = Community::roomVisibilitySql($ctx);
        $tab = $r->q('tab', 'live');
        $where = [$vis];
        $params = $vp;
        $order = 'r.id DESC';
        switch ($tab) {
            case 'live':
                $where[] = "r.status = 'open'";
                $order = '(r.listener_count + r.speaker_count) DESC, r.opened_at DESC';
                break;
            case 'scheduled':
                $where[] = "r.status = 'scheduled'";
                $order = 'r.scheduled_at, r.id';
                break;
            case 'groups': // «من جروباتي»: rooms of my groups, members-only ones included
                $where[] = "r.status IN ('open','scheduled') AND r.group_id IN (SELECT group_id FROM cgroup_members WHERE user_id = ?)";
                $params[] = (int) $ctx['id'];
                $order = "r.status = 'open' DESC, r.opened_at DESC, r.scheduled_at";
                break;
            case 'mine':
                $where[] = "r.status IN ('open','scheduled') AND r.owner_id = ?";
                $params[] = (int) $ctx['id'];
                break;
            default:
                throw ApiError::validation(['tab' => 'قيمة غير مسموحة.']);
        }
        $q = trim(mb_substr((string) $r->q('q', ''), 0, 60));
        if ($q !== '') {
            $where[] = 'r.title LIKE ?';
            $params[] = '%' . Db::likeEscape($q) . '%';
        }
        $w = implode(' AND ', $where);
        $total = (int) Db::value("SELECT COUNT(*) FROM rooms r WHERE {$w}", $params);
        $rows = Db::all("SELECT r.* FROM rooms r WHERE {$w} ORDER BY {$order} LIMIT ? OFFSET ?", array_merge($params, [$per, $off]));
        return V::paginated(Rooms::shapeMany($rows, $ctx), $page, $per, $total);
    }

    public static function show(Request $r): array
    {
        $ctx = Community::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        return Rooms::shape($room, $ctx, true) + ['limits' => ['max_listeners' => Rooms::limits()['max_listeners']]];
    }

    // ── Create / edit / start / close ────────────────────────────────────────

    /** POST /rooms {title, gender_scope, visibility?, group_id?, scheduled_at?} */
    public static function create(Request $r): Reply
    {
        $ctx = self::ctx($r);
        $me = (int) $ctx['id'];
        $b = $r->body();
        $title = (string) V::str($b, 'title', 120, true, 3);
        $scope = (string) V::enum($b, 'gender_scope', ['men', 'women', 'mixed']);
        $visibility = V::enum($b, 'visibility', ['public_by_type', 'group_members'], false) ?? 'public_by_type';
        $groupId = isset($b['group_id']) && $b['group_id'] !== null ? (int) V::int($b, 'group_id', 1, PHP_INT_MAX >> 1) : null;
        $scheduledAt = V::datetime($b, 'scheduled_at', false);
        if ($scheduledAt !== null) {
            $scheduledAt = substr($scheduledAt, 0, 19);
            if ($scheduledAt < Db::now(60) || $scheduledAt > Db::now(30 * 86400)) {
                throw ApiError::validation(['scheduled_at' => 'اختر موعداً بعد دقيقة على الأقل وخلال 30 يوماً.']);
            }
        }
        if ($scope !== 'mixed' && $scope !== $ctx['scope']) {
            throw ApiError::validation(['gender_scope' => 'يمكنك فتح غرفة لجنسك أو غرفة مختلطة فقط.']);
        }
        if ($groupId !== null) {
            $g = Groups::visible($ctx, $groupId);
            $m = Community::membership($groupId, $me);
            if (!Groups::has($m, $scheduledAt !== null ? 'schedule_rooms' : 'open_rooms')) {
                throw ApiError::forbidden($scheduledAt !== null ? 'ليست لديك صلاحية جدولة غرف لهذا الجروب.' : 'ليست لديك صلاحية فتح غرف لهذا الجروب.');
            }
            if ($scope !== 'mixed' && $scope !== $g['gender_scope']) {
                throw ApiError::validation(['gender_scope' => 'غرف هذا الجروب تكون من نوعه أو مختلطة.']);
            }
        } elseif ($visibility === 'group_members') {
            throw ApiError::validation(['visibility' => '«لأعضاء الجروب فقط» يحتاج جروباً.']);
        }
        if (Moderation::hasLink($title)) {
            throw new ApiError(422, 'links_not_allowed', 'لا يُسمح بالروابط في عنوان الغرفة.');
        }
        RateLimit::hit('room_create', ['user:' . $me]);
        Moderation::enforce($me, 'room_title', null, $title);
        $lim = Rooms::limits();
        $mine = (int) Db::value("SELECT COUNT(*) FROM rooms WHERE owner_id = ? AND status IN ('open','scheduled')", [$me]);
        if ($mine >= $lim['max_per_user']) {
            throw new ApiError(409, 'room_limit', 'وصلت إلى الحد الأقصى للغرف المفتوحة أو المجدولة (' . $lim['max_per_user'] . ').', ['limit' => $lim['max_per_user']]);
        }
        $openNow = $scheduledAt === null;
        if ($openNow) {
            self::requireCapacity();
        }
        $id = Db::insert(
            'INSERT INTO rooms (owner_id, group_id, title, gender_scope, visibility, status, scheduled_at, opened_at, no_speaker_since, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$me, $groupId, $title, $scope, $visibility, $openNow ? 'open' : 'scheduled', $scheduledAt,
                $openNow ? Db::now() : null, $openNow ? Db::now() : null, Db::now(), Db::now()]
        );
        // the owner can always come back, even when the room is locked
        Db::exec("INSERT INTO room_participants (room_id, user_id, role, present, joined_at) VALUES (?, ?, 'owner', 0, ?)", [$id, $me, Db::now()]);
        $room = Rooms::load($id);
        if ($openNow) {
            LiveKit::createRoom(LiveKit::roomName($id), $lim['max_listeners'] + 50);
        }
        Rooms::notifyAudience($room, !$openNow);
        return Reply::created(Rooms::shape($room, $ctx, true));
    }

    private static function requireCapacity(): void
    {
        if (!LiveKit::configured()) {
            throw new ApiError(503, 'rooms_unavailable', 'الغرف الصوتية غير متاحة حالياً.');
        }
        $lim = Rooms::limits();
        if ((int) Db::value("SELECT COUNT(*) FROM rooms WHERE status = 'open'") >= $lim['max_concurrent']) {
            throw new ApiError(503, 'rooms_busy', 'عدد الغرف المفتوحة الآن وصل للحد الأقصى. حاول بعد قليل أو جدول غرفتك.', ['limit' => $lim['max_concurrent']]);
        }
    }

    /** PATCH /rooms/{id} {title?, locked?, scheduled_at?} — owner only. */
    public static function update(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner']);
        $b = $r->body();
        $sets = [];
        $params = [];
        $changed = false;
        if (array_key_exists('title', $b)) {
            $title = (string) V::str($b, 'title', 120, true, 3);
            if (Moderation::hasLink($title)) {
                throw new ApiError(422, 'links_not_allowed', 'لا يُسمح بالروابط في عنوان الغرفة.');
            }
            Moderation::enforce((int) $ctx['id'], 'room_title', (int) $room['id'], $title);
            $sets[] = 'title = ?';
            $params[] = $title;
            $changed = $changed || $title !== $room['title'];
        }
        if (array_key_exists('locked', $b)) {
            $sets[] = 'locked = ?';
            $params[] = (int) V::bool($b, 'locked');
        }
        if (array_key_exists('scheduled_at', $b)) {
            if ($room['status'] !== 'scheduled') {
                throw new ApiError(409, 'room_not_scheduled', 'الغرفة ليست مجدولة.');
            }
            $at = substr((string) V::datetime($b, 'scheduled_at'), 0, 19);
            if ($at < Db::now(60) || $at > Db::now(30 * 86400)) {
                throw ApiError::validation(['scheduled_at' => 'اختر موعداً بعد دقيقة على الأقل وخلال 30 يوماً.']);
            }
            $sets[] = 'scheduled_at = ?, reminded_at = NULL';
            $params[] = $at;
            $changed = $changed || $at !== $room['scheduled_at'];
        }
        if ($sets !== []) {
            Db::exec('UPDATE rooms SET ' . implode(', ', $sets) . ', updated_at = ? WHERE id = ?', array_merge($params, [Db::now(), (int) $room['id']]));
        }
        $room = Rooms::load((int) $room['id']);
        if ($changed && $room['status'] === 'scheduled') {
            Rooms::notifyReminders($room, 'reminder_changed', 'تغيّر موعد أو عنوان غرفة', '«' . $room['title'] . '» — ' . substr((string) $room['scheduled_at'], 0, 16) . ' UTC');
        }
        Rooms::broadcast($room, 'room', ['type' => 'updated', 'title' => (string) $room['title'], 'locked' => (int) $room['locked'] === 1]);
        return Rooms::shape($room, $ctx, true);
    }

    /** POST /rooms/{id}/start — open a scheduled room now. */
    public static function start(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner']);
        if ($room['status'] !== 'scheduled') {
            throw new ApiError(409, 'room_not_scheduled', 'الغرفة ليست مجدولة.');
        }
        self::requireCapacity();
        Db::exec("UPDATE rooms SET status = 'open', opened_at = ?, no_speaker_since = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'", [Db::now(), Db::now(), Db::now(), (int) $room['id']]);
        $room = Rooms::load((int) $room['id']);
        LiveKit::createRoom(LiveKit::roomName((int) $room['id']), Rooms::limits()['max_listeners'] + 50);
        Rooms::notifyReminders($room, 'reminder_started', 'بدأت الغرفة الآن', '«' . $room['title'] . '» مفتوحة الآن.');
        Rooms::notifyAudience($room, false);
        return Rooms::shape($room, $ctx, true);
    }

    /** DELETE /rooms/{id} — the owner closes a live room or cancels a scheduled one. */
    public static function close(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner']);
        Rooms::close($room, 'owner');
        return Reply::empty();
    }

    // ── Joining ──────────────────────────────────────────────────────────────

    /** POST /rooms/{id}/join → {url, token, identity, role, room}: connect to LiveKit with the token. */
    public static function join(Request $r): array
    {
        $ctx = self::ctx($r);
        $me = (int) $ctx['id'];
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        if (!LiveKit::configured()) {
            throw new ApiError(503, 'rooms_unavailable', 'الغرف الصوتية غير متاحة حالياً.');
        }
        $p = Rooms::participant((int) $room['id'], $me);
        if ($p !== null && (int) $p['kicked'] === 1) {
            throw new ApiError(403, 'kicked', 'تم إخراجك من هذه الغرفة.');
        }
        $isOwner = (int) ($room['owner_id'] ?? 0) === $me;
        $role = $p !== null ? (string) $p['role'] : ($isOwner ? 'owner' : 'listener');
        if ($p === null && (int) $room['locked'] === 1) {
            throw new ApiError(403, 'room_locked', 'الغرفة مقفلة: لا يمكن دخول أشخاص جدد الآن.');
        }
        $wasPresent = $p !== null && (int) $p['present'] === 1;
        if ($role === 'listener' && !$wasPresent) {
            $lim = Rooms::limits()['max_listeners'];
            $n = (int) Db::value("SELECT COUNT(*) FROM room_participants WHERE room_id = ? AND present = 1 AND role = 'listener'", [(int) $room['id']]);
            if ($n >= $lim) {
                throw new ApiError(409, 'room_full', 'الغرفة ممتلئة (' . $lim . ' مستمع).', ['limit' => $lim]);
            }
        }
        Db::exec(
            'INSERT INTO room_participants (room_id, user_id, role, present, joined_at) VALUES (?, ?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE present = 1, joined_at = VALUES(joined_at), left_at = NULL',
            [(int) $room['id'], $me, $role, Db::now()]
        );
        Rooms::refreshCounts((int) $room['id']);
        if (!$wasPresent) {
            Rooms::system($room, 'join', 'انضم ' . $ctx['name'], ['user_id' => $me]);
        }
        $u = ['id' => $me, 'name' => $ctx['name'], 'avatar_url' => $ctx['avatar_url']];
        $token = LiveKit::participantToken($me, (string) $ctx['name'], LiveKit::roomName((int) $room['id']), $role,
            ['role' => $role, 'avatar' => $ctx['avatar_url'], 'user_id' => $me]);
        return [
            'url' => LiveKit::clientUrl(),
            'token' => $token,
            'identity' => (string) $me,
            'livekit_room' => LiveKit::roomName((int) $room['id']),
            'role' => $role,
            'expires_at' => gmdate('Y-m-d\TH:i:s\Z', time() + LiveKit::TOKEN_TTL),
            'room' => Rooms::shape(Rooms::load((int) $room['id']), $ctx, true),
            'me' => $u,
        ];
    }

    /** POST /rooms/{id}/leave {quiet?} — «مغادرة بهدوء» leaves no line in the chat. */
    public static function leave(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $room = Rooms::load($r->intParam('id'));
        $p = Rooms::participant((int) $room['id'], $me);
        if ($p !== null && (int) $p['present'] === 1) {
            Db::exec('UPDATE room_participants SET present = 0, left_at = ?, hand_raised_at = NULL WHERE room_id = ? AND user_id = ?', [Db::now(), (int) $room['id'], $me]);
            Rooms::refreshCounts((int) $room['id']);
            if (($r->body()['quiet'] ?? false) !== true && $room['status'] === 'open') {
                Rooms::system($room, 'leave', 'غادر ' . $ctx['name'], ['user_id' => $me]);
            }
            if ($room['status'] === 'open') {
                LiveKit::removeParticipant(LiveKit::roomName((int) $room['id']), $me);
            }
        }
        return Reply::empty();
    }

    /** GET /rooms/{id}/participants */
    public static function participants(Request $r): array
    {
        $ctx = Community::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        $rows = Db::all(
            'SELECT p.role, p.hand_raised_at, ' . Community::briefCols() . " FROM room_participants p JOIN users u ON u.id = p.user_id
             WHERE p.room_id = ? AND p.present = 1 ORDER BY FIELD(p.role, 'owner', 'moderator', 'speaker', 'listener'), p.joined_at LIMIT 1000",
            [(int) $room['id']]
        );
        $stage = [];
        $listeners = [];
        foreach ($rows as $u) {
            $item = Community::brief($u) + ['role' => (string) $u['role'], 'hand_raised' => $u['hand_raised_at'] !== null];
            if ($u['role'] === 'listener') {
                $listeners[] = $item;
            } else {
                $stage[] = $item;
            }
        }
        return ['stage' => $stage, 'listeners' => $listeners, 'listener_count' => count($listeners)];
    }

    // ── Stage ────────────────────────────────────────────────────────────────

    private static function setHand(Request $r, bool $raised): \stdClass
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        $p = self::presentTarget($room, (int) $ctx['id']);
        if ($raised && $p['role'] !== 'listener') {
            throw new ApiError(409, 'conflict', 'أنت على المنصة بالفعل.');
        }
        Db::exec('UPDATE room_participants SET hand_raised_at = ? WHERE room_id = ? AND user_id = ?', [$raised ? Db::now() : null, (int) $room['id'], (int) $ctx['id']]);
        $mods = array_map('intval', array_column(Db::all("SELECT user_id FROM room_participants WHERE room_id = ? AND present = 1 AND role IN ('owner','moderator')", [(int) $room['id']]), 'user_id'));
        if ($mods !== []) {
            Rooms::broadcast($room, 'room', ['type' => 'hand', 'user' => ['id' => (int) $ctx['id'], 'name' => $ctx['name'], 'avatar_url' => $ctx['avatar_url']], 'raised' => $raised], $mods);
        }
        return Reply::empty();
    }

    public static function raiseHand(Request $r): \stdClass
    {
        return self::setHand($r, true);
    }

    public static function lowerHand(Request $r): \stdClass
    {
        return self::setHand($r, false);
    }

    /** POST /rooms/{id}/speakers/{uid} — owner/moderator brings someone on stage (notified «دعوة للتحدث»). */
    public static function addSpeaker(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner', 'moderator']);
        $uid = $r->intParam('uid');
        $p = self::presentTarget($room, $uid);
        if ($p['role'] !== 'listener') {
            return ['role' => (string) $p['role']];
        }
        Rooms::setRole($room, $uid, 'speaker');
        Push::notify($uid, 'speak_invite', (string) $room['title'], 'تمت دعوتك للتحدث على المنصة.', ['room_id' => (int) $room['id']], false, 'room-' . $room['id']);
        return ['role' => 'speaker'];
    }

    /** DELETE /rooms/{id}/speakers/{uid} — back to listener (moderators only by the owner; anyone may step down). */
    public static function removeSpeaker(Request $r): array
    {
        $ctx = self::ctx($r);
        $me = (int) $ctx['id'];
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        $uid = $r->intParam('uid');
        $p = self::presentTarget($room, $uid);
        if ($p['role'] === 'owner') {
            throw ApiError::forbidden('لا يمكن إنزال مالك الغرفة.');
        }
        if ($uid !== $me) {
            $mine = self::roleOf($room, $me);
            self::requireRole($mine, $p['role'] === 'moderator' ? ['owner'] : ['owner', 'moderator']);
        }
        if ($p['role'] !== 'listener') {
            Rooms::setRole($room, $uid, 'listener');
        }
        return ['role' => 'listener'];
    }

    /** POST /rooms/{id}/moderators/{uid} — owner only. */
    public static function addModerator(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner']);
        $uid = $r->intParam('uid');
        $p = self::presentTarget($room, $uid);
        if ($p['role'] === 'owner') {
            throw ApiError::badRequest('أنت مالك الغرفة.');
        }
        Rooms::setRole($room, $uid, 'moderator');
        return ['role' => 'moderator'];
    }

    /** DELETE /rooms/{id}/moderators/{uid} — owner only; the moderator stays on stage as a speaker. */
    public static function removeModerator(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner']);
        $uid = $r->intParam('uid');
        $p = self::presentTarget($room, $uid);
        if ($p['role'] === 'moderator') {
            Rooms::setRole($room, $uid, 'speaker');
        }
        return ['role' => $p['role'] === 'moderator' ? 'speaker' : (string) $p['role']];
    }

    /** Owner may act on anyone but themselves; a moderator only on speakers and listeners. */
    private static function requireAuthority(array $room, int $me, array $target): void
    {
        $mine = self::roleOf($room, $me);
        self::requireRole($mine, ['owner', 'moderator']);
        if ((int) $target['user_id'] === $me || $target['role'] === 'owner' || ($target['role'] === 'moderator' && $mine !== 'owner')) {
            throw ApiError::forbidden('لا يمكنك القيام بهذا الإجراء على هذا الشخص.');
        }
    }

    /** POST /rooms/{id}/participants/{uid}/mute */
    public static function mute(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        $p = self::presentTarget($room, $r->intParam('uid'));
        self::requireAuthority($room, (int) $ctx['id'], $p);
        $n = LiveKit::muteAudio(LiveKit::roomName((int) $room['id']), (int) $p['user_id']);
        Rooms::broadcast($room, 'room', ['type' => 'muted', 'user_id' => (int) $p['user_id'], 'by' => (int) $ctx['id']]);
        return ['muted_tracks' => $n];
    }

    /** POST /rooms/{id}/participants/{uid}/kick — out of the room for good (cannot rejoin this room). */
    public static function kick(Request $r): \stdClass
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        $uid = $r->intParam('uid');
        $p = Rooms::participant((int) $room['id'], $uid);
        if ($p === null || (int) $p['kicked'] === 1) {
            throw ApiError::notFound('هذا الشخص ليس في الغرفة.');
        }
        self::requireAuthority($room, (int) $ctx['id'], $p);
        Db::exec("UPDATE room_participants SET kicked = 1, present = 0, role = 'listener', hand_raised_at = NULL, left_at = ? WHERE room_id = ? AND user_id = ?", [Db::now(), (int) $room['id'], $uid]);
        Rooms::refreshCounts((int) $room['id']);
        LiveKit::removeParticipant(LiveKit::roomName((int) $room['id']), $uid);
        Rooms::broadcast($room, 'room', ['type' => 'kicked', 'user_id' => $uid]);
        return Reply::empty();
    }

    /** PUT /rooms/{id}/page {surah, ayah, page?} — the shared mushaf position, set by the owner/moderators. */
    public static function setPage(Request $r): array
    {
        $ctx = self::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        self::requireRole(self::roleOf($room, (int) $ctx['id']), ['owner', 'moderator']);
        $b = $r->body();
        [$surah, $ayah] = Quran::fromBody($b);
        $page = isset($b['page']) && $b['page'] !== null ? V::int($b, 'page', 1, 604) : null;
        Db::exec('UPDATE rooms SET shared_surah = ?, shared_ayah = ?, shared_page = ?, shared_by = ?, shared_at = ?, updated_at = ? WHERE id = ?',
            [$surah, $ayah, $page, (int) $ctx['id'], Db::now(), Db::now(), (int) $room['id']]);
        $shared = ['surah' => $surah, 'ayah' => $ayah, 'page' => $page, 'updated_at' => Db::iso(Db::now())];
        Rooms::broadcast($room, 'page', ['type' => 'page', 'by' => (int) $ctx['id']] + $shared);
        return $shared;
    }

    // ── Chat & reactions ─────────────────────────────────────────────────────

    /** GET /rooms/{id}/chat?after_id= — recent lines (late joiners, or polling without the data channel). */
    public static function chat(Request $r): array
    {
        $ctx = Community::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        $p = Rooms::participant((int) $room['id'], (int) $ctx['id']);
        if ($p !== null && (int) $p['kicked'] === 1) {
            throw new ApiError(403, 'kicked', 'تم إخراجك من هذه الغرفة.');
        }
        $after = max(0, (int) ($r->q('after_id') ?? '0'));
        $rows = Db::all(
            'SELECT m.id, m.kind, m.event, m.body, m.created_at, m.user_id, u.name, u.avatar_url' . (\NQ\Core\Migrations::ready() ? ', u.avatar_file' : '') . '
             FROM room_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.room_id = ? AND m.id > ? ORDER BY m.id DESC LIMIT 100',
            [(int) $room['id'], $after]
        );
        return ['items' => array_map(static fn (array $m): array => [
            'id' => (int) $m['id'],
            'kind' => (string) $m['kind'],
            'event' => $m['event'],
            'body' => (string) $m['body'],
            'user' => $m['user_id'] !== null ? Community::brief(['id' => $m['user_id']] + $m) : null,
            'created_at' => Db::iso($m['created_at']),
        ], array_reverse($rows))];
    }

    /** POST /rooms/{id}/chat {body} — text only; the dictionary runs before anything is delivered. */
    public static function postChat(Request $r): Reply
    {
        $ctx = self::ctx($r);
        $me = (int) $ctx['id'];
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        $p = self::presentTarget($room, $me);
        $body = (string) V::str($r->body(), 'body', self::CHAT_MAX, true, 1, true);
        if (Moderation::hasLink($body)) {
            throw new ApiError(422, 'links_not_allowed', 'الدردشة نصية فقط: لا يُسمح بالروابط.');
        }
        RateLimit::hit('room_chat', ['user:' . $me]);
        Moderation::enforce($me, 'room_chat', (int) $room['id'], $body, static function () use ($room, $me): void {
            // severe word: removed from the room at once
            Db::exec("UPDATE room_participants SET present = 0, role = IF(role = 'owner', 'owner', 'listener'), hand_raised_at = NULL, left_at = ? WHERE room_id = ? AND user_id = ?", [Db::now(), (int) $room['id'], $me]);
            Rooms::refreshCounts((int) $room['id']);
            LiveKit::removeParticipant(LiveKit::roomName((int) $room['id']), $me);
        });
        $id = Db::insert("INSERT INTO room_messages (room_id, user_id, kind, body, created_at) VALUES (?, ?, 'chat', ?, ?)", [(int) $room['id'], $me, $body, Db::now()]);
        $msg = [
            'id' => $id, 'kind' => 'chat', 'event' => null, 'body' => $body,
            'user' => ['id' => $me, 'name' => $ctx['name'], 'avatar_url' => $ctx['avatar_url'], 'role' => (string) $p['role']],
            'created_at' => Db::iso(Db::now()),
        ];
        Rooms::broadcast($room, 'chat', ['type' => 'chat'] + $msg);
        return Reply::created($msg);
    }

    /**
     * POST /rooms/{id}/reactions {type, to_user_id?} — one reaction every 2 s per person; a directed clap
     * («فلان سقّف لفلان», to someone on stage) at most once a minute from the same sender to the same speaker.
     */
    public static function react(Request $r): array
    {
        $ctx = self::ctx($r);
        $me = (int) $ctx['id'];
        $room = Rooms::visible($ctx, $r->intParam('id'));
        self::requireOpen($room);
        self::presentTarget($room, $me);
        $b = $r->body();
        $type = (string) V::enum($b, 'type', Rooms::REACTIONS);
        $to = isset($b['to_user_id']) && $b['to_user_id'] !== null ? (int) V::int($b, 'to_user_id', 1, PHP_INT_MAX >> 1) : null;
        $target = null;
        if ($to !== null) {
            if ($type !== 'clap' || $to === $me) {
                throw ApiError::validation(['to_user_id' => 'التصفيق الموجّه يكون لشخص آخر على المنصة.']);
            }
            $tp = self::presentTarget($room, $to);
            if (!in_array($tp['role'], LiveKit::STAGE_ROLES, true)) {
                throw ApiError::validation(['to_user_id' => 'التصفيق الموجّه يكون لمن هو على المنصة.']);
            }
            $target = Db::one('SELECT ' . Community::briefCols() . ' FROM users u WHERE u.id = ?', [$to]);
        }
        $now = self::nowMs();
        if (Db::exec(
            'UPDATE room_participants SET last_reaction_at = ? WHERE room_id = ? AND user_id = ? AND (last_reaction_at IS NULL OR last_reaction_at <= ?)',
            [$now, (int) $room['id'], $me, self::nowMs(-2000)]
        ) === 0) {
            throw ApiError::rateLimited(2);
        }
        if ($to !== null) {
            $cut = self::nowMs(-60000);
            $n = Db::exec(
                'INSERT INTO clap_tallies (from_id, to_id, claps, last_at) VALUES (?, ?, 1, ?)
                 ON DUPLICATE KEY UPDATE claps = IF(last_at <= ?, claps + 1, claps), last_at = IF(last_at <= ?, VALUES(last_at), last_at)',
                [$me, $to, $now, $cut, $cut]
            );
            if ($n === 0) {
                $last = (string) Db::value('SELECT last_at FROM clap_tallies WHERE from_id = ? AND to_id = ?', [$me, $to]);
                throw ApiError::rateLimited(max(1, 60 - (time() - (int) strtotime($last . ' UTC'))));
            }
            Db::exec('UPDATE community_profiles SET claps_received = claps_received + 1 WHERE user_id = ?', [$to]);
        }
        if ($type === 'clap') {
            Db::exec('UPDATE community_profiles SET claps_sent = claps_sent + 1 WHERE user_id = ?', [$me]);
        }
        $event = ['type' => $type, 'from' => ['id' => $me, 'name' => $ctx['name']], 'to' => $target !== null ? Community::brief($target) : null];
        Rooms::broadcast($room, 'reaction', $event);
        return $event;
    }

    // ── Reminders ────────────────────────────────────────────────────────────

    public static function remind(Request $r): \stdClass
    {
        $ctx = Community::ctx($r);
        $room = Rooms::visible($ctx, $r->intParam('id'));
        if ($room['status'] !== 'scheduled') {
            throw new ApiError(409, 'room_not_scheduled', 'الغرفة ليست مجدولة.');
        }
        Db::exec('INSERT IGNORE INTO room_reminders (room_id, user_id, created_at) VALUES (?, ?, ?)', [(int) $room['id'], (int) $ctx['id'], Db::now()]);
        return Reply::empty();
    }

    public static function unremind(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        Db::exec('DELETE FROM room_reminders WHERE room_id = ? AND user_id = ?', [$r->intParam('id'), (int) $ctx['id']]);
        return Reply::empty();
    }

    // ── LiveKit webhook ──────────────────────────────────────────────────────

    /**
     * POST /livekit/webhook (configured in livekit.yaml). Verified with the API secret (JWT + body sha256).
     * Keeps presence and counts true when clients drop without calling /leave; the auto-close runs from those counts.
     */
    public static function webhook(Request $r): array
    {
        $raw = $r->raw();
        if (!LiveKit::verifyWebhook($r->header('authorization'), $raw)) {
            throw new ApiError(401, 'invalid_signature', 'توقيع غير صالح.');
        }
        $e = json_decode($raw, true);
        if (!is_array($e)) {
            throw ApiError::badRequest();
        }
        $event = (string) ($e['event'] ?? '');
        $name = (string) ($e['room']['name'] ?? '');
        if (!preg_match('/^nq-room-(\d{1,9})$/', $name, $m)) {
            return ['handled' => false];
        }
        $room = Db::one('SELECT * FROM rooms WHERE id = ?', [(int) $m[1]]);
        if ($room === null) {
            return ['handled' => false];
        }
        $rid = (int) $room['id'];
        $identity = (string) ($e['participant']['identity'] ?? '');
        $uid = preg_match('/^\d{1,10}$/', $identity) ? (int) $identity : 0;
        $at = (int) ($e['createdAt'] ?? $e['created_at'] ?? 0);
        switch ($event) {
            case 'participant_joined':
                if ($uid === 0) {
                    break;
                }
                $p = Rooms::participant($rid, $uid);
                if ($room['status'] !== 'open' || $p === null || (int) $p['kicked'] === 1) {
                    LiveKit::removeParticipant($name, $uid); // a token outliving a kick or a closed room
                    break;
                }
                if ((int) $p['present'] === 0) {
                    Db::exec('UPDATE room_participants SET present = 1, joined_at = ?, left_at = NULL WHERE room_id = ? AND user_id = ?', [Db::now(), $rid, $uid]);
                    Rooms::refreshCounts($rid);
                }
                break;
            case 'participant_left':
                if ($uid === 0) {
                    break;
                }
                $p = Rooms::participant($rid, $uid);
                // ignore a late "left" for a session that was replaced by a newer join
                if ($p !== null && (int) $p['present'] === 1 && ($at === 0 || $at >= (int) strtotime($p['joined_at'] . ' UTC') - 1)) {
                    Db::exec('UPDATE room_participants SET present = 0, left_at = ?, hand_raised_at = NULL WHERE room_id = ? AND user_id = ?', [Db::now(), $rid, $uid]);
                    Rooms::refreshCounts($rid);
                }
                break;
            case 'room_finished':
                if ($room['status'] === 'open') {
                    Db::exec('UPDATE room_participants SET present = 0, hand_raised_at = NULL WHERE room_id = ?', [$rid]);
                    Rooms::refreshCounts($rid);
                }
                break;
        }
        return ['handled' => true];
    }
}
