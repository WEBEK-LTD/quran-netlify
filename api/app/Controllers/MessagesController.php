<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Community;
use NQ\Core\Db;
use NQ\Core\Moderation;
use NQ\Core\Push;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\V;

/**
 * Direct messages (text only, stored). Who may write to whom, in this order:
 *   1. blocked (either way) → never;  2. a minor on either side → never;  3. friends → always;
 *   4. in a conversation the other person started → may reply;  5. else the recipient's «who can message me»:
 *      everyone | same_gender | friends.
 * Deleting a message or a whole conversation (either side) deletes it for both, from the database — except messages
 * reported before the deletion, which stay (hidden) for the admins.
 */
final class MessagesController
{
    private const MAX_BODY = 2000;

    private static function nowMs(): string
    {
        $t = microtime(true);
        return gmdate('Y-m-d H:i:s', (int) $t) . sprintf('.%03d', (int) (($t - floor($t)) * 1000));
    }

    /**
     * null = allowed; else why not: self | blocked | minor | not_member | policy.
     * @param array<string,mixed> $ctx @param array<string,mixed> $other users row @param array<string,mixed>|null $conv
     */
    public static function startRule(array $ctx, array $other, ?array $conv = null): ?string
    {
        $me = (int) $ctx['id'];
        $oid = (int) $other['id'];
        if ($oid === $me) {
            return 'self';
        }
        if (Community::blocked($me, $oid)) {
            return 'blocked';
        }
        if ($ctx['minor'] || Community::isMinor($other)) {
            return 'minor';
        }
        $p = Community::profileRow($oid);
        if ($p === null || Community::missing($other) !== []) {
            return 'not_member';
        }
        if (Community::friends($me, $oid)) {
            return null;
        }
        if ($conv !== null && (int) $conv['started_by'] === $oid) {
            return null; // they started this conversation: replying is allowed
        }
        $policy = (string) $p['dm_policy'];
        if ($policy === 'everyone' || ($policy === 'same_gender' && $other['gender'] === $ctx['gender'])) {
            return null;
        }
        return 'policy';
    }

    private static function ruleError(string $why): ApiError
    {
        return match ($why) {
            'minor' => new ApiError(403, 'minor_restricted', 'الرسائل الخاصة غير متاحة لمن هم دون 18 سنة.'),
            'blocked', 'not_member', 'self' => ApiError::notFound('المستخدم غير موجود.'),
            default => new ApiError(403, 'dm_not_allowed', 'هذا الشخص لا يستقبل رسائل منك.'),
        };
    }

    /** @return array<string,mixed> the conversation (404 unless the viewer is in it and nobody blocked anybody) */
    private static function conversation(int $me, int $id): array
    {
        $c = Db::one('SELECT * FROM conversations WHERE id = ? AND (user_low = ? OR user_high = ?)', [$id, $me, $me]);
        if ($c === null || Community::blocked((int) $c['user_low'], (int) $c['user_high'])) {
            throw ApiError::notFound('المحادثة غير موجودة.');
        }
        return $c;
    }

    private static function otherId(array $c, int $me): int
    {
        return (int) $c['user_low'] === $me ? (int) $c['user_high'] : (int) $c['user_low'];
    }

    /** @param array<string,mixed> $m */
    private static function msgShape(array $m, int $me): array
    {
        return [
            'id' => (int) $m['id'],
            'body' => (string) $m['body'],
            'from_me' => (int) $m['sender_id'] === $me,
            'sender_id' => $m['sender_id'] !== null ? (int) $m['sender_id'] : null,
            'created_at' => Db::iso($m['created_at']),
        ];
    }

    /** GET /me/conversations?since=ISO — ETag/304 when nothing changed (sends, deletions, reads). */
    public static function index(Request $r): Reply
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $since = $r->q('since');
        $sinceDt = null;
        if ($since !== null && $since !== '') {
            $sinceDt = V::datetime(['since' => $since], 'since');
        }
        $stat = Db::one(
            'SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS u, COALESCE(SUM(CASE WHEN user_low = ? THEN low_read_id ELSE high_read_id END), 0) AS rd
             FROM conversations WHERE user_low = ? OR user_high = ?',
            [$me, $me, $me]
        ) ?? ['n' => 0, 'u' => 0, 'rd' => 0];
        $etag = 'W/"c' . substr(hash('sha256', $stat['n'] . '|' . $stat['u'] . '|' . $stat['rd'] . '|' . (string) $sinceDt), 0, 20) . '"';
        if ($r->header('if-none-match') === $etag) {
            return new Reply(null, 304, ['ETag' => $etag]);
        }
        $params = [$me, $me, $me, $me, $me, $me, $me];
        $where = '';
        if ($sinceDt !== null) {
            $where = ' AND c.updated_at > ?';
            $params[] = $sinceDt;
        }
        $rows = Db::all(
            'SELECT c.*, ' . Community::briefCols() . ', m.id AS m_id, m.body AS m_body, m.sender_id AS m_sender, m.created_at AS m_created,
                (SELECT COUNT(*) FROM dm_messages x WHERE x.conversation_id = c.id AND x.deleted_at IS NULL AND x.sender_id <> ?
                   AND x.id > (CASE WHEN c.user_low = ? THEN c.low_read_id ELSE c.high_read_id END)) AS unread
             FROM conversations c
             JOIN users u ON u.id = (CASE WHEN c.user_low = ? THEN c.user_high ELSE c.user_low END)
             LEFT JOIN dm_messages m ON m.id = c.last_message_id
             WHERE (c.user_low = ? OR c.user_high = ?)
               AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))'
            . $where . ' ORDER BY c.updated_at DESC LIMIT 200',
            $params
        );
        $items = array_map(static fn (array $c): array => [
            'id' => (int) $c['id'],
            'other' => Community::brief($c),
            'started_by_me' => (int) $c['started_by'] === $me,
            'last_message' => $c['m_id'] !== null ? [
                'id' => (int) $c['m_id'], 'body' => mb_substr((string) $c['m_body'], 0, 200),
                'from_me' => (int) $c['m_sender'] === $me, 'created_at' => Db::iso($c['m_created']),
            ] : null,
            'unread' => (int) $c['unread'],
            'updated_at' => Db::iso($c['updated_at']),
        ], $rows);
        $data = ['items' => $items, 'server_time' => Db::iso(self::nowMs())];
        if ($sinceDt !== null) {
            // every conversation id that still exists, so incremental clients can drop deleted ones
            $data['ids'] = array_map('intval', array_column(Db::all('SELECT id FROM conversations WHERE user_low = ? OR user_high = ?', [$me, $me]), 'id'));
        }
        return new Reply($data, 200, ['ETag' => $etag]);
    }

    /** GET /me/conversations/{id}/messages?after_id=&before_id=&limit= (oldest first) */
    public static function messages(Request $r): array
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $c = self::conversation($me, $r->intParam('id'));
        $limit = max(1, min(100, (int) ($r->q('limit') ?? '50')));
        $after = (int) ($r->q('after_id') ?? '0');
        $before = (int) ($r->q('before_id') ?? '0');
        if ($after > 0) {
            $rows = Db::all('SELECT * FROM dm_messages WHERE conversation_id = ? AND deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?', [(int) $c['id'], $after, $limit]);
        } else {
            $rows = array_reverse(Db::all(
                'SELECT * FROM dm_messages WHERE conversation_id = ? AND deleted_at IS NULL' . ($before > 0 ? ' AND id < ?' : '') . ' ORDER BY id DESC LIMIT ?',
                $before > 0 ? [(int) $c['id'], $before, $limit] : [(int) $c['id'], $limit]
            ));
        }
        $other = (array) Auth::findUser(self::otherId($c, $me));
        $readCol = (int) $c['user_low'] === $me ? 'high_read_id' : 'low_read_id';
        return [
            'conversation' => ['id' => (int) $c['id'], 'other' => Community::brief($other), 'started_by_me' => (int) $c['started_by'] === $me,
                'other_read_id' => (int) $c[$readCol]],
            'items' => array_map(static fn (array $m): array => self::msgShape($m, $me), $rows),
            'can_send' => Community::suspension($me) === null && self::startRule($ctx, $other, $c) === null,
        ];
    }

    /** POST /me/conversations {user_id, body} — start (or continue) a conversation. */
    public static function start(Request $r): Reply
    {
        $ctx = Community::ctx($r);
        $b = $r->body();
        $oid = (int) V::int($b, 'user_id', 1, PHP_INT_MAX >> 1);
        $other = Auth::findUser($oid);
        if ($other === null) {
            throw ApiError::notFound('المستخدم غير موجود.');
        }
        $me = (int) $ctx['id'];
        $conv = Db::one('SELECT * FROM conversations WHERE user_low = ? AND user_high = ?', [min($me, $oid), max($me, $oid)]);
        return Reply::created(self::deliver($ctx, $other, $conv, $b));
    }

    /** POST /me/conversations/{id}/messages {body} */
    public static function send(Request $r): Reply
    {
        $ctx = Community::ctx($r);
        $c = self::conversation((int) $ctx['id'], $r->intParam('id'));
        $other = (array) Auth::findUser(self::otherId($c, (int) $ctx['id']));
        return Reply::created(self::deliver($ctx, $other, $c, $r->body()));
    }

    /**
     * @param array<string,mixed> $ctx @param array<string,mixed> $other @param array<string,mixed>|null $conv @param array<string,mixed> $b
     * @return array<string,mixed>
     */
    private static function deliver(array $ctx, array $other, ?array $conv, array $b): array
    {
        $me = (int) $ctx['id'];
        $oid = (int) $other['id'];
        $why = self::startRule($ctx, $other, $conv);
        if ($why !== null) {
            throw self::ruleError($why);
        }
        $body = (string) V::str($b, 'body', self::MAX_BODY, true, 1, true);
        if (Moderation::hasLink($body)) {
            throw new ApiError(422, 'links_not_allowed', 'الرسائل نصية فقط: لا يُسمح بالروابط.');
        }
        RateLimit::hit('dm', ['user:' . $me]);
        Moderation::enforce($me, 'dm', $conv !== null ? (int) $conv['id'] : null, $body);
        $now = self::nowMs();
        [$cid, $mid] = Db::tx(static function () use ($me, $oid, $conv, $body, $now): array {
            $low = min($me, $oid);
            $high = max($me, $oid);
            if ($conv === null) {
                Db::exec(
                    'INSERT IGNORE INTO conversations (user_low, user_high, started_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                    [$low, $high, $me, Db::now(), $now]
                );
                $conv = Db::one('SELECT * FROM conversations WHERE user_low = ? AND user_high = ? FOR UPDATE', [$low, $high]);
            }
            $cid = (int) $conv['id'];
            $mid = Db::insert(
                'INSERT INTO dm_messages (conversation_id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
                [$cid, $me, $oid, $body, Db::now()]
            );
            $readCol = $low === $me ? 'low_read_id' : 'high_read_id';
            Db::exec("UPDATE conversations SET last_message_id = ?, {$readCol} = ?, updated_at = ? WHERE id = ?", [$mid, $mid, $now, $cid]);
            return [$cid, $mid];
        });
        Push::notify($oid, 'dm', $ctx['name'], mb_substr($body, 0, 120), ['conversation_id' => $cid, 'user_id' => $me], false, 'dm-' . $cid);
        return ['conversation_id' => $cid, 'message' => self::msgShape((array) Db::one('SELECT * FROM dm_messages WHERE id = ?', [$mid]), $me)];
    }

    public static function markRead(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $c = self::conversation($me, $r->intParam('id'));
        $last = (int) ($r->body()['last_id'] ?? $c['last_message_id'] ?? 0);
        $col = (int) $c['user_low'] === $me ? 'low_read_id' : 'high_read_id';
        Db::exec("UPDATE conversations SET {$col} = GREATEST({$col}, ?) WHERE id = ?", [min($last, (int) ($c['last_message_id'] ?? 0)), (int) $c['id']]);
        return Reply::empty();
    }

    /** DELETE /me/conversations/{id}/messages/{mid} — gone for both (kept hidden for admins if it was reported). */
    public static function deleteMessage(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        $me = (int) $ctx['id'];
        $c = self::conversation($me, $r->intParam('id'));
        $mid = $r->intParam('mid');
        $m = Db::one('SELECT id, reported FROM dm_messages WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL', [$mid, (int) $c['id']]);
        if ($m === null) {
            throw ApiError::notFound('الرسالة غير موجودة.');
        }
        Db::tx(static function () use ($m, $c): void {
            if ((int) $m['reported'] === 1) {
                Db::exec('UPDATE dm_messages SET deleted_at = ? WHERE id = ?', [Db::now(), (int) $m['id']]);
            } else {
                Db::exec('DELETE FROM dm_messages WHERE id = ?', [(int) $m['id']]);
            }
            $last = Db::value('SELECT MAX(id) FROM dm_messages WHERE conversation_id = ? AND deleted_at IS NULL', [(int) $c['id']]);
            Db::exec('UPDATE conversations SET last_message_id = ?, updated_at = ? WHERE id = ?', [$last !== null ? (int) $last : null, self::nowMs(), (int) $c['id']]);
        });
        return Reply::empty();
    }

    /** DELETE /me/conversations/{id} — the whole conversation, for both. */
    public static function deleteConversation(Request $r): \stdClass
    {
        $ctx = Community::ctx($r, true);
        $c = self::conversation((int) $ctx['id'], $r->intParam('id'));
        Db::tx(static function () use ($c): void {
            Db::exec('DELETE FROM dm_messages WHERE conversation_id = ? AND reported = 0', [(int) $c['id']]);
            Db::exec('UPDATE dm_messages SET deleted_at = COALESCE(deleted_at, ?) WHERE conversation_id = ?', [Db::now(), (int) $c['id']]);
            Db::exec('DELETE FROM conversations WHERE id = ?', [(int) $c['id']]); // reported messages keep their text (conversation_id → NULL)
        });
        return Reply::empty();
    }
}
