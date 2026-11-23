<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Auth;
use NQ\Core\Db;
use NQ\Core\Mailer;
use NQ\Core\RateLimit;
use NQ\Core\Reply;
use NQ\Core\Request;
use NQ\Core\Settings;
use NQ\Core\V;

final class AuthController
{
    public static function signup(Request $r): Reply
    {
        RateLimit::hit('signup', ['ip:' . $r->ip]);
        if (Settings::get('allow_signup') !== true) {
            throw ApiError::of(403, 'signup_closed');
        }
        $b = $r->body();
        $name = (string) V::str($b, 'name', 100);
        $email = V::email($b);
        $password = V::password($b);
        if (Db::value('SELECT id FROM users WHERE email = ?', [$email]) !== null) {
            throw new ApiError(422, 'email_taken', null, ['fields' => ['email' => 'هذا البريد الإلكتروني مسجّل مسبقاً.']]);
        }
        try {
            $id = Db::insert(
                'INSERT INTO users (email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                [$email, $name, password_hash($password, PASSWORD_DEFAULT), Db::now(), Db::now()]
            );
        } catch (\PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) {
                throw new ApiError(422, 'email_taken', null, ['fields' => ['email' => 'هذا البريد الإلكتروني مسجّل مسبقاً.']]);
            }
            throw $e;
        }
        $token = Auth::startSession($r, $id);
        Mailer::sendVerification($email, $name, Auth::issueEmailToken($id, 'verify'));
        $user = Auth::findUser($id);
        return Reply::created(['user' => Auth::shape((array) $user), 'token' => $token]);
    }

    public static function login(Request $r): array
    {
        $b = $r->body();
        $emailRaw = is_string($b['email'] ?? null) ? mb_strtolower(trim($b['email'])) : '';
        RateLimit::hit('login', ['ip:' . $r->ip, 'login:' . hash('sha256', $emailRaw)]);
        $email = V::email($b);
        $password = $b['password'] ?? null;
        if (!is_string($password) || $password === '' || strlen($password) > 1024) {
            throw ApiError::validation(['password' => 'كلمة المرور مطلوبة.']);
        }
        $user = Auth::findByEmail($email);
        $hash = $user['password_hash'] ?? null;
        $ok = password_verify($password, is_string($hash) ? $hash : Auth::dummyHash());
        if ($user === null || !is_string($hash) || !$ok) {
            throw ApiError::of(401, 'invalid_credentials');
        }
        $ban = Auth::activeBan((int) $user['id']);
        if ($ban !== null) {
            throw Auth::bannedError($ban);
        }
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            Db::exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), (int) $user['id']]);
        }
        $token = Auth::startSession($r, (int) $user['id']);
        return ['user' => Auth::shape($user), 'token' => $token];
    }

    public static function logout(Request $r): \stdClass
    {
        if ($r->sessionId !== null) {
            Auth::revokeSession($r->sessionId);
        }
        Auth::clearCookie();
        return Reply::empty();
    }

    public static function me(Request $r): array
    {
        $r->userId();
        return ['user' => Auth::shape((array) $r->user)];
    }

    public static function verifyEmail(Request $r): array
    {
        $token = (string) V::str($r->body(), 'token', 128);
        $uid = Auth::consumeEmailToken($token, 'verify');
        $first = Db::exec('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL', [Db::now(), $uid]) === 1;
        $user = (array) Auth::findUser($uid);
        if ($first) {
            Mailer::sendWelcome((string) $user['email'], (string) $user['name']);
        }
        return ['user' => Auth::shape($user)];
    }

    public static function resendVerification(Request $r): \stdClass
    {
        $uid = $r->userId();
        RateLimit::hit('resend', ['user:' . $uid]);
        $u = (array) $r->user;
        if ($u['email_verified_at'] === null) {
            Mailer::sendVerification((string) $u['email'], (string) $u['name'], Auth::issueEmailToken($uid, 'verify'));
        }
        return Reply::empty();
    }

    public static function forgotPassword(Request $r): \stdClass
    {
        $b = $r->body();
        $emailRaw = is_string($b['email'] ?? null) ? mb_strtolower(trim($b['email'])) : '';
        RateLimit::hit('forgot', ['ip:' . $r->ip, 'forgot:' . hash('sha256', $emailRaw)]);
        $email = V::email($b);
        $user = Auth::findByEmail($email);
        if ($user !== null && Auth::activeBan((int) $user['id']) === null) {
            Mailer::sendReset($email, (string) $user['name'], Auth::issueEmailToken((int) $user['id'], 'reset'));
        }
        return Reply::empty();
    }

    public static function resetPassword(Request $r): \stdClass
    {
        $b = $r->body();
        $token = (string) V::str($b, 'token', 128);
        $password = V::password($b);
        $uid = Auth::consumeEmailToken($token, 'reset');
        Db::exec(
            'UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
            [password_hash($password, PASSWORD_DEFAULT), Db::now(), Db::now(), $uid]
        );
        Db::exec("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'reset'", [$uid]);
        Auth::revokeAll($uid);
        $u = Auth::findUser($uid);
        if ($u !== null) {
            Mailer::sendPasswordChanged((string) $u['email'], (string) $u['name'], 'reset');
        }
        return Reply::empty();
    }

    public static function changePassword(Request $r): \stdClass
    {
        $uid = $r->userId();
        $b = $r->body();
        $new = V::password($b, 'new_password');
        $hash = $r->user['password_hash'] ?? null;
        if (is_string($hash)) {
            $cur = $b['current_password'] ?? null;
            if (!is_string($cur) || !password_verify($cur, $hash)) {
                throw ApiError::validation(['current_password' => 'كلمة المرور الحالية غير صحيحة.'], 'كلمة المرور الحالية غير صحيحة.');
            }
        }
        Db::exec('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), Db::now(), $uid]);
        Auth::revokeAll($uid, $r->sessionId);
        Mailer::sendPasswordChanged((string) $r->user['email'], (string) $r->user['name'], 'change');
        return Reply::empty();
    }

    public static function profile(Request $r): array
    {
        $uid = $r->userId();
        $b = $r->body();
        $sets = [];
        $params = [];
        if (array_key_exists('name', $b)) {
            $sets[] = 'name = ?';
            $params[] = V::str($b, 'name', 100);
        }
        if (array_key_exists('show_on_leaderboard', $b)) {
            $sets[] = 'show_on_leaderboard = ?';
            $params[] = (int) V::bool($b, 'show_on_leaderboard');
        }
        if (array_key_exists('gender', $b)) {
            $sets[] = 'gender = ?';
            $params[] = $b['gender'] === null || $b['gender'] === '' ? null : V::enum($b, 'gender', ['male', 'female']);
        }
        if (array_key_exists('birthdate', $b)) {
            $bd = V::date($b, 'birthdate', false);
            if ($bd !== null && $bd > gmdate('Y-m-d')) {
                throw ApiError::validation(['birthdate' => 'تاريخ غير صالح.']);
            }
            $sets[] = 'birthdate = ?';
            $params[] = $bd;
        }
        if ($sets !== []) {
            $sets[] = 'updated_at = ?';
            $params[] = Db::now();
            $params[] = $uid;
            Db::exec('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
        }
        return ['user' => Auth::shape((array) Auth::findUser($uid))];
    }

    public static function deleteAccount(Request $r): \stdClass
    {
        $uid = $r->userId();
        $b = $r->body();
        $hash = $r->user['password_hash'] ?? null;
        if (is_string($hash)) {
            $pw = $b['password'] ?? null;
            if (!is_string($pw) || !password_verify($pw, $hash)) {
                throw ApiError::validation(['password' => 'كلمة المرور غير صحيحة.'], 'كلمة المرور غير صحيحة.');
            }
        } elseif (($b['confirm'] ?? null) !== 'DELETE') {
            throw ApiError::validation(['confirm' => 'اكتب DELETE للتأكيد.']);
        }
        // Foreign keys cascade: sessions, tokens, bookmarks, notes, progress, reading log, hifz,
        // khatmat, owned group rooms (+ parts, takers, members), claims, memberships, tickets, bans, presence.
        Db::exec('DELETE FROM users WHERE id = ?', [$uid]);
        Auth::clearCookie();
        return Reply::empty();
    }

    public static function export(Request $r): Reply
    {
        $uid = $r->userId();
        $iso = [Db::class, 'iso'];
        $user = Auth::shape((array) Auth::findUser($uid));
        $hifz = Db::one('SELECT data, client_updated_at FROM hifz WHERE user_id = ?', [$uid]);
        $tickets = Db::all('SELECT id, subject, topic, status, created_at, updated_at FROM support_tickets WHERE user_id = ? ORDER BY id', [$uid]);
        foreach ($tickets as &$t) {
            $t['messages'] = array_map(static fn (array $m): array => [
                'id' => (int) $m['id'], 'body' => $m['body'], 'is_admin' => (bool) $m['is_admin'], 'created_at' => Db::iso($m['created_at']),
            ], Db::all('SELECT id, body, is_admin, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id', [(int) $t['id']]));
            $t['created_at'] = $iso($t['created_at']);
            $t['updated_at'] = $iso($t['updated_at']);
        }
        unset($t);
        $rooms = Db::all('SELECT code, deceased_name, mode, is_public, completions, created_at FROM group_rooms WHERE owner_id = ?', [$uid]);
        foreach ($rooms as &$room) {
            $room['parts'] = Db::all('SELECT part_index, label, assignee, done, done_by_name, done_at FROM group_parts WHERE room_code = ? ORDER BY part_index', [$room['code']]);
        }
        unset($room);
        $data = [
            'exported_at' => gmdate('Y-m-d\TH:i:s\Z'),
            'user' => $user,
            'bookmarks' => Db::all('SELECT surah, ayah, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at', [$uid]),
            'notes' => Db::all('SELECT surah, ayah, text, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC', [$uid]),
            'progress' => Db::one('SELECT surah, ayah, updated_at FROM reading_progress WHERE user_id = ?', [$uid]),
            'reading_log' => Db::all('SELECT read_date AS date, surah, ayah FROM reading_log WHERE user_id = ? ORDER BY read_date, surah, ayah', [$uid]),
            'hifz' => $hifz === null ? null : ['data' => json_decode((string) $hifz['data'], true), 'updated_at' => $iso($hifz['client_updated_at'])],
            'khatmat' => Db::all('SELECT id, type, start_date, end_date, notes, created_at FROM khatmat WHERE user_id = ? ORDER BY id', [$uid]),
            'group_rooms_owned' => $rooms,
            'group_claims' => Db::all('SELECT room_code, part_index, name, done, done_at FROM group_takers WHERE user_id = ?', [$uid]),
            'group_memberships' => Db::all('SELECT room_code, joined_at FROM group_members WHERE user_id = ?', [$uid]),
            'support_tickets' => $tickets,
        ];
        return new Reply($data, 200, ['Content-Disposition' => 'attachment; filename="nuralquran-export.json"']);
    }
}
