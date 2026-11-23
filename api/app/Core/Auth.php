<?php
declare(strict_types=1);

namespace NQ\Core;

/** Sessions, the nq_session cookie, users and one-time email tokens. */
final class Auth
{
    public const COOKIE = 'nq_session';
    public const SESSION_TTL = 60 * 86400;
    private const TOUCH_EVERY = 300;

    public const USER_COLS = 'u.id, u.email, u.name, u.avatar_url, u.gender, u.birthdate, u.is_admin,
        u.email_verified_at, u.show_on_leaderboard, u.password_hash, u.google_sub, u.created_at, u.last_seen_at';

    /** USER_COLS plus columns added by Migrations (only once they exist, so an old schema keeps working). */
    public static function userCols(): string
    {
        return self::USER_COLS . (Migrations::ready() ? ', u.lang, u.avatar_file' : '');
    }

    /** Resolve the session from `Authorization: Bearer` or the cookie. Never throws for a bad token. */
    public static function resolve(Request $r): void
    {
        $token = null;
        $via = null;
        $auth = $r->header('authorization');
        if ($auth !== null && preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($auth), $m)) {
            $token = strtolower($m[1]);
            $via = 'bearer';
        } else {
            $c = $r->cookie(self::COOKIE);
            if ($c !== null && preg_match('/^[a-f0-9]{64}$/', $c)) {
                $token = $c;
                $via = 'cookie';
            }
        }
        if ($token === null) {
            return;
        }
        $row = Db::one(
            'SELECT s.id AS sid, s.expires_at, s.last_used_at, ' . self::userCols() . '
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > ?',
            [Crypto::hash($token), Db::now()]
        );
        if ($row === null) {
            if ($via === 'cookie') {
                self::clearCookie();
            }
            return;
        }
        if (self::activeBan((int) $row['id']) !== null) {
            self::revokeAll((int) $row['id']);
            if ($via === 'cookie') {
                self::clearCookie();
            }
            return;
        }
        $sid = (int) $row['sid'];
        if (strtotime($row['last_used_at'] . ' UTC') < time() - self::TOUCH_EVERY) {
            Db::exec(
                'UPDATE sessions SET last_used_at = ?, expires_at = ?, ip = ? WHERE id = ?',
                [Db::now(), Db::now(self::SESSION_TTL), $r->ip, $sid]
            );
            Db::exec('UPDATE users SET last_seen_at = ? WHERE id = ?', [Db::now(), (int) $row['id']]);
            if ($via === 'cookie') {
                self::setCookie($token); // sliding expiry
            }
        }
        unset($row['sid'], $row['expires_at'], $row['last_used_at']);
        $r->user = $row;
        $r->sessionId = $sid;
        $r->authVia = $via;
    }

    /** Create a session, set the cookie and return the raw token. */
    public static function startSession(Request $r, int $userId): string
    {
        $token = Crypto::token();
        Db::insert(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at, ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [Crypto::hash($token), $userId, Db::now(), Db::now(self::SESSION_TTL), Db::now(), $r->ip, $r->userAgent()]
        );
        Db::exec('UPDATE users SET last_seen_at = ? WHERE id = ?', [Db::now(), $userId]);
        self::setCookie($token);
        if (random_int(1, 50) === 1) {
            Db::exec('DELETE FROM sessions WHERE expires_at < ?', [Db::now()]);
        }
        return $token;
    }

    public static function setCookie(string $token): void
    {
        if (headers_sent()) {
            return;
        }
        setcookie(self::COOKIE, $token, [
            'expires' => time() + self::SESSION_TTL,
            'path' => '/',
            'domain' => (string) Config::get('cookie_domain', ''),
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function clearCookie(): void
    {
        if (headers_sent()) {
            return;
        }
        setcookie(self::COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'domain' => (string) Config::get('cookie_domain', ''),
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function revokeSession(int $sessionId): void
    {
        Db::exec('DELETE FROM sessions WHERE id = ?', [$sessionId]);
    }

    public static function revokeAll(int $userId, ?int $exceptSessionId = null): void
    {
        if ($exceptSessionId !== null) {
            Db::exec('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$userId, $exceptSessionId]);
        } else {
            Db::exec('DELETE FROM sessions WHERE user_id = ?', [$userId]);
        }
    }

    /** @return array<string,mixed>|null the active ban row */
    public static function activeBan(int $userId): ?array
    {
        return Db::one(
            "SELECT user_id, scope, reason, until FROM bans WHERE user_id = ? AND scope = 'app' AND (until IS NULL OR until > ?)",
            [$userId, Db::now()]
        );
    }

    public static function bannedError(array $ban): ApiError
    {
        $msg = 'تم إيقاف هذا الحساب';
        if (!empty($ban['until'])) {
            $msg .= ' حتى ' . substr((string) $ban['until'], 0, 10);
        }
        if (!empty($ban['reason'])) {
            $msg .= '. السبب: ' . $ban['reason'];
        }
        return new ApiError(403, 'banned', $msg . '.');
    }

    /** @return array<string,mixed>|null */
    public static function findUser(int $id): ?array
    {
        return Db::one('SELECT ' . self::userCols() . ' FROM users u WHERE u.id = ?', [$id]);
    }

    /** @return array<string,mixed>|null */
    public static function findByEmail(string $email): ?array
    {
        return Db::one('SELECT ' . self::userCols() . ' FROM users u WHERE u.email = ?', [mb_strtolower($email)]);
    }

    /** Public User shape. @param array<string,mixed> $u @return array<string,mixed> */
    public static function shape(array $u): array
    {
        return [
            'id' => (int) $u['id'],
            'email' => (string) $u['email'],
            'name' => (string) $u['name'],
            'lang' => MailText::lang($u['lang'] ?? null),
            'avatar_url' => self::avatarUrl($u),
            'gender' => in_array($u['gender'], ['male', 'female'], true) ? $u['gender'] : null,
            'birthdate' => $u['birthdate'] ?: null,
            'is_admin' => (int) $u['is_admin'] === 1,
            'email_verified' => $u['email_verified_at'] !== null,
            'show_on_leaderboard' => (int) $u['show_on_leaderboard'] === 1,
            'has_password' => ($u['password_hash'] ?? null) !== null,
            'created_at' => Db::iso((string) $u['created_at']),
        ];
    }

    /** Uploaded photo if any, else the Google picture, else null. @param array<string,mixed> $u */
    public static function avatarUrl(array $u): ?string
    {
        $file = $u['avatar_file'] ?? null;
        if (is_string($file) && Avatar::validName($file)) {
            return Avatar::url($file);
        }
        $pic = $u['avatar_url'] ?? null;
        return is_string($pic) && $pic !== '' ? $pic : null;
    }

    public static function requireUser(Request $r): int
    {
        return $r->userId();
    }

    public static function requireAdmin(Request $r): int
    {
        $id = $r->userId();
        if (!$r->isAdmin()) {
            throw ApiError::forbidden();
        }
        return $id;
    }

    /** Issue a one-time email token ('verify' 24 h, 'reset' 1 h). Older unused tokens of that purpose are removed. */
    public static function issueEmailToken(int $userId, string $purpose): string
    {
        $ttl = $purpose === 'reset' ? 3600 : 86400;
        $token = Crypto::token();
        Db::exec('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?', [$userId, $purpose]);
        Db::insert(
            'INSERT INTO email_tokens (user_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
            [$userId, $purpose, Crypto::hash($token), Db::now(), Db::now($ttl)]
        );
        return $token;
    }

    /** Consume a token; returns the user id or throws invalid_token. */
    public static function consumeEmailToken(string $token, string $purpose): int
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw ApiError::of(422, 'invalid_token');
        }
        return Db::tx(static function () use ($token, $purpose): int {
            $row = Db::one(
                'SELECT id, user_id, token_hash FROM email_tokens
                 WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? FOR UPDATE',
                [Crypto::hash($token), $purpose, Db::now()]
            );
            if ($row === null || !Crypto::equals((string) $row['token_hash'], Crypto::hash($token))) {
                throw ApiError::of(422, 'invalid_token');
            }
            Db::exec('UPDATE email_tokens SET used_at = ? WHERE id = ?', [Db::now(), (int) $row['id']]);
            return (int) $row['user_id'];
        });
    }

    /** A bcrypt hash used to keep login timing similar for unknown emails. */
    public static function dummyHash(): string
    {
        return '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
    }
}
