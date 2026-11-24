<?php
declare(strict_types=1);

namespace NQ\Core;

/** Third-party integration settings. Every value is encrypted at rest (AES-256-GCM). */
final class Integrations
{
    /** key => [label, secret] */
    public const KEYS = [
        'google_client_id'     => ['معرّف عميل Google (Client ID)', false],
        'google_client_secret' => ['السر السري لعميل Google (Client Secret)', true],
        'ai_provider'          => ['مزوّد المساعد (openai أو anthropic)', false],
        'ai_model'             => ['نموذج المساعد (اختياري)', false],
        'openai_api_key'       => ['مفتاح OpenAI', true],
        'anthropic_api_key'    => ['مفتاح Anthropic', true],
        'mail_from_address'    => ['عنوان البريد المُرسِل', false],
        'mail_from_name'       => ['اسم المُرسِل في البريد', false],
        'mail_transport'       => ['طريقة إرسال البريد', false],          // server (default, PHP mail()) | smtp
        'smtp_host'            => ['خادم SMTP', false],
        'smtp_port'            => ['منفذ SMTP', false],
        'smtp_username'        => ['اسم مستخدم SMTP', false],
        'smtp_password'        => ['كلمة مرور SMTP', true],
        'smtp_encryption'      => ['تشفير SMTP', false],                 // tls (STARTTLS, 587) | ssl (465) | none
        // Voice rooms (self-hosted LiveKit, deploy/livekit/)
        'livekit_url'          => ['عنوان خادم LiveKit للتطبيق (wss://rtc.nuralquran.net:7443)', false],
        'livekit_api_url'      => ['عنوان LiveKit للخادم (اختياري، مثل http://127.0.0.1:7880)', false],
        'livekit_api_key'      => ['مفتاح LiveKit ‏(API Key)', false],
        'livekit_api_secret'   => ['السر السري لـ LiveKit ‏(API Secret)', true],
        // Push notifications
        'fcm_service_account'  => ['حساب خدمة Firebase (محتوى ملف JSON) لإشعارات أندرويد', true],
        'apns_key_p8'          => ['مفتاح Apple Push ‏(.p8)', true],
        'apns_key_id'          => ['معرّف مفتاح APNs ‏(Key ID)', false],
        'apns_team_id'         => ['معرّف فريق Apple ‏(Team ID)', false],
        'apns_bundle_id'       => ['معرّف تطبيق iOS ‏(Bundle ID)', false],
        'apns_environment'     => ['بيئة APNs ‏(production أو sandbox)', false],
        // Sign in with Apple (iOS app): without the key sign-in still works; the key lets account deletion revoke Apple's token
        'apple_signin_client_id' => ['معرّف التطبيق لتسجيل الدخول بـ Apple ‏(افتراضياً net.nuralquran.app)', false],
        'apple_signin_team_id' => ['معرّف فريق Apple ‏(Team ID)', false],
        'apple_signin_key_id'  => ['معرّف مفتاح Sign in with Apple ‏(Key ID)', false],
        'apple_signin_key_p8'  => ['مفتاح Sign in with Apple ‏(.p8)', true],
    ];

    /** Values that may be long and span several lines (pasted files), with their maximum length. */
    public const MULTILINE = ['fcm_service_account' => 12000, 'apns_key_p8' => 4000, 'apple_signin_key_p8' => 4000];

    /** @var array<string,string>|null */
    private static ?array $cache = null;

    /** @return array<string,string> */
    private static function load(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $out = [];
        foreach (Db::all('SELECT name, value_encrypted FROM integrations') as $row) {
            $pt = Crypto::decrypt((string) $row['value_encrypted']);
            if ($pt !== null && $pt !== '') {
                $out[(string) $row['name']] = $pt;
            }
        }
        return self::$cache = $out;
    }

    public static function get(string $key): string
    {
        return self::load()[$key] ?? '';
    }

    public static function set(string $key, string $value): void
    {
        if ($value === '') {
            Db::exec('DELETE FROM integrations WHERE name = ?', [$key]);
        } else {
            Db::exec(
                'INSERT INTO integrations (name, value_encrypted, updated_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE value_encrypted = VALUES(value_encrypted), updated_at = VALUES(updated_at)',
                [$key, Crypto::encrypt($value), Db::now()]
            );
        }
        self::$cache = null;
    }

    /** Public listing: secrets are never returned, only a masked preview. @return list<array<string,mixed>> */
    public static function listing(): array
    {
        $vals = self::load();
        $items = [];
        foreach (self::KEYS as $key => [$label, $secret]) {
            $v = $vals[$key] ?? '';
            $item = [
                'key' => $key,
                'label' => $label,
                'set' => $v !== '',
                'preview' => $v === '' ? null : ($secret ? self::mask($v) : $v),
                'secret' => $secret,
            ];
            if (!$secret) {
                $item['value'] = $v; // non-secret settings are returned in full; secrets never are
            }
            $items[] = $item;
        }
        return $items;
    }

    public static function mask(string $v): string
    {
        $len = strlen($v);
        if ($len >= 12) {
            return substr($v, 0, 3) . '…' . substr($v, -4);
        }
        return '••••' . ($len >= 8 ? substr($v, -2) : '');
    }

    public static function googleConfigured(): bool
    {
        return self::get('google_client_id') !== '' && self::get('google_client_secret') !== '';
    }
}
