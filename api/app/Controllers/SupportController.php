<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Db;
use NQ\Core\Mailer;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\V;

final class SupportController
{
    public const SUPPORT_NAME = 'فريق الدعم';

    /**
     * SQL selecting tickets with unread/message counts.
     * $unreadFromAdmin: count unread messages written by admins (user view) or by the user (admin view).
     */
    public static function ticketSql(bool $unreadFromAdmin): string
    {
        $flag = $unreadFromAdmin ? 1 : 0;
        return "SELECT t.*, u.email AS u_email, u.name AS u_name,
            (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.is_admin = {$flag} AND m.read_at IS NULL) AS unread,
            (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count
            FROM support_tickets t JOIN users u ON u.id = t.user_id";
    }

    /** @param array<string,mixed> $t */
    public static function ticketShape(array $t, bool $withUser = false): array
    {
        $out = [
            'id' => (int) $t['id'],
            'subject' => (string) $t['subject'],
            'topic' => (string) $t['topic'],
            'status' => (string) $t['status'],
            'created_at' => Db::iso($t['created_at']),
            'updated_at' => Db::iso($t['updated_at']),
            'unread' => (int) ($t['unread'] ?? 0),
            'message_count' => (int) ($t['message_count'] ?? 0),
        ];
        if ($withUser) {
            $out['user'] = ['id' => (int) $t['user_id'], 'email' => (string) $t['u_email'], 'name' => (string) $t['u_name']];
        }
        return $out;
    }

    /** @param array<string,mixed> $m */
    public static function messageShape(array $m): array
    {
        $isAdmin = (int) $m['is_admin'] === 1;
        return [
            'id' => (int) $m['id'],
            'ticket_id' => (int) $m['ticket_id'],
            'body' => (string) $m['body'],
            'is_admin' => $isAdmin,
            'sender_name' => $isAdmin ? self::SUPPORT_NAME : ((string) ($m['sender_name'] ?? '') ?: 'مستخدم'),
            'created_at' => Db::iso($m['created_at']),
        ];
    }

    /** Messages of a ticket after `after_id`; marks the other side's messages as read. */
    public static function listMessages(Request $r, int $ticketId, bool $viewerIsAdmin): array
    {
        $after = (int) ($r->q('after_id') ?? '0');
        $rows = Db::all(
            'SELECT m.*, u.name AS sender_name FROM support_messages m LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.ticket_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 500',
            [$ticketId, max(0, $after)]
        );
        Db::exec(
            'UPDATE support_messages SET read_at = ? WHERE ticket_id = ? AND is_admin = ? AND read_at IS NULL',
            [Db::now(), $ticketId, $viewerIsAdmin ? 0 : 1]
        );
        return array_map([self::class, 'messageShape'], $rows);
    }

    public static function addMessage(int $ticketId, int $senderId, bool $isAdmin, string $body): array
    {
        $id = Db::insert(
            'INSERT INTO support_messages (ticket_id, sender_id, is_admin, body, created_at) VALUES (?, ?, ?, ?, ?)',
            [$ticketId, $senderId, $isAdmin, $body, Db::now()]
        );
        return self::messageShape((array) Db::one(
            'SELECT m.*, u.name AS sender_name FROM support_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?',
            [$id]
        ));
    }

    /** Minimum seconds between two email notices for the same ticket. */
    public const NOTIFY_INTERVAL = 600;

    /**
     * Email the ticket owner that the team wrote to them (at most once per ticket per 10 minutes).
     * Never throws: a mail problem must not fail the admin's reply.
     */
    public static function notifyUser(int $ticketId, string $body, bool $newThread): void
    {
        try {
            $t = Db::one(
                'SELECT t.id, t.subject, u.email, u.name FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?',
                [$ticketId]
            );
            if ($t === null) {
                return;
            }
            try {
                // atomic claim, so two quick replies cannot both send
                $claimed = Db::exec(
                    'UPDATE support_tickets SET last_notified_at = ? WHERE id = ? AND (last_notified_at IS NULL OR last_notified_at <= ?)',
                    [Db::now(), $ticketId, Db::now(-self::NOTIFY_INTERVAL)]
                ) === 1;
            } catch (\PDOException $e) {
                // column not migrated yet: send without throttling rather than not at all
                error_log('[nq] ticket notify throttle unavailable: ' . $e->getMessage());
                $claimed = true;
            }
            if ($claimed) {
                Mailer::sendTeamMessage((string) $t['email'], (string) $t['name'], (string) $t['subject'], $body, $newThread);
            }
        } catch (\Throwable $e) {
            error_log('[nq] ticket notify failed: ' . $e->getMessage());
        }
    }

    private static function ownTicket(Request $r, int $uid): array
    {
        $t = Db::one('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?', [$r->intParam('id'), $uid]);
        if ($t === null) {
            throw ApiError::notFound('التذكرة غير موجودة.');
        }
        return $t;
    }

    public static function tickets(Request $r): array
    {
        $uid = $r->userId();
        $rows = Db::all(self::ticketSql(true) . ' WHERE t.user_id = ? ORDER BY t.updated_at DESC LIMIT 200', [$uid]);
        return array_map(static fn (array $t): array => self::ticketShape($t), $rows);
    }

    public static function create(Request $r): Reply
    {
        $uid = $r->userId();
        $b = $r->body();
        $subject = (string) V::str($b, 'subject', 150);
        $topic = V::str($b, 'topic', 50, false, 0) ?: 'general';
        $body = (string) V::str($b, 'body', 5000, true, 1, true);
        $open = (int) Db::value("SELECT COUNT(*) FROM support_tickets WHERE user_id = ? AND status <> 'closed'", [$uid]);
        if ($open >= 10) {
            throw ApiError::of(422, 'limit_reached', 'لديك عدد كبير من التذاكر المفتوحة. يرجى انتظار الرد عليها.');
        }
        $id = Db::tx(static function () use ($uid, $subject, $topic, $body): int {
            $id = Db::insert(
                "INSERT INTO support_tickets (user_id, subject, topic, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)",
                [$uid, $subject, $topic, Db::now(), Db::now()]
            );
            self::addMessage($id, $uid, false, $body);
            return $id;
        });
        return Reply::created(self::ticketShape((array) Db::one(self::ticketSql(true) . ' WHERE t.id = ?', [$id])));
    }

    public static function messages(Request $r): array
    {
        $uid = $r->userId();
        $t = self::ownTicket($r, $uid);
        return self::listMessages($r, (int) $t['id'], false);
    }

    public static function post(Request $r): array
    {
        $uid = $r->userId();
        $t = self::ownTicket($r, $uid);
        if ($t['status'] === 'closed') {
            throw ApiError::of(409, 'ticket_closed');
        }
        $body = (string) V::str($r->body(), 'body', 5000, true, 1, true);
        $msg = self::addMessage((int) $t['id'], $uid, false, $body);
        Db::exec("UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?", [Db::now(), (int) $t['id']]);
        return $msg;
    }
}
