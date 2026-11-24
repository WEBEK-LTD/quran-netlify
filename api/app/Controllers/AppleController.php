<?php
declare(strict_types=1);

namespace NQ\Controllers;

use NQ\Core\ApiError;
use NQ\Core\Apple;
use NQ\Core\Auth;
use NQ\Core\Crypto;
use NQ\Core\Db;
use NQ\Core\Mailer;
use NQ\Core\MailText;
use NQ\Core\Migrations;
use NQ\Core\RateLimit;
use NQ\Core\Request;
use NQ\Core\Settings;

/**
 * Sign in with Apple from the iOS app (native sheet → identity token → POST /v1/auth/apple),
 * and Apple's server-to-server notifications (POST /v1/auth/apple/notifications).
 */
final class AppleController
{
    /** Name for a new account when Apple shares no name and the address is a private relay one. */
    private const DEFAULT_NAME = ['ar' => 'قارئ', 'en' => 'Reader', 'tr' => 'Okuyucu', 'fr' => 'Lecteur', 'ur' => 'قاری', 'id' => 'Pembaca'];

    private static function str(array $b, string $key, int $max): ?string
    {
        $v = $b[$key] ?? null;
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_string($v) || strlen($v) > $max) {
            throw ApiError::validation([$key => 'قيمة غير صالحة.']);
        }
        return $v;
    }

    private static function cleanName(?string $s): string
    {
        return trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $s));
    }

    public static function signIn(Request $r): array
    {
        RateLimit::hit('apple', ['ip:' . $r->ip]);
        if (!Migrations::ready()) {
            throw new ApiError(503, 'apple_unavailable', 'تسجيل الدخول باستخدام Apple غير متاح حالياً، حاول لاحقاً.');
        }
        $b = $r->body();
        $idToken = self::str($b, 'identity_token', 8192);
        if ($idToken === null) {
            throw ApiError::validation(['identity_token' => 'رمز Apple مطلوب.']);
        }
        $code = self::str($b, 'authorization_code', 1024);
        if ($code !== null && !preg_match('/^[A-Za-z0-9._-]+$/', $code)) {
            throw ApiError::validation(['authorization_code' => 'قيمة غير صالحة.']);
        }
        $nonce = self::str($b, 'nonce', 200);
        $given = mb_substr(self::cleanName(self::str($b, 'given_name', 400)), 0, 60);
        $family = mb_substr(self::cleanName(self::str($b, 'family_name', 400)), 0, 60);
        $lang = isset($b['lang']) && is_string($b['lang']) && in_array($b['lang'], MailText::LANGS, true) ? $b['lang'] : null;

        $why = null;
        $c = Apple::verify($idToken, $why);
        if ($c === null) {
            error_log('[nq] apple sign-in: identity token rejected (' . $why . ')');
            throw new ApiError(401, 'apple_invalid_token', 'تعذّر التحقق من تسجيل الدخول باستخدام Apple، حاول مرة أخرى.');
        }
        // A nonce in the token binds it to the sign-in this app started (the app sends the raw value, Apple holds its SHA-256)
        if (isset($c['nonce']) && ($nonce === null || !hash_equals((string) $c['nonce'], hash('sha256', $nonce)))) {
            throw new ApiError(401, 'apple_invalid_token', 'تعذّر التحقق من تسجيل الدخول باستخدام Apple، حاول مرة أخرى.');
        }
        $sub = (string) ($c['sub'] ?? '');
        if ($sub === '' || strlen($sub) > 191 || !preg_match('/^[A-Za-z0-9._-]+$/', $sub)) {
            throw new ApiError(401, 'apple_invalid_token', 'تعذّر التحقق من تسجيل الدخول باستخدام Apple، حاول مرة أخرى.');
        }
        $email = mb_strtolower(trim((string) ($c['email'] ?? '')));
        $email = filter_var($email, FILTER_VALIDATE_EMAIL) && strlen($email) <= 254 ? $email : '';
        $verified = $email !== '' && (($c['email_verified'] ?? false) === true || ($c['email_verified'] ?? '') === 'true');

        $user = Db::one('SELECT id FROM users WHERE apple_sub = ?', [$sub]);
        $new = false;
        if ($user === null) {
            if ($email === '') {
                // Apple shares the address on every token once the email scope was granted; without it there is nothing to create
                throw new ApiError(422, 'apple_no_email', 'لم تُشارك Apple بريدك الإلكتروني. افتح الإعدادات ← اسمك ← تسجيل الدخول والأمان ← تسجيل الدخول باستخدام Apple، وأوقف استخدامه مع «نور القرآن»، ثم حاول مجدداً.');
            }
            $byEmail = Db::one('SELECT id, apple_sub FROM users WHERE email = ?', [$email]);
            if ($byEmail !== null) {
                if (!$verified || ($byEmail['apple_sub'] !== null && $byEmail['apple_sub'] !== $sub)) {
                    throw new ApiError(409, 'apple_link_failed', 'هذا البريد مرتبط بحساب آخر. سجّل الدخول بالبريد وكلمة المرور أو بحساب Google.');
                }
                Db::exec(
                    'UPDATE users SET apple_sub = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
                    [$sub, Db::now(), Db::now(), (int) $byEmail['id']]
                );
                $user = ['id' => $byEmail['id']];
            } else {
                if (Settings::get('allow_signup') !== true) {
                    throw ApiError::of(403, 'signup_closed');
                }
                $name = mb_substr(trim($given . ' ' . $family), 0, 100);
                if ($name === '') {
                    $relay = str_ends_with($email, '@privaterelay.appleid.com');
                    $name = $relay ? self::DEFAULT_NAME[$lang ?? MailText::DEFAULT] : mb_substr(explode('@', $email)[0], 0, 100);
                }
                try {
                    $id = Db::insert(
                        'INSERT INTO users (email, name, lang, apple_sub, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [$email, $name, $lang ?? MailText::DEFAULT, $sub, $verified ? Db::now() : null, Db::now(), Db::now()]
                    );
                } catch (\PDOException $e) {
                    if (($e->errorInfo[1] ?? 0) === 1062) { // a parallel request created it
                        throw new ApiError(409, 'apple_link_failed', 'حاول تسجيل الدخول مرة أخرى.');
                    }
                    throw $e;
                }
                $user = ['id' => $id];
                $new = true;
                if ($verified) {
                    Mailer::sendWelcome($email, $name, $lang ?? MailText::DEFAULT);
                }
            }
        }
        $uid = (int) $user['id'];
        $ban = Auth::activeBan($uid);
        if ($ban !== null) {
            throw Auth::bannedError($ban);
        }
        if ($lang !== null && !$new) {
            Db::exec('UPDATE users SET lang = ? WHERE id = ?', [$lang, $uid]); // same as a password login
        }
        // With the key configured: keep a refresh token, so deleting the account can revoke it at Apple
        if ($code !== null && Apple::keyConfigured()) {
            $err = null;
            $rt = Apple::exchangeCode($code, $err);
            if ($rt !== null) {
                Db::exec('UPDATE users SET apple_refresh_token = ? WHERE id = ?', [Crypto::encrypt($rt), $uid]);
            } else {
                error_log('[nq] apple code exchange failed for user ' . $uid . ': ' . $err);
            }
        }
        $token = Auth::startSession($r, $uid);
        return ['user' => Auth::shape((array) Auth::findUser($uid)), 'token' => $token];
    }

    /**
     * Apple's server-to-server notifications: body {"payload": "<JWT signed by Apple>"} (JSON or form).
     * events.type: consent-revoked | account-delete | email-disabled | email-enabled.
     */
    public static function notifications(Request $r): array
    {
        $raw = $r->raw();
        $j = json_decode($raw, true);
        if (is_array($j)) {
            $payload = $j['payload'] ?? null;
        } else {
            parse_str($raw, $form);
            $payload = $form['payload'] ?? null;
        }
        $why = null;
        $c = is_string($payload) ? Apple::verify($payload, $why, false) : null;
        if ($c === null) {
            error_log('[nq] apple notification rejected (' . ($why ?? 'no payload') . ')');
            throw new ApiError(400, 'invalid_signature', 'توقيع غير صالح.');
        }
        $ev = $c['events'] ?? null;
        $ev = is_string($ev) ? json_decode($ev, true) : $ev;
        $type = is_array($ev) ? (string) ($ev['type'] ?? '') : '';
        $sub = is_array($ev) ? (string) ($ev['sub'] ?? '') : '';
        if ($type === '' || $sub === '' || !Migrations::ready()) {
            return ['handled' => false];
        }
        $u = Db::one('SELECT id, password_hash, google_sub FROM users WHERE apple_sub = ?', [$sub]);
        error_log('[nq] apple notification ' . preg_replace('/[^a-z-]/', '', $type) . ($u !== null ? ' for user ' . (int) $u['id'] : ' (no account)'));
        if ($u === null) {
            return ['handled' => false];
        }
        $uid = (int) $u['id'];
        switch ($type) {
            case 'account-delete':
                if ($u['password_hash'] === null && $u['google_sub'] === null) {
                    // no other way to sign in: the account goes with the Apple ID (its token is already void at Apple)
                    AuthController::purgeAccount($uid, false);
                    return ['handled' => true, 'deleted' => true];
                }
                // fall through: keep the account, unlink Apple
            case 'consent-revoked':
                Db::exec('UPDATE users SET apple_sub = NULL, apple_refresh_token = NULL, updated_at = ? WHERE id = ?', [Db::now(), $uid]);
                return ['handled' => true];
            default: // email-disabled / email-enabled: the relay address only stops/starts forwarding
                return ['handled' => true];
        }
    }
}
