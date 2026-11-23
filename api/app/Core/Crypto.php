<?php
declare(strict_types=1);

namespace NQ\Core;

final class Crypto
{
    /** Unambiguous alphabet for room codes (no 0/O, 1/I/L). */
    public const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    /** 32 random bytes as 64 hex chars (session / email / oauth tokens). */
    public static function token(): string
    {
        return bin2hex(random_bytes(32));
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function equals(string $known, string $user): bool
    {
        return hash_equals($known, $user);
    }

    public static function randomCode(int $length = 7, string $alphabet = self::CODE_ALPHABET): string
    {
        $max = strlen($alphabet) - 1;
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[random_int(0, $max)];
        }
        return $out;
    }

    /** AES-256-GCM. Returns base64(iv[12] | tag[16] | ciphertext). */
    public static function encrypt(string $plaintext, ?string $key = null): string
    {
        $key ??= Config::appKey();
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($ct === false) {
            throw new \RuntimeException('encryption failed');
        }
        return base64_encode($iv . $tag . $ct);
    }

    public static function decrypt(string $encoded, ?string $key = null): ?string
    {
        $key ??= Config::appKey();
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 28) {
            return null;
        }
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $ct = substr($raw, 28);
        $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        return $pt === false ? null : $pt;
    }
}
