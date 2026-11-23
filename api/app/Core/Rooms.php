<?php
declare(strict_types=1);

namespace NQ\Core;

/** Voice rooms: limits, loading, presence counts, closing, broadcasting, notifications, housekeeping. */
final class Rooms
{
    public const REACTIONS = ['clap', 'heart', 'mashallah', 'barakallah', 'ameen', 'jazakallah'];
    public const ROLES = ['owner', 'moderator', 'speaker', 'listener'];

    /** @return array{max_listeners:int, max_concurrent:int, max_per_user:int, auto_close_minutes:int} */
    public static function limits(): array
    {
        $s = (array) Settings::get('rooms');
        return [
            'max_listeners' => (int) ($s['max_listeners'] ?? 500),
            'max_concurrent' => (int) ($s['max_concurrent'] ?? 20),
            'max_per_user' => (int) ($s['max_per_user'] ?? 3),
            'auto_close_minutes' => (int) ($s['auto_close_minutes'] ?? 10),
        ];
    }

    /** @return array<string,mixed> */
    public static function load(int $id, bool $forUpdate = false): array
    {
        $room = Db::one('SELECT * FROM rooms WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), [$id]);
        if ($room === null) {
            throw ApiError::notFound('الغرفة غير موجودة.');
        }
        return $room;
    }

    /** A room this viewer may know exists, else 404 (never 403: no trace of other-gender / members-only rooms). @param array<string,mixed> $ctx @return array<string,mixed> */
    public static function visible(array $ctx, int $id): array
    {
        $room = self::load($id);
        if (!Community::canSeeRoom($ctx, $room)) {
            throw ApiError::notFound('الغرفة غير موجودة.');
        }
        return $room;
    }

    /** @return array<string,mixed>|null */
    public static function participant(int $roomId, int $uid): ?array
    {
        return Db::one('SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?', [$roomId, $uid]);
    }

    /** Recompute presence counts; keeps no_speaker_since for the auto-close. */
    public static function refreshCounts(int $roomId): void
    {
        $c = Db::one(
            "SELECT COALESCE(SUM(role IN ('owner','moderator','speaker')), 0) AS stage, COALESCE(SUM(role = 'listener'), 0) AS listeners
             FROM room_participants WHERE room_id = ? AND present = 1",
            [$roomId]
        ) ?? ['stage' => 0, 'listeners' => 0];
        $stage = (int) $c['stage'];
        $listeners = (int) $c['listeners'];
        Db::exec(
            "UPDATE rooms SET speaker_count = ?, listener_count = ?, peak_count = GREATEST(peak_count, ?),
                no_speaker_since = CASE WHEN ? > 0 THEN NULL ELSE COALESCE(no_speaker_since, ?) END, updated_at = ?
             WHERE id = ? AND status = 'open'",
            [$stage, $listeners, $stage + $listeners, $stage, Db::now(), Db::now(), $roomId]
        );
    }

    /** @param array<string,mixed> $room @param array<string,mixed> $event @param list<int> $to */
    public static function broadcast(array $room, string $topic, array $event, array $to = []): void
    {
        if ($room['status'] !== 'open' || !LiveKit::configured()) {
            return;
        }
        LiveKit::sendData(LiveKit::roomName((int) $room['id']), $topic, $event + ['room_id' => (int) $room['id']], $to);
    }

    /**
     * A system line in the room chat (stored, so late joiners and polling clients see it, and broadcast).
     * @param array<string,mixed> $room @param array<string,mixed> $extra
     */
    public static function system(array $room, string $event, string $text, array $extra = []): void
    {
        $id = Db::insert(
            "INSERT INTO room_messages (room_id, user_id, kind, event, body, created_at) VALUES (?, NULL, 'system', ?, ?, ?)",
            [(int) $room['id'], $event, mb_substr($text, 0, 500), Db::now()]
        );
        self::broadcast($room, 'chat', ['type' => 'system', 'id' => $id, 'event' => $event, 'body' => $text, 'created_at' => Db::iso(Db::now())] + $extra);
    }

    /** Participant metadata sent to LiveKit. @param array<string,mixed> $u @return array<string,mixed> */
    public static function meta(array $u, string $role): array
    {
        return ['role' => $role, 'avatar' => Auth::avatarUrl($u), 'user_id' => (int) $u['id']];
    }

    /** Apply a role change in the database and on the live connection. */
    public static function setRole(array $room, int $uid, string $role): void
    {
        Db::exec('UPDATE room_participants SET role = ?, hand_raised_at = NULL WHERE room_id = ? AND user_id = ?', [$role, (int) $room['id'], $uid]);
        self::refreshCounts((int) $room['id']);
        $u = Db::one('SELECT ' . Community::briefCols() . ' FROM users u WHERE u.id = ?', [$uid]);
        if ($u !== null && LiveKit::configured()) {
            LiveKit::updateParticipant(LiveKit::roomName((int) $room['id']), $uid, $role, self::meta($u, $role));
            self::broadcast($room, 'room', ['type' => 'role', 'user' => Community::brief($u), 'role' => $role]);
        }
    }

    /**
     * Close a live room or cancel a scheduled one. Chat is deleted from the database except reported messages
     * (kept until an admin decides); presence, hands and reminders go too. LiveKit disconnects everyone.
     * @param array<string,mixed> $room
     */
    public static function close(array $room, string $reason): void
    {
        if (!in_array($room['status'], ['open', 'scheduled'], true)) {
            return;
        }
        $scheduled = $room['status'] === 'scheduled';
        $n = Db::exec(
            "UPDATE rooms SET status = ?, closed_at = ?, close_reason = ?, listener_count = 0, speaker_count = 0, no_speaker_since = NULL, updated_at = ?
             WHERE id = ? AND status IN ('open','scheduled')",
            [$scheduled ? 'cancelled' : 'closed', Db::now(), mb_substr($reason, 0, 32), Db::now(), (int) $room['id']]
        );
        if ($n === 0) {
            return;
        }
        if ($scheduled) {
            self::notifyReminders($room, 'reminder_cancelled', 'أُلغيت غرفة مجدولة', '«' . $room['title'] . '» لن تُعقد في موعدها.');
        }
        Db::exec('DELETE FROM room_messages WHERE room_id = ? AND reported = 0', [(int) $room['id']]);
        Db::exec('DELETE FROM room_participants WHERE room_id = ?', [(int) $room['id']]);
        Db::exec('DELETE FROM room_reminders WHERE room_id = ?', [(int) $room['id']]);
        if (!$scheduled && LiveKit::configured()) {
            $name = LiveKit::roomName((int) $room['id']);
            LiveKit::sendData($name, 'room', ['type' => 'closed', 'room_id' => (int) $room['id'], 'reason' => $reason]);
            LiveKit::deleteRoom($name);
        }
    }

    /**
     * Shape rooms for one viewer (one query each for stage, groups, reminders and the viewer's role).
     * @param list<array<string,mixed>> $rooms @param array<string,mixed> $ctx @return list<array<string,mixed>>
     */
    public static function shapeMany(array $rooms, array $ctx, bool $detail = false): array
    {
        if ($rooms === []) {
            return [];
        }
        $ids = array_map(static fn (array $r): int => (int) $r['id'], $rooms);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stage = [];
        $stageLimit = $detail ? 1000 : 6;
        foreach (Db::all(
            'SELECT p.room_id, p.role, ' . Community::briefCols() . " FROM room_participants p JOIN users u ON u.id = p.user_id
             WHERE p.room_id IN ({$in}) AND p.present = 1 AND p.role IN ('owner','moderator','speaker')
             ORDER BY FIELD(p.role, 'owner', 'moderator', 'speaker'), p.joined_at",
            $ids
        ) as $p) {
            if (count($stage[(int) $p['room_id']] ?? []) < $stageLimit) {
                $stage[(int) $p['room_id']][] = Community::brief($p) + ['role' => (string) $p['role']];
            }
        }
        $owners = [];
        $ownerIds = array_values(array_unique(array_filter(array_map(static fn (array $r): int => (int) ($r['owner_id'] ?? 0), $rooms))));
        if ($ownerIds !== []) {
            foreach (Db::all('SELECT ' . Community::briefCols() . ' FROM users u WHERE u.id IN (' . implode(',', array_fill(0, count($ownerIds), '?')) . ')', $ownerIds) as $u) {
                $owners[(int) $u['id']] = Community::brief($u);
            }
        }
        $groups = [];
        $gids = array_values(array_unique(array_filter(array_map(static fn (array $r): int => (int) ($r['group_id'] ?? 0), $rooms))));
        if ($gids !== []) {
            foreach (Db::all('SELECT id, name, photo_file, gender_scope, privacy FROM cgroups WHERE id IN (' . implode(',', array_fill(0, count($gids), '?')) . ')', $gids) as $g) {
                if (Community::canSeeGroup($ctx, $g)) { // a mixed room of a men's group shows no group to women
                    $groups[(int) $g['id']] = ['id' => (int) $g['id'], 'name' => (string) $g['name'], 'photo_url' => Community::photoUrl($g['photo_file'])];
                }
            }
        }
        $mine = [];
        foreach (Db::all("SELECT room_id, role, hand_raised_at, present FROM room_participants WHERE user_id = ? AND room_id IN ({$in})", array_merge([(int) $ctx['id']], $ids)) as $p) {
            $mine[(int) $p['room_id']] = $p;
        }
        $reminded = array_flip(array_map('intval', array_column(
            Db::all("SELECT room_id FROM room_reminders WHERE user_id = ? AND room_id IN ({$in})", array_merge([(int) $ctx['id']], $ids)),
            'room_id'
        )));
        $out = [];
        foreach ($rooms as $r) {
            $id = (int) $r['id'];
            $isOwner = (int) ($r['owner_id'] ?? 0) === (int) $ctx['id'];
            $myRole = isset($mine[$id]) ? (string) $mine[$id]['role'] : ($isOwner ? 'owner' : null);
            $item = [
                'id' => $id,
                'title' => (string) $r['title'],
                'gender_scope' => (string) $r['gender_scope'],
                'visibility' => (string) $r['visibility'],
                'status' => (string) $r['status'],
                'scheduled_at' => Db::iso($r['scheduled_at']),
                'opened_at' => Db::iso($r['opened_at']),
                'locked' => (int) $r['locked'] === 1,
                'owner' => $owners[(int) ($r['owner_id'] ?? 0)] ?? null,
                'group' => $groups[(int) ($r['group_id'] ?? 0)] ?? null,
                'listener_count' => (int) $r['listener_count'],
                'speaker_count' => (int) $r['speaker_count'],
                'stage' => $stage[$id] ?? [],
                'shared' => $r['shared_surah'] !== null ? [
                    'surah' => (int) $r['shared_surah'], 'ayah' => (int) $r['shared_ayah'],
                    'page' => $r['shared_page'] !== null ? (int) $r['shared_page'] : null, 'updated_at' => Db::iso($r['shared_at']),
                ] : null,
                'reminded' => isset($reminded[$id]),
                'my_role' => $myRole,
                'hand_raised' => isset($mine[$id]) && $mine[$id]['hand_raised_at'] !== null,
            ];
            if ($detail) {
                $item['in_room'] = isset($mine[$id]) && (int) $mine[$id]['present'] === 1;
                if (in_array($myRole, ['owner', 'moderator'], true)) {
                    $item['hands'] = array_map(static fn (array $u): array => Community::brief($u) + ['raised_at' => Db::iso($u['hand_raised_at'])], Db::all(
                        'SELECT p.hand_raised_at, ' . Community::briefCols() . ' FROM room_participants p JOIN users u ON u.id = p.user_id
                         WHERE p.room_id = ? AND p.present = 1 AND p.hand_raised_at IS NOT NULL ORDER BY p.hand_raised_at LIMIT 200',
                        [$id]
                    ));
                }
            }
            $out[] = $item;
        }
        return $out;
    }

    /** @param array<string,mixed> $room @param array<string,mixed> $ctx @return array<string,mixed> */
    public static function shape(array $room, array $ctx, bool $detail = true): array
    {
        return self::shapeMany([$room], $ctx, $detail)[0];
    }

    /**
     * Tell followers/friends of the owner, and members/followers of the group, that a room opened or was scheduled.
     * Every recipient is filtered with the same rules as the room lists (gender, members-only, blocks, age).
     * @param array<string,mixed> $room
     */
    public static function notifyAudience(array $room, bool $scheduled): void
    {
        $owner = (int) $room['owner_id'];
        $gid = $room['group_id'] !== null ? (int) $room['group_id'] : 0;
        $rows = Db::all(
            "SELECT u.id, u.name, u.gender, u.birthdate, u.is_admin,
                EXISTS(SELECT 1 FROM cgroup_members m WHERE m.group_id = ? AND m.user_id = u.id) AS is_member,
                EXISTS(SELECT 1 FROM cgroup_follows f WHERE f.group_id = ? AND f.user_id = u.id) AS follows_group
             FROM users u JOIN community_profiles cp ON cp.user_id = u.id
             WHERE u.id IN (SELECT follower_id FROM follows WHERE followee_id = ?
                            UNION SELECT friend_id FROM friendships WHERE user_id = ?
                            UNION SELECT user_id FROM cgroup_members WHERE group_id = ?
                            UNION SELECT user_id FROM cgroup_follows WHERE group_id = ?)
               AND u.id <> ?
               AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))
               AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.user_id = u.id AND cb.scope = 'community' AND (cb.until IS NULL OR cb.until > ?))",
            [$gid, $gid, $owner, $owner, $gid, $gid, $owner, $owner, $owner, Db::now()]
        );
        $ownerName = (string) (Db::value('SELECT name FROM users WHERE id = ?', [$owner]) ?? '');
        $groupName = $gid > 0 ? (string) (Db::value('SELECT name FROM cgroups WHERE id = ?', [$gid]) ?? '') : '';
        $viaGroup = [];
        $viaPerson = [];
        foreach ($rows as $u) {
            $ctx = Community::ctxOf($u);
            if ($ctx === null) {
                continue;
            }
            if ($room['gender_scope'] !== 'mixed' && $room['gender_scope'] !== $ctx['scope']) {
                continue;
            }
            if ($room['visibility'] === 'group_members' && (int) $u['is_member'] !== 1) {
                continue;
            }
            if ($gid > 0 && ((int) $u['is_member'] === 1 || (int) $u['follows_group'] === 1)) {
                $viaGroup[] = (int) $u['id'];
            } else {
                $viaPerson[] = (int) $u['id'];
            }
        }
        $when = $scheduled && $room['scheduled_at'] ? ' — ' . substr((string) $room['scheduled_at'], 0, 16) . ' UTC' : '';
        $data = ['room_id' => (int) $room['id'], 'scheduled_at' => Db::iso($room['scheduled_at'])];
        if ($viaGroup !== []) {
            Push::notifyMany($viaGroup, 'group_room', $groupName, ($scheduled ? 'غرفة مجدولة: ' : 'غرفة مفتوحة الآن: ') . $room['title'] . $when, $data + ['group_id' => $gid]);
        }
        if ($viaPerson !== []) {
            Push::notifyMany($viaPerson, $scheduled ? 'room_scheduled' : 'room_opened', $ownerName,
                ($scheduled ? 'جدول غرفة: ' : 'فتح غرفة الآن: ') . $room['title'] . $when, $data);
        }
    }

    /** Notify everyone who asked «ذكّرني» (re-checked against the visibility rules). @param array<string,mixed> $room */
    public static function notifyReminders(array $room, string $type, string $title, string $body): void
    {
        $ids = [];
        foreach (Db::all(
            'SELECT u.id, u.name, u.gender, u.birthdate, u.is_admin FROM room_reminders rr JOIN users u ON u.id = rr.user_id WHERE rr.room_id = ?',
            [(int) $room['id']]
        ) as $u) {
            $ctx = Community::ctxOf($u);
            if ($ctx !== null && ($room['gender_scope'] === 'mixed' || $room['gender_scope'] === $ctx['scope'])) {
                $ids[] = (int) $u['id'];
            }
        }
        Push::notifyMany($ids, $type, $title, $body, ['room_id' => (int) $room['id'], 'scheduled_at' => Db::iso($room['scheduled_at'])], true, 'room-' . $room['id']);
    }

    /** Housekeeping (after responses at most every 30 s, and by tools/push-worker.php). */
    public static function tick(): void
    {
        $lim = self::limits();
        foreach (Db::all(
            "SELECT * FROM rooms WHERE status = 'open' AND no_speaker_since IS NOT NULL AND no_speaker_since < ? LIMIT 100",
            [Db::now(-60 * max(1, $lim['auto_close_minutes']))]
        ) as $room) {
            self::close($room, 'no_speakers');
        }
        foreach (Db::all("SELECT * FROM rooms WHERE status = 'scheduled' AND reminded_at IS NULL AND scheduled_at <= ? LIMIT 100", [Db::now(600)]) as $room) {
            if (Db::exec('UPDATE rooms SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL', [Db::now(), (int) $room['id']]) === 1) {
                self::notifyReminders($room, 'reminder_soon', 'تبدأ بعد قليل', '«' . $room['title'] . '» تبدأ خلال 10 دقائق.');
            }
        }
        foreach (Db::all("SELECT * FROM rooms WHERE status = 'scheduled' AND scheduled_at < ? LIMIT 100", [Db::now(-3600)]) as $room) {
            self::close($room, 'not_started');
        }
        Db::exec('DELETE FROM community_bans WHERE until IS NOT NULL AND until < ?', [Db::now()]);
        Db::exec("DELETE FROM push_queue WHERE status IN ('sent','failed') AND created_at < ? LIMIT 2000", [Db::now(-2 * 86400)]);
        Db::exec('DELETE FROM notifications WHERE created_at < ? LIMIT 2000', [Db::now(-90 * 86400)]);
    }
}
