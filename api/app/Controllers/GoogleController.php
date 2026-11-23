<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\Auth;
use NQ\Core\Config;
use NQ\Core\Crypto;
use NQ\Core\Db;
use NQ\Core\Http;
use NQ\Core\Integrations;
use NQ\Core\Mailer;
use NQ\Core\MailText;
use NQ\Core\Migrations;
use NQ\Core\Redirect;
use NQ\Core\Request;
use NQ\Core\Settings;

/** Google sign-in (server-side authorization-code flow). */
final class GoogleController
{
    private const STATE_COOKIE = 'nq_oauth';
    private const STATE_TTL = 600;

    public static function redirectUri(): string
    {
        return Config::apiUrl() . '/v1/auth/google/callback';
    }

    /** Only same-site relative paths are allowed (no open redirect). */
    public static function safeNext(?string $next): string
    {
        $next = (string) $next;
        if ($next === '' || strlen($next) > 255 || $next[0] !== '/' || str_starts_with($next, '//')
            || str_contains($next, '\\') || preg_match('/[\x00-\x20\x7F]/', $next)) {
            return '/';
        }
        return $next;
    }

    private static function fail(string $reason, string $client = 'web'): Redirect
    {
        $q = ['status' => 'error', 'reason' => $reason];
        if ($client === 'app') {
            $q['client'] = 'app';
        }
        return new Redirect(Config::siteUrl() . '/auth/callback?' . http_build_query($q));
    }

    private static function stateCookie(string $value, int $ttl): void
    {
        setcookie(self::STATE_COOKIE, $value, [
            'expires' => $ttl > 0 ? time() + $ttl : time() - 3600,
            'path' => '/v1/auth/google/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function start(Request $r): Redirect
    {
        $client = $r->q('client') === 'app' ? 'app' : 'web';
        if (!Integrations::googleConfigured()) {
            return self::fail('not_configured', $client);
        }
        $next = self::safeNext($r->q('next'));
        $state = Crypto::token();
        $lang = $r->q('lang');
        $lang = is_string($lang) && in_array($lang, MailText::LANGS, true) ? $lang : null;
        if ($lang !== null && Migrations::ready()) {
            Db::exec(
                'INSERT INTO oauth_states (state_hash, next_path, client, lang, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
                [Crypto::hash($state), $next, $client, $lang, Db::now(), Db::now(self::STATE_TTL)]
            );
        } else {
            Db::exec(
                'INSERT INTO oauth_states (state_hash, next_path, client, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
                [Crypto::hash($state), $next, $client, Db::now(), Db::now(self::STATE_TTL)]
            );
        }
        if (random_int(1, 20) === 1) {
            Db::exec('DELETE FROM oauth_states WHERE expires_at < ?', [Db::now()]);
        }
        self::stateCookie($state, self::STATE_TTL);
        $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
            'client_id' => Integrations::get('google_client_id'),
            'redirect_uri' => self::redirectUri(),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'prompt' => 'select_account',
            'access_type' => 'online',
            'include_granted_scopes' => 'true',
        ]);
        return new Redirect($url);
    }

    public static function callback(Request $r): Redirect
    {
        $state = (string) $r->q('state', '');
        if (!preg_match('/^[a-f0-9]{64}$/', $state)) {
            return self::fail('failed');
        }
        $row = Db::one('SELECT * FROM oauth_states WHERE state_hash = ? AND expires_at > ?', [Crypto::hash($state), Db::now()]);
        Db::exec('DELETE FROM oauth_states WHERE state_hash = ?', [Crypto::hash($state)]);
        $cookie = $r->cookie(self::STATE_COOKIE) ?? '';
        self::stateCookie('', 0);
        if ($row === null) {
            return self::fail('failed');
        }
        $client = (string) $row['client'];
        if (!Crypto::equals($state, $cookie)) {
            return self::fail('failed', $client);
        }
        if ($r->q('error') !== null) {
            return self::fail('cancelled', $client);
        }
        $code = (string) $r->q('code', '');
        if ($code === '' || strlen($code) > 2048 || !Integrations::googleConfigured()) {
            return self::fail('failed', $client);
        }

        $tok = Http::postForm('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => Integrations::get('google_client_id'),
            'client_secret' => Integrations::get('google_client_secret'),
            'redirect_uri' => self::redirectUri(),
            'grant_type' => 'authorization_code',
        ]);
        $access = is_array($tok['json']) ? (string) ($tok['json']['access_token'] ?? '') : '';
        if ($tok['status'] !== 200 || $access === '') {
            error_log('[nq] google token exchange failed: http=' . $tok['status']);
            return self::fail('failed', $client);
        }
        $info = Http::request('GET', 'https://openidconnect.googleapis.com/v1/userinfo', ['Authorization' => 'Bearer ' . $access, 'Accept' => 'application/json'], null, 20);
        $p = is_array($info['json']) ? $info['json'] : [];
        $sub = (string) ($p['sub'] ?? '');
        $email = mb_strtolower(trim((string) ($p['email'] ?? '')));
        $verified = ($p['email_verified'] ?? false) === true || ($p['email_verified'] ?? '') === 'true';
        if ($info['status'] !== 200 || $sub === '' || strlen($sub) > 64 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return self::fail('failed', $client);
        }
        if (!$verified) {
            return self::fail('email_unverified', $client);
        }

        // UI language the visitor used when starting sign-in (null when not sent)
        $lang = isset($row['lang']) && in_array($row['lang'], MailText::LANGS, true) ? (string) $row['lang'] : null;
        $user = Db::one('SELECT id FROM users WHERE google_sub = ?', [$sub]);
        if ($user === null) {
            $byEmail = Db::one('SELECT id, google_sub FROM users WHERE email = ?', [$email]);
            if ($byEmail !== null) {
                if ($byEmail['google_sub'] !== null && $byEmail['google_sub'] !== $sub) {
                    return self::fail('failed', $client);
                }
                Db::exec(
                    'UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
                    [$sub, Db::now(), Db::now(), (int) $byEmail['id']]
                );
                $user = ['id' => $byEmail['id']];
            } else {
                if (Settings::get('allow_signup') !== true) {
                    return self::fail('signup_closed', $client);
                }
                $name = mb_substr(trim((string) ($p['name'] ?? '')), 0, 100) ?: mb_substr(explode('@', $email)[0], 0, 100);
                $pic = (string) ($p['picture'] ?? '');
                $pic = str_starts_with($pic, 'https://') && strlen($pic) <= 500 ? $pic : null;
                $id = $lang !== null && Migrations::ready()
                    ? Db::insert(
                        'INSERT INTO users (email, name, lang, avatar_url, google_sub, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [$email, $name, $lang, $pic, $sub, Db::now(), Db::now(), Db::now()]
                    )
                    : Db::insert(
                        'INSERT INTO users (email, name, avatar_url, google_sub, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [$email, $name, $pic, $sub, Db::now(), Db::now(), Db::now()]
                    );
                $user = ['id' => $id, 'new' => true];
                Mailer::sendWelcome($email, $name, $lang ?? MailText::DEFAULT); // Google addresses are already verified
            }
        }
        $uid = (int) $user['id'];
        if (Auth::activeBan($uid) !== null) {
            return self::fail('banned', $client);
        }
        if ($lang !== null && empty($user['new']) && Migrations::ready()) {
            Db::exec('UPDATE users SET lang = ? WHERE id = ?', [$lang, $uid]); // same as a password login
        }
        $token = Auth::startSession($r, $uid);
        if ($client === 'app') {
            return new Redirect(Config::get('app_scheme', 'nuralquran') . '://auth?' . http_build_query(['token' => $token]));
        }
        return new Redirect(Config::siteUrl() . '/auth/callback?' . http_build_query(['status' => 'ok', 'next' => (string) $row['next_path']]));
    }
}
