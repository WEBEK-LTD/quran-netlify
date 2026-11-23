<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Compact JWTs in pure PHP (openssl only):
 *   HS256 — LiveKit access tokens, LiveKit server-API tokens and webhook verification;
 *   RS256 — the Google service-account assertion exchanged for an FCM HTTP v1 access token;
 *   ES256 — the APNs provider token (.p8 key). openssl returns a DER ECDSA signature; JOSE wants raw r‖s (64 bytes).
 */
final class Jwt
{
    public static function b64u(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function b64uDecode(string $s): ?string
    {
        if ($s === '' || preg_match('/[^A-Za-z0-9_-]/', $s)) {
            return $s === '' ? '' : null;
        }
        $pad = strlen($s) % 4;
        $raw = base64_decode(strtr($s, '-_', '+/') . ($pad ? str_repeat('=', 4 - $pad) : ''), true);
        return $raw === false ? null : $raw;
    }

    /**
     * @param array<string,mixed> $claims
     * @param string $key HS256: the shared secret; RS256/ES256: a PEM private key
     * @param array<string,mixed> $header extra header fields (e.g. kid)
     */
    public static function encode(array $claims, string $alg, string $key, array $header = []): string
    {
        $head = self::b64u((string) json_encode(['alg' => $alg, 'typ' => 'JWT'] + $header, JSON_UNESCAPED_SLASHES));
        $body = self::b64u((string) json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $input = $head . '.' . $body;
        return $input . '.' . self::b64u(self::sign($input, $alg, $key));
    }

    public static function sign(string $input, string $alg, string $key): string
    {
        if ($alg === 'HS256') {
            return hash_hmac('sha256', $input, $key, true);
        }
        if ($alg !== 'RS256' && $alg !== 'ES256') {
            throw new \InvalidArgumentException('unsupported alg ' . $alg);
        }
        $pk = openssl_pkey_get_private($key);
        if ($pk === false) {
            throw new \RuntimeException('invalid private key for ' . $alg);
        }
        $sig = '';
        if (!openssl_sign($input, $sig, $pk, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('openssl_sign failed');
        }
        return $alg === 'ES256' ? self::derToRaw($sig, 32) : $sig;
    }

    /** DER SEQUENCE{INTEGER r, INTEGER s} → r‖s, each left-padded to $len bytes. */
    public static function derToRaw(string $der, int $len): string
    {
        $pos = 0;
        $readLen = static function () use ($der, &$pos): int {
            $l = ord($der[$pos++]);
            if ($l & 0x80) {
                $n = $l & 0x7f;
                $l = 0;
                for ($i = 0; $i < $n; $i++) {
                    $l = ($l << 8) | ord($der[$pos++]);
                }
            }
            return $l;
        };
        if (ord($der[$pos++] ?? "\0") !== 0x30) {
            throw new \RuntimeException('bad DER signature');
        }
        $readLen();
        $out = '';
        for ($k = 0; $k < 2; $k++) {
            if (ord($der[$pos++] ?? "\0") !== 0x02) {
                throw new \RuntimeException('bad DER integer');
            }
            $l = $readLen();
            $int = ltrim(substr($der, $pos, $l), "\0");
            $pos += $l;
            if (strlen($int) > $len) {
                throw new \RuntimeException('DER integer too long');
            }
            $out .= str_pad($int, $len, "\0", STR_PAD_LEFT);
        }
        return $out;
    }

    /** r‖s → DER (used by the tests to check an ES256 signature with openssl_verify). */
    public static function rawToDer(string $raw): string
    {
        $half = intdiv(strlen($raw), 2);
        $enc = static function (string $i): string {
            $i = ltrim($i, "\0");
            if ($i === '' || (ord($i[0]) & 0x80)) {
                $i = "\0" . $i;
            }
            return "\x02" . chr(strlen($i)) . $i;
        };
        $seq = $enc(substr($raw, 0, $half)) . $enc(substr($raw, $half));
        return "\x30" . chr(strlen($seq)) . $seq;
    }

    /**
     * Verify an HS256 token and its time claims; returns the claims or null.
     * @return array<string,mixed>|null
     */
    public static function decodeHs256(string $jwt, string $secret, int $leeway = 60): ?array
    {
        $parts = explode('.', trim($jwt));
        if (count($parts) !== 3 || $secret === '') {
            return null;
        }
        $head = json_decode((string) self::b64uDecode($parts[0]), true);
        if (!is_array($head) || ($head['alg'] ?? '') !== 'HS256') {
            return null;
        }
        $sig = self::b64uDecode($parts[2]);
        if ($sig === null || !hash_equals(hash_hmac('sha256', $parts[0] . '.' . $parts[1], $secret, true), $sig)) {
            return null;
        }
        $claims = json_decode((string) self::b64uDecode($parts[1]), true);
        if (!is_array($claims)) {
            return null;
        }
        $now = time();
        if (isset($claims['exp']) && is_numeric($claims['exp']) && (int) $claims['exp'] < $now - $leeway) {
            return null;
        }
        if (isset($claims['nbf']) && is_numeric($claims['nbf']) && (int) $claims['nbf'] > $now + $leeway) {
            return null;
        }
        return $claims;
    }

    /** The claims of a token without verifying it (tests / logging only). @return array<string,mixed>|null */
    public static function peek(string $jwt): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        $c = json_decode((string) self::b64uDecode($parts[1]), true);
        return is_array($c) ? $c : null;
    }
}
