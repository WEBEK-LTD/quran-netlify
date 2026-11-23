<?php
// Noor Al-Quran API — configuration template.
// install.php writes the real file (config.php, next to this one, outside public_html) with 0600 permissions.
// Never commit config.php.
return [
    'db' => [
        'host' => 'localhost',
        'name' => 'nuralqur_quran',
        'user' => 'nuralqur_api',
        'pass' => 'CHANGE-ME',
        'charset' => 'utf8mb4',
    ],
    // base64 of 32 random bytes — encrypts integration secrets. Changing it makes stored secrets unreadable.
    'app_key' => 'base64-of-32-random-bytes',
    'site_url' => 'https://nuralquran.net',
    'api_url' => 'https://api.nuralquran.net',
    'cookie_domain' => '.nuralquran.net',
    'cors_origins' => [
        'https://nuralquran.net',
        'https://www.nuralquran.net',
        'https://nur-alquran.netlify.app',
        'capacitor://localhost',
        'https://localhost',
        'http://localhost:3000',
        'http://localhost:5173',
    ],
    'mail_from' => 'no-reply@nuralquran.net',
    // 'mail' = PHP mail() (exim). 'log' = write messages to storage/mail/mail.log (local testing only).
    'mail_transport' => 'mail',
    // true only behind a reverse proxy/CDN you control (then the client IP is read from X-Forwarded-For).
    'trust_proxy' => false,
];
