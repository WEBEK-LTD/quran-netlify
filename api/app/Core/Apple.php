<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Sign in with Apple (the iOS app's native sheet; there is no website flow).
 *
 *  - identity tokens and server-to-server notifications are RS256 JWTs signed by Apple:
 *    verified against Apple's public keys (JWKS, cached in storage/cache/apple, refetched on an unknown kid);
 *  - with the Sign in with Apple key (.p8) configured in admin → Integrations, the authorization code is exchanged
 *    for a refresh token (stored encrypted), which is revoked when the account is deleted (App Store guideline 5.1.1(v)).
 *    Without the key, sign-in still works; only the exchange / revocation are skipped.
 *
 * config.php may point `apple_auth_url` at a local stand-in (tests only); production always talks to appleid.apple.com.
 */
final class Apple
{
    public const ISSUER = 'https://appleid.apple.com';
    public const DEFAULT_CLIENT_ID = 'net.nuralquran.app';
    private const JWKS_TTL = 86400;
    private const JWKS_MIN_REFETCH = 300;   // an unknown kid refetches at most every 5 minutes
    private const LEEWAY = 60;

    public static function clientId(): string
    {
        return Integrations::get('apple_signin_client_id') ?: self::DEFAULT_CLIENT_ID;
    }

    /** Whether the Sign in with Apple key is set (token exchange, revocation, admin test). */
    public static function keyConfigured(): bool
    {
        return Integrations::get('apple_signin_team_id') !== '' && Integrations::get('apple_signin_key_id') !== ''
            && Integrations::get('apple_signin_key_p8') !== '';
    }

    private static function base(): string
    {
        $b = rtrim((string) (Config::get('apple_auth_url') ?: self::ISSUER), '/');
        return str_starts_with($b, 'https://') || Http::isLocalHttp($b) ? $b : self::ISSUER;
    }

    /** @param array<string,string> $form */
    private static function post(string $path, array $form, int $timeout = 15): array
    {
        $url = self::base() . $path;
        return Http::request('POST', $url, ['Content-Type' => 'application/x-www-form-urlencoded', 'Accept' => 'application/json'],
            http_build_query($form), $timeout, Http::isLocalHttp($url));
    }

    // ── Apple's public keys ─────────────────────────────────────────────────

    private static function jwksFile(): string
    {
        return Config::storageDir('cache/apple') . '/jwks.json';
    }

    /** @return array{url:string, at:int, keys:list<array<string,mixed>>}|null */
    private static function cachedJwks(): ?array
    {
        $c = json_decode((string) @file_get_contents(self::jwksFile()), true);
        return is_array($c) && ($c['url'] ?? '') === self::base() && is_array($c['keys'] ?? null) ? $c : null;
    }

    /** @return list<array<string,mixed>>|null */
    private static function fetchJwks(): ?array
    {
        $url = self::base() . '/auth/keys';
        $res = Http::request('GET', $url, ['Accept' => 'application/json'], null, 10, Http::isLocalHttp($url), 200000);
        $keys = is_array($res['json']) ? ($res['json']['keys'] ?? null) : null;
        if ($res['status'] !== 200 || !is_array($keys)) {
            error_log('[nq] apple jwks fetch failed: http=' . $res['status'] . ' ' . substr($res['error'], 0, 100));
            return null;
        }
        $keys = array_values(array_filter($keys, static fn ($k): bool => is_array($k) && ($k['kty'] ?? '') === 'RSA'
            && is_string($k['kid'] ?? null) && is_string($k['n'] ?? null) && is_string($k['e'] ?? null)));
        $f = self::jwksFile();
        @file_put_contents($f, (string) json_encode(['url' => self::base(), 'at' => time(), 'keys' => $keys]), LOCK_EX);
        @chmod($f, 0600);
        return $keys;
    }

    /** @return array<string,mixed>|null the JWK with this kid */
    private static function key(string $kid): ?array
    {
        $find = static function (?array $keys) use ($kid): ?array {
            foreach ($keys ?? [] as $k) {
                if (($k['kid'] ?? null) === $kid) {
                    return $k;
                }
            }
            return null;
        };
        $c = self::cachedJwks();
        $fresh = $c !== null && (int) $c['at'] > time() - self::JWKS_TTL;
        if ($fresh && ($k = $find($c['keys'])) !== null) {
            return $k;
        }
        // stale, missing, or a kid we have not seen (Apple rotates keys): refetch, but not on every bad token
        if ($fresh && (int) $c['at'] > time() - self::JWKS_MIN_REFETCH) {
            return null;
        }
        $keys = self::fetchJwks();
        return $find($keys ?? ($c['keys'] ?? null));
    }

    public static function clearCache(): void
    {
        @unlink(self::jwksFile());
    }

    /** RSA JWK (n, e) → PEM public key (SubjectPublicKeyInfo). */
    public static function jwkToPem(array $jwk): ?string
    {
        $n = Jwt::b64uDecode((string) ($jwk['n'] ?? ''));
        $e = Jwt::b64uDecode((string) ($jwk['e'] ?? ''));
        if ($n === null || $e === null || strlen($n) < 256 || $e === '') {
            return null; // ≥ 2048-bit keys only
        }
        $len = static function (int $l): string {
            if ($l < 0x80) {
                return chr($l);
            }
            $b = ltrim(pack('N', $l), "\0");
            return chr(0x80 | strlen($b)) . $b;
        };
        $int = static function (string $v) use ($len): string {
            $v = ltrim($v, "\0");
            if ($v === '' || (ord($v[0]) & 0x80)) {
                $v = "\0" . $v;
            }
            return "\x02" . $len(strlen($v)) . $v;
        };
        $rsa = $int($n) . $int($e);
        $rsa = "\x30" . $len(strlen($rsa)) . $rsa;
        $bits = "\x03" . $len(strlen($rsa) + 1) . "\0" . $rsa;
        $alg = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00"; // rsaEncryption, NULL
        $spki = "\x30" . $len(strlen($alg) + strlen($bits)) . $alg . $bits;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /**
     * Verify a JWT signed by Apple (identity token or notification payload): RS256 with Apple's key,
     * iss = https://appleid.apple.com, aud = our client id, sane iat/exp. Returns the claims or null ($why = the reason).
     * @return array<string,mixed>|null
     */
    public static function verify(string $jwt, ?string &$why = null, bool $requireExp = true): ?array
    {
        $parts = explode('.', trim($jwt));
        if (strlen($jwt) > 8192 || count($parts) !== 3) {
            $why = 'malformed';
            return null;
        }
        $head = json_decode((string) Jwt::b64uDecode($parts[0]), true);
        $claims = json_decode((string) Jwt::b64uDecode($parts[1]), true);
        $sig = Jwt::b64uDecode($parts[2]);
        if (!is_array($head) || !is_array($claims) || $sig === null || $sig === '') {
            $why = 'malformed';
            return null;
        }
        if (($head['alg'] ?? '') !== 'RS256' || !is_string($head['kid'] ?? null) || $head['kid'] === '' || strlen($head['kid']) > 100) {
            $why = 'alg';
            return null;
        }
        $jwk = self::key($head['kid']);
        $pem = $jwk !== null ? self::jwkToPem($jwk) : null;
        $pub = $pem !== null ? openssl_pkey_get_public($pem) : false;
        if ($pub === false) {
            $why = 'unknown_key';
            return null;
        }
        if (openssl_verify($parts[0] . '.' . $parts[1], $sig, $pub, OPENSSL_ALGO_SHA256) !== 1) {
            $why = 'signature';
            return null;
        }
        if (($claims['iss'] ?? '') !== self::ISSUER) {
            $why = 'iss';
            return null;
        }
        $aud = $claims['aud'] ?? null;
        if (!(is_string($aud) && $aud === self::clientId()) && !(is_array($aud) && in_array(self::clientId(), $aud, true))) {
            $why = 'aud';
            return null;
        }
        $now = time();
        $iat = $claims['iat'] ?? null;
        $exp = $claims['exp'] ?? null;
        if (!is_numeric($iat) || (int) $iat > $now + 300) {
            $why = 'iat';
            return null;
        }
        if ($exp !== null || $requireExp) {
            if (!is_numeric($exp) || (int) $exp < $now - self::LEEWAY || (int) $exp <= (int) $iat) {
                $why = 'expired';
                return null;
            }
        }
        return $claims;
    }

    // ── Apple's token endpoints (need the .p8 key) ──────────────────────────

    /** The client secret Apple's token endpoints expect: an ES256 JWT signed with the Sign in with Apple key. */
    public static function clientSecret(): string
    {
        $now = time();
        return Jwt::encode([
            'iss' => Integrations::get('apple_signin_team_id'),
            'iat' => $now,
            'exp' => $now + 3600,
            'aud' => self::ISSUER,
            'sub' => self::clientId(),
        ], 'ES256', Integrations::get('apple_signin_key_p8'), ['kid' => Integrations::get('apple_signin_key_id')]);
    }

    /** Exchange an authorization code; returns the refresh token or null ($why = the reason). */
    public static function exchangeCode(string $code, ?string &$why = null): ?string
    {
        try {
            $secret = self::clientSecret();
        } catch (\Throwable $e) {
            $why = 'key: ' . $e->getMessage();
            return null;
        }
        $res = self::post('/auth/token', [
            'client_id' => self::clientId(),
            'client_secret' => $secret,
            'code' => $code,
            'grant_type' => 'authorization_code',
        ]);
        $rt = is_array($res['json']) ? (string) ($res['json']['refresh_token'] ?? '') : '';
        if ($res['status'] !== 200 || $rt === '' || strlen($rt) > 2000) {
            $why = 'http=' . $res['status'] . ' ' . (is_array($res['json']) ? (string) ($res['json']['error'] ?? '') : substr($res['error'], 0, 100));
            return null;
        }
        return $rt;
    }

    /** Revoke a refresh token (account deletion). True when Apple accepted it. */
    public static function revoke(string $refreshToken, ?string &$why = null): bool
    {
        try {
            $secret = self::clientSecret();
        } catch (\Throwable $e) {
            $why = 'key: ' . $e->getMessage();
            return false;
        }
        $res = self::post('/auth/revoke', [
            'client_id' => self::clientId(),
            'client_secret' => $secret,
            'token' => $refreshToken,
            'token_type_hint' => 'refresh_token',
        ], 10);
        if ($res['status'] !== 200) {
            $why = 'http=' . $res['status'] . ' ' . (is_array($res['json']) ? (string) ($res['json']['error'] ?? '') : substr($res['error'], 0, 100));
            return false;
        }
        return true;
    }

    /**
     * Admin connectivity test: a made-up code is sent to Apple's token endpoint.
     * invalid_grant = Apple accepted our client secret (the key works); invalid_client = wrong key / ids.
     * @return array{ok:bool, message:string}
     */
    public static function test(): array
    {
        if (!self::keyConfigured()) {
            return ['ok' => false, 'message' => 'أدخل مفتاح ‎.p8‎ و Key ID و Team ID الخاصة بتسجيل الدخول بـ Apple أولاً. (تسجيل الدخول يعمل بدونها، لكن لا يمكن إلغاء ربط الحساب عند حذفه.)'];
        }
        try {
            $secret = self::clientSecret();
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'تعذّر التوقيع بالمفتاح: ' . $e->getMessage()];
        }
        $res = self::post('/auth/token', [
            'client_id' => self::clientId(),
            'client_secret' => $secret,
            'code' => 'nq-connectivity-test',
            'grant_type' => 'authorization_code',
        ]);
        if ($res['status'] === 0) {
            return ['ok' => false, 'message' => 'تعذّر الوصول إلى خوادم Apple من الخادم.'];
        }
        $err = is_array($res['json']) ? (string) ($res['json']['error'] ?? '') : '';
        if ($err === 'invalid_grant') {
            return ['ok' => true, 'message' => 'المفتاح يعمل: قبلت Apple التوقيع للتطبيق ' . self::clientId() . '.'];
        }
        if ($err === 'invalid_client') {
            return ['ok' => false, 'message' => 'خوادم Apple متاحة، لكنها رفضت المفتاح (invalid_client): تأكد من Key ID و Team ID ومن تفعيل Sign in with Apple للمفتاح وللمعرّف ' . self::clientId() . '.'];
        }
        return ['ok' => false, 'message' => 'ردّ غير متوقع من Apple (HTTP ' . $res['status'] . ($err !== '' ? ', ' . $err : '') . ').'];
    }
}
