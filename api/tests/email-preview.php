<?php
declare(strict_types=1);

/**
 * Renders every email the site sends to storage/mail/preview/*.html (+ .txt), without sending
 * and without a database. Images load from the local public/brand/email/ folder.
 *
 *   php api/tests/email-preview.php                 # write the previews
 *   php api/tests/email-preview.php --shots=/dir    # also screenshot them (needs Node + Playwright):
 *                                                   # 600px and 375px wide, light and dark
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$api = dirname(__DIR__);
require $api . '/app/bootstrap.php';

use NQ\Core\Config;
use NQ\Core\Mailer;

$opt = getopt('', ['shots::']);
Config::init($api, ['site_url' => 'https://nuralquran.net', 'mail_from' => 'no-reply@nuralquran.net']);
Mailer::usePreview('file://' . dirname($api) . '/public/brand/email');

$token = str_repeat('3f9a', 16);
$site = Config::siteUrl();
$emails = [
    'verify' => Mailer::verificationMessage('عبد الرحمن', $site . '/auth/callback?type=verify&token=' . $token),
    'reset' => Mailer::resetMessage('مريم', $site . '/reset-password?token=' . $token),
    'welcome' => Mailer::welcomeMessage('عبد الرحمن'),
    'password-changed' => Mailer::passwordChangedMessage('مريم', 'change', gmmktime(14, 5, 0, 11, 23, 2026)),
    'password-reset-done' => Mailer::passwordChangedMessage('مريم', 'reset', gmmktime(9, 30, 0, 11, 23, 2026)),
    'team-reply' => Mailer::teamMessage('خالد', 'مشكلة في تشغيل التلاوة', "وعليكم السلام ورحمة الله وبركاته،\nشكراً لتواصلك معنا. تم إصلاح مشكلة تشغيل التلاوة في صفحة القارئ، ويمكنك الآن الاستماع إلى السورة كاملة دون انقطاع. إن استمرت المشكلة فأخبرنا باسم المتصفح ونوع الجهاز حتى نتابعها معك، جزاك الله خيراً. <b>هذا النص يجب أن يظهر كما هو</b> " . str_repeat('نص إضافي للتجربة ', 12), false),
    'team-message' => Mailer::teamMessage('خالد', 'تحديث مهم في الختمة الجماعية', 'السلام عليكم، أضفنا ميزة جديدة لمتابعة الختمة الجماعية، ونودّ معرفة رأيك فيها.', true),
    'test' => Mailer::testMessage('المشرف', 'SMTP — mail.nuralquran.net'),
];

$dir = Config::storageDir('mail/preview');
foreach (glob($dir . '/*.{html,txt}', GLOB_BRACE) ?: [] as $old) {
    unlink($old);
}
foreach ($emails as $name => [$subject, $opts]) {
    [$text, $html] = Mailer::render($opts);
    // show the subject above the message, like a mail client would
    file_put_contents($dir . "/{$name}.html", str_replace('<body ', '<!-- subject: ' . htmlspecialchars($subject) . ' --><body data-subject="' . htmlspecialchars($subject, ENT_QUOTES) . '" ', $html));
    file_put_contents($dir . "/{$name}.txt", 'Subject: ' . $subject . "\n\n" . $text);
    printf("%-22s %6.1f KB  %s\n", $name, strlen($html) / 1024, $subject);
    if (strlen($html) > 90 * 1024) {
        fwrite(STDERR, "  ! {$name}.html is close to Gmail's 102 KB clipping limit\n");
    }
    if (str_contains($text . $html, $token) && !in_array($name, ['verify', 'reset'], true)) {
        fwrite(STDERR, "  ! token leaked into {$name}\n");
    }
}
echo "→ {$dir}\n";

if (isset($opt['shots'])) {
    $out = (string) $opt['shots'] ?: sys_get_temp_dir() . '/email-shots';
    passthru('node ' . escapeshellarg($api . '/tools/screenshot-emails.js') . ' ' . escapeshellarg($dir) . ' ' . escapeshellarg($out), $code);
    exit($code);
}
