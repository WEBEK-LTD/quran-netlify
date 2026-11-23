<?php
declare(strict_types=1);

/**
 * Renders every email the site sends, in all six languages, to storage/mail/preview/<email>-<lang>.html
 * (+ .txt), without sending and without a database. Images and fonts load from api/public/email/.
 *
 *   php api/tests/email-preview.php                 # write the previews
 *   php api/tests/email-preview.php --shots=/dir    # also screenshot a representative set (Node + Playwright):
 *                                                   # verify + welcome in every language at 600px light,
 *                                                   # every email in ur and en at 375px dark
 *   php api/tests/email-preview.php --shots=/dir --all   # every email × language × 600/375 × light/dark
 *   --nastaliq=/path/NotoNastaliqUrdu.woff          # preview Urdu as on phones that have this font
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$api = dirname(__DIR__);
require $api . '/app/bootstrap.php';

use NQ\Core\Config;
use NQ\Core\Mailer;
use NQ\Core\MailText;

$opt = getopt('', ['shots::', 'all', 'nastaliq::']);
// Optional: a Noto Nastaliq Urdu font file (.woff/.ttf) to simulate devices that ship it (iOS, macOS,
// Android); only injected into the preview files, never into real emails.
$nastaliq = isset($opt['nastaliq']) && is_file((string) $opt['nastaliq']) ? realpath((string) $opt['nastaliq']) : null;
Config::init($api, ['site_url' => 'https://nuralquran.net', 'api_url' => 'https://api.nuralquran.net', 'mail_from' => 'no-reply@nuralquran.net']);
Mailer::usePreview('file://' . $api . '/public/email');

$token = str_repeat('3f9a', 16);
$site = Config::siteUrl();
$names = ['ar' => ['عبد الرحمن', 'مريم'], 'en' => ['Yusuf', 'Maryam'], 'tr' => ['Yusuf', 'Meryem'], 'fr' => ['Youssef', 'Myriam'], 'ur' => ['عبد الرحمٰن', 'مریم'], 'id' => ['Yusuf', 'Maryam']];
$reply = "وعليكم السلام ورحمة الله وبركاته،\nشكراً لتواصلك معنا. تم إصلاح مشكلة تشغيل التلاوة في صفحة القارئ، ويمكنك الآن الاستماع إلى السورة كاملة دون انقطاع. <b>هذا النص يجب أن يظهر كما هو</b> " . str_repeat('نص إضافي للتجربة ', 12);

$dir = Config::storageDir('mail/preview');
foreach (glob($dir . '/*.{html,txt}', GLOB_BRACE) ?: [] as $old) {
    unlink($old);
}
$max = 0;
foreach (MailText::LANGS as $lang) {
    [$n1, $n2] = $names[$lang];
    $emails = [
        'verify' => Mailer::verificationMessage($n1, $site . '/auth/callback?type=verify&token=' . $token, $lang),
        'reset' => Mailer::resetMessage($n2, $site . '/reset-password?token=' . $token, $lang),
        'welcome' => Mailer::welcomeMessage($n1, $lang),
        'password-changed' => Mailer::passwordChangedMessage($n2, 'change', gmmktime(14, 5, 0, 11, 23, 2026), $lang),
        'password-reset-done' => Mailer::passwordChangedMessage($n2, 'reset', gmmktime(9, 30, 0, 11, 23, 2026), $lang),
        'team-reply' => Mailer::teamMessage($n1, 'مشكلة في تشغيل التلاوة', $reply, false, $lang),
        'team-message' => Mailer::teamMessage($n1, 'Group khatma update', 'Assalamu alaikum, we added a new way to follow your group khatma and would love your feedback.', true, $lang),
        'test' => Mailer::testMessage($n1, $lang, 'SMTP — mail.nuralquran.net'),
    ];
    foreach ($emails as $name => [$subject, $opts]) {
        [$text, $html] = Mailer::render($opts);
        $previewHtml = $html;
        if ($nastaliq !== null && $lang === 'ur') {
            $previewHtml = str_replace('</head>', "<style>@font-face{font-family:'Noto Nastaliq Urdu';font-weight:400 700;src:url(file://{$nastaliq})}</style></head>", $html);
        }
        file_put_contents($dir . "/{$name}-{$lang}.html", $previewHtml);
        file_put_contents($dir . "/{$name}-{$lang}.txt", 'Subject: ' . $subject . "\n\n" . $text);
        $max = max($max, strlen($html));
        printf("%-20s %-3s %5.1f KB  %s\n", $name, $lang, strlen($html) / 1024, $subject);
        if (strlen($html) > 90 * 1024) {
            fwrite(STDERR, "  ! {$name}-{$lang}.html is close to Gmail's 102 KB clipping limit\n");
        }
        if (str_contains($text . $html, $token) && !in_array($name, ['verify', 'reset'], true)) {
            fwrite(STDERR, "  ! token leaked into {$name}-{$lang}\n");
        }
    }
}
printf("largest: %.1f KB → %s\n", $max / 1024, $dir);

if (isset($opt['shots'])) {
    $out = (string) $opt['shots'] ?: sys_get_temp_dir() . '/email-shots';
    $jobs = [];
    foreach (glob($dir . '/*.html') ?: [] as $f) {
        $b = basename($f, '.html');
        [$email, $lang] = [substr($b, 0, -3), substr($b, -2)];
        foreach ([600, 375] as $w) {
            foreach (['light', 'dark'] as $scheme) {
                $wanted = isset($opt['all'])
                    || ($w === 600 && $scheme === 'light' && in_array($email, ['verify', 'welcome'], true))
                    || ($w === 375 && $scheme === 'dark' && in_array($lang, ['ur', 'en'], true));
                if ($wanted) {
                    $jobs[] = ['file' => $f, 'width' => $w, 'scheme' => $scheme, 'out' => "{$email}-{$w}-{$scheme}-{$lang}.png"];
                }
            }
        }
    }
    $jobFile = $dir . '/shots.json';
    file_put_contents($jobFile, json_encode($jobs));
    passthru('node ' . escapeshellarg($api . '/tools/screenshot-emails.js') . ' ' . escapeshellarg($jobFile) . ' ' . escapeshellarg($out), $code);
    exit($code);
}
