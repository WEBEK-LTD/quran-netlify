<?php
declare(strict_types=1);

namespace NQ\Core;

/** Sends Arabic emails (plain text + simple HTML) via PHP mail(). */
final class Mailer
{
    public static function send(string $to, string $subject, string $text, string $html): bool
    {
        $to = trim($to);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to)) {
            return false;
        }
        $fromAddr = Integrations::get('mail_from_address') ?: (string) Config::get('mail_from');
        if (!filter_var($fromAddr, FILTER_VALIDATE_EMAIL)) {
            $fromAddr = 'no-reply@nuralquran.net';
        }
        $fromName = Integrations::get('mail_from_name') ?: (string) Settings::get('app_name');
        $fromName = str_replace(["\r", "\n", '"'], '', $fromName);

        $boundary = 'nq_' . bin2hex(random_bytes(12));
        $headers = [
            'From' => self::encodeHeader($fromName) . ' <' . $fromAddr . '>',
            'Reply-To' => $fromAddr,
            'MIME-Version' => '1.0',
            'Content-Type' => 'multipart/alternative; boundary="' . $boundary . '"',
            'X-Mailer' => 'NurAlQuran',
        ];
        $body = "--{$boundary}\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($text)) . "\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html)) . "\r\n"
            . "--{$boundary}--\r\n";

        if (Config::get('mail_transport') === 'log') {
            $dir = Config::storageDir('mail');
            $entry = json_encode([
                'to' => $to, 'from' => $fromAddr, 'subject' => $subject, 'text' => $text, 'time' => gmdate('c'),
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return file_put_contents($dir . '/mail.log', $entry . "\n", FILE_APPEND | LOCK_EX) !== false;
        }

        $ok = @mail($to, self::encodeHeader($subject), $body, $headers, '-f' . $fromAddr);
        if (!$ok) {
            error_log('[nq] mail() failed for a message to ' . substr(hash('sha256', $to), 0, 12));
        }
        return $ok;
    }

    private static function encodeHeader(string $s): string
    {
        return '=?UTF-8?B?' . base64_encode($s) . '?=';
    }

    /** Build a simple RTL email with a call-to-action link. @return array{0:string,1:string} [text, html] */
    public static function template(string $greeting, string $intro, ?string $buttonText, ?string $url, string $outro): array
    {
        $app = (string) Settings::get('app_name');
        $text = $greeting . "\n\n" . $intro . "\n\n" . ($url ? $url . "\n\n" : '') . $outro . "\n\n— " . $app;
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $btn = $url && $buttonText
            ? '<p style="margin:24px 0"><a href="' . $e($url) . '" style="background:#1f7a4d;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">' . $e($buttonText) . '</a></p>'
              . '<p style="font-size:13px;color:#666">إن لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span style="direction:ltr;unicode-bidi:embed;word-break:break-all">' . $e($url) . '</span></p>'
            : '';
        $html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>'
            . '<body style="font-family:Tahoma,Arial,sans-serif;background:#f6f6f2;margin:0;padding:24px">'
            . '<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px;direction:rtl;text-align:right;line-height:1.8">'
            . '<h2 style="color:#1f7a4d;margin-top:0">' . $e($app) . '</h2>'
            . '<p>' . $e($greeting) . '</p><p>' . nl2br($e($intro)) . '</p>' . $btn
            . '<p>' . nl2br($e($outro)) . '</p></div></body></html>';
        return [$text, $html];
    }

    public static function sendVerification(string $to, string $name, string $token): bool
    {
        $url = Config::siteUrl() . '/auth/callback?type=verify&token=' . rawurlencode($token);
        [$text, $html] = self::template(
            'السلام عليكم ' . $name . '،',
            'شكراً لتسجيلك. لتأكيد بريدك الإلكتروني اضغط على الرابط التالي (صالح لمدة 24 ساعة):',
            'تأكيد البريد الإلكتروني',
            $url,
            'إن لم تقم بإنشاء حساب، تجاهل هذه الرسالة.'
        );
        return self::send($to, 'تأكيد البريد الإلكتروني — ' . Settings::get('app_name'), $text, $html);
    }

    public static function sendReset(string $to, string $name, string $token): bool
    {
        $url = Config::siteUrl() . '/reset-password?token=' . rawurlencode($token);
        [$text, $html] = self::template(
            'السلام عليكم ' . $name . '،',
            'وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. اضغط على الرابط التالي لاختيار كلمة مرور جديدة (صالح لمدة ساعة واحدة):',
            'إعادة تعيين كلمة المرور',
            $url,
            'إن لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.'
        );
        return self::send($to, 'إعادة تعيين كلمة المرور — ' . Settings::get('app_name'), $text, $html);
    }
}
