<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Branded emails (HTML + plain text) in the user's language, sent through the host's mail()
 * or an SMTP server.
 *
 * Every message is built from one layout (render()) so all emails look the same: the gold-framed
 * card, the header banner, the ayah box and the footer. Wording lives in MailText (ar, en, tr, fr,
 * ur, id); ar/ur are right-to-left. Images and web fonts are served by the API host from
 * api/public/email/ (images rendered by api/tools/render-email-assets.js, fonts = the site's fonts).
 */
final class Mailer
{
    private const ASSET_VERSION = '2';
    /** The site's fonts first (Apple Mail, iOS, Samsung, Outlook for Mac load them); system fallbacks after. */
    private const FONT_TITLE = "'NQ Kufi','Reem Kufi','Segoe UI',Tahoma,Arial,sans-serif";
    private const FONT_BODY = "'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif";
    private const FONT_URDU = "'Noto Nastaliq Urdu','Jameel Noori Nastaleeq','Segoe UI',Tahoma,Arial,sans-serif";
    private const FONT_AYAH = "'Amiri Quran','Amiri','Traditional Arabic',serif";
    private const DEFAULT_APP_NAME = 'نور القرآن';

    private const RANGE_ARABIC = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
    private const RANGE_LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
    private const RANGE_LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

    private static string $lastError = '';
    private static ?string $assetBase = null;
    private static bool $preview = false;

    // ── Sending ──────────────────────────────────────────────────────────────

    /** Arabic reason of the last failed send (empty when the last send succeeded). */
    public static function lastError(): string
    {
        return self::$lastError;
    }

    /** 'smtp' or 'server' (PHP mail()). config.php mail_transport=log (tests) takes priority in send(). */
    public static function transport(): string
    {
        return self::setting('mail_transport') === 'smtp' ? 'smtp' : 'server';
    }

    /** @return array{0:string,1:string} [address, display name] */
    public static function sender(string $lang = MailText::DEFAULT): array
    {
        $addr = self::setting('mail_from_address') ?: (string) Config::get('mail_from');
        if (!filter_var($addr, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>"]/', $addr)) {
            $addr = 'no-reply@nuralquran.net';
        }
        $name = self::setting('mail_from_name') ?: self::appName($lang);
        $name = trim(str_replace(["\r", "\n", '"'], '', $name));
        return [$addr, $name];
    }

    public static function send(string $to, string $subject, string $text, string $html, string $lang = MailText::DEFAULT): bool
    {
        self::$lastError = '';
        $to = trim($to);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/', $to)) {
            self::$lastError = 'عنوان المستلم غير صالح.';
            return false;
        }
        $subject = trim(str_replace(["\r", "\n"], ' ', $subject));
        [$fromAddr, $fromName] = self::sender($lang);

        if (Config::get('mail_transport') === 'log') {
            $dir = Config::storageDir('mail');
            $entry = json_encode([
                'to' => $to, 'from' => $fromAddr, 'lang' => $lang, 'subject' => $subject, 'text' => $text,
                'html_bytes' => strlen($html), 'time' => gmdate('c'),
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return file_put_contents($dir . '/mail.log', $entry . "\n", FILE_APPEND | LOCK_EX) !== false;
        }

        $domain = substr((string) strrchr($fromAddr, '@'), 1);
        $boundary = 'nq_' . bin2hex(random_bytes(12));
        $headers = [
            'From' => self::encodeHeader($fromName, ' ') . ' <' . $fromAddr . '>',
            'Reply-To' => $fromAddr,
            'Date' => date('r'),
            'Message-ID' => '<' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version' => '1.0',
            'Content-Language' => $lang,
            'Content-Type' => 'multipart/alternative; boundary="' . $boundary . '"',
            'Auto-Submitted' => 'auto-generated',
            'X-Mailer' => 'NurAlQuran',
        ];
        $body = "--{$boundary}\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($text)) . "\r\n"
            . "--{$boundary}\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html)) . "\r\n"
            . "--{$boundary}--\r\n";

        if (self::transport() === 'smtp') {
            $smtp = Smtp::fromIntegrations();
            if ($smtp === null) {
                self::$lastError = 'اخترت الإرسال عبر SMTP لكن لم يتم إدخال عنوان خادم SMTP.';
                return false;
            }
            $raw = 'To: <' . $to . ">\r\n"
                . 'Subject: ' . self::encodeHeader($subject, "\r\n ") . "\r\n";
            foreach ($headers as $k => $v) {
                $raw .= $k . ': ' . $v . "\r\n";
            }
            $raw .= "\r\n" . $body;
            try {
                $smtp->send($fromAddr, $to, $raw, $domain);
                return true;
            } catch (\RuntimeException $e) {
                self::$lastError = $e->getMessage();
                error_log('[nq] smtp send failed: ' . $e->getMessage());
                return false;
            }
        }

        $ok = @mail($to, self::encodeHeader($subject, ' '), $body, $headers, '-f' . $fromAddr);
        if (!$ok) {
            self::$lastError = 'رفضت دالة mail() في الاستضافة إرسال الرسالة. تحقق من إعدادات البريد في الاستضافة، أو استخدم SMTP.';
            error_log('[nq] mail() failed for a message to ' . substr(hash('sha256', $to), 0, 12));
        }
        return $ok;
    }

    /** RFC 2047 encoded-words (≤75 chars each, split on character boundaries), joined by $sep. */
    private static function encodeHeader(string $s, string $sep): string
    {
        if (!preg_match('/[^\x20-\x7E]/', $s)) {
            return $s;
        }
        $words = [];
        $chunk = '';
        foreach (mb_str_split($s) as $ch) {
            if (strlen($chunk . $ch) > 45) {
                $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
                $chunk = '';
            }
            $chunk .= $ch;
        }
        if ($chunk !== '') {
            $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
        }
        return implode($sep, $words);
    }

    /** @param array{0:string,1:array<string,mixed>} $msg [subject, render options] */
    private static function deliver(string $to, array $msg): bool
    {
        [$text, $html] = self::render($msg[1]);
        return self::send($to, $msg[0], $text, $html, MailText::lang($msg[1]['lang'] ?? null));
    }

    // ── Messages ─────────────────────────────────────────────────────────────
    // Each *Message() returns [subject, render options] so previews can render without sending.

    public static function sendVerification(string $to, string $name, string $token, string $lang = MailText::DEFAULT): bool
    {
        return self::deliver($to, self::verificationMessage($name, Config::siteUrl() . '/auth/callback?type=verify&token=' . rawurlencode($token), $lang));
    }

    public static function sendReset(string $to, string $name, string $token, string $lang = MailText::DEFAULT): bool
    {
        return self::deliver($to, self::resetMessage($name, Config::siteUrl() . '/reset-password?token=' . rawurlencode($token), $lang));
    }

    public static function sendWelcome(string $to, string $name, string $lang = MailText::DEFAULT): bool
    {
        return self::deliver($to, self::welcomeMessage($name, $lang));
    }

    /** $via: 'change' (from the account settings) or 'reset' (through a reset link). */
    public static function sendPasswordChanged(string $to, string $name, string $via, string $lang = MailText::DEFAULT, ?int $time = null): bool
    {
        return self::deliver($to, self::passwordChangedMessage($name, $via, $time ?? time(), $lang));
    }

    /** $newThread: the team started the conversation (true) or replied to the user's ticket (false). */
    public static function sendTeamMessage(string $to, string $name, string $subject, string $body, bool $newThread, string $lang = MailText::DEFAULT): bool
    {
        return self::deliver($to, self::teamMessage($name, $subject, $body, $newThread, $lang));
    }

    public static function sendTest(string $to, string $name, string $lang = MailText::DEFAULT): bool
    {
        return self::deliver($to, self::testMessage($name, $lang));
    }

    /**
     * Wording helper for one email: $t('verify.title') with {app} filled in for the language.
     * @return \Closure(string, array<string,string>=):string
     */
    private static function tr(string $lang): \Closure
    {
        $app = self::appName($lang);
        return static fn (string $key, array $vars = []): string => MailText::t($lang, $key, $vars + ['app' => $app]);
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function verificationMessage(string $name, string $url, string $lang = MailText::DEFAULT): array
    {
        $lang = MailText::lang($lang);
        $t = self::tr($lang);
        return [$t('verify.subject'), [
            'lang' => $lang,
            'preheader' => $t('verify.preheader'),
            'title' => $t('verify.title'),
            'greeting' => self::greeting($name, $lang),
            'paragraphs' => [$t('verify.p1')],
            'button' => [$t('verify.button'), $url],
            'show_link' => true,
            'after' => [$t('verify.after')],
            'ayah' => 'taha114',
            'notice' => $t('verify.notice'),
            'reason' => $t('verify.reason'),
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function resetMessage(string $name, string $url, string $lang = MailText::DEFAULT): array
    {
        $lang = MailText::lang($lang);
        $t = self::tr($lang);
        return [$t('reset.subject'), [
            'lang' => $lang,
            'preheader' => $t('reset.preheader'),
            'title' => $t('reset.title'),
            'greeting' => self::greeting($name, $lang),
            'paragraphs' => [$t('reset.p1')],
            'button' => [$t('reset.button'), $url],
            'show_link' => true,
            'after' => [$t('reset.after')],
            'ayah' => 'talaq3',
            'notice' => $t('reset.notice'),
            'reason' => $t('reset.reason'),
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function welcomeMessage(string $name, string $lang = MailText::DEFAULT): array
    {
        $lang = MailText::lang($lang);
        $t = self::tr($lang);
        $site = Config::siteUrl();
        return [$t('welcome.subject'), [
            'lang' => $lang,
            'preheader' => $t('welcome.preheader'),
            'title' => $t('welcome.title'),
            'greeting' => self::greeting($name, $lang),
            'paragraphs' => [$t('welcome.p1'), $t('welcome.p2')],
            'list' => [
                [$t('welcome.l1t'), $t('welcome.l1d'), $site . '/reader'],
                [$t('welcome.l2t'), $t('welcome.l2d'), $site . '/prayer-times'],
                [$t('welcome.l3t'), $t('welcome.l3d'), $site . '/khatma-group'],
            ],
            'button' => [$t('welcome.button'), $site . '/reader'],
            'ayah' => 'isra9',
            'reason' => $t('welcome.reason'),
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function passwordChangedMessage(string $name, string $via, int $time, string $lang = MailText::DEFAULT): array
    {
        $lang = MailText::lang($lang);
        $t = self::tr($lang);
        $when = MailText::date($lang, $time);
        return [$t('pwd.subject'), [
            'lang' => $lang,
            'preheader' => $t('pwd.preheader', ['date' => $when]),
            'title' => $t('pwd.title'),
            'greeting' => self::greeting($name, $lang),
            'paragraphs' => [$t($via === 'reset' ? 'pwd.intro_reset' : 'pwd.intro_change')],
            'highlight' => ['label' => $t('pwd.time_label'), 'text' => $when . "\n" . $t('c.utc')],
            'after_highlight' => [$t('pwd.ok'), $t('pwd.notme')],
            'button' => [$t('pwd.button'), Config::siteUrl() . '/login?view=forgot'],
            'ayah' => 'yusuf64',
            'notice' => $t('pwd.notice'),
            'reason' => $t('pwd.reason'),
        ]];
    }

    /**
     * The admin's subject and text are shown exactly as written (escaped); only the template is translated.
     * @return array{0:string,1:array<string,mixed>}
     */
    public static function teamMessage(string $name, string $subject, string $body, bool $newThread, string $lang = MailText::DEFAULT): array
    {
        $lang = MailText::lang($lang);
        $t = self::tr($lang);
        $subject = self::clip(trim($subject), 120);
        $excerpt = self::clip(trim((string) preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $body))), 300);
        $oneLine = self::clip((string) preg_replace('/\s+/u', ' ', $excerpt), 110);
        return [$t($newThread ? 'team.subject_new' : 'team.subject_reply', ['subject' => self::clip($subject, 70)]), [
            'lang' => $lang,
            'preheader' => $oneLine,
            'title' => $t($newThread ? 'team.title_new' : 'team.title_reply'),
            'greeting' => self::greeting($name, $lang),
            'paragraphs' => [$t($newThread ? 'team.intro_new' : 'team.intro_reply')],
            'highlight' => ['label' => $t('team.subject_label'), 'title' => $subject, 'text' => $excerpt, 'auto_dir' => true],
            'after_highlight' => [$t('team.after')],
            'button' => [$t('team.button'), Config::siteUrl() . '/support'],
            'ayah' => 'maidah2',
            'notice' => $t('team.notice'),
            'reason' => $t('team.reason'),
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function testMessage(string $name, string $lang = MailText::DEFAULT, ?string $transportLabel = null): array
    {
        $lang = MailText::lang($lang);
        $t = self::tr($lang);
        [$addr, $from] = self::sender($lang);
        if ($transportLabel === null) {
            $transportLabel = self::transport() === 'smtp' ? 'SMTP — ' . (self::setting('smtp_host') ?: '?') : $t('test.via_server');
        }
        return [$t('test.subject'), [
            'lang' => $lang,
            'preheader' => $t('test.preheader'),
            'title' => $t('test.title'),
            'greeting' => self::greeting($name, $lang),
            'paragraphs' => [$t('test.p1'), $t('test.p2')],
            'highlight' => ['label' => $t('test.details'), 'text' => $t('test.via', ['via' => $transportLabel]) . "\n"
                . $t('test.from', ['from' => $from . ' — ' . $addr]) . "\n" . $t('test.time', ['date' => MailText::date($lang, time())])],
            'button' => [$t('test.button'), Config::siteUrl() . '/'],
            'ayah' => 'sad29',
            'notice' => $t('test.notice'),
            'reason' => $t('test.reason'),
        ]];
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    /**
     * Render one email in the shared premium layout.
     * Options: lang, preheader, title, greeting, paragraphs (list), highlight {label?, title?, text, auto_dir?},
     * after_highlight (list), list (list of [title, description, url]), code, button [text, url],
     * show_link (bool: print the button URL under it), after (list), ayah (id in MailText),
     * notice, reason (footer line: why the user got this email).
     * @param array<string,mixed> $o
     * @return array{0:string,1:string} [plain text, html]
     */
    public static function render(array $o): array
    {
        $lang = MailText::lang($o['lang'] ?? null);
        $rtl = MailText::isRtl($lang);
        $dir = $rtl ? 'rtl' : 'ltr';
        $align = $rtl ? 'right' : 'left';
        $start = $align;                       // the side lines start on
        $end = $rtl ? 'left' : 'right';
        $ur = $lang === 'ur';
        $font = $ur ? self::FONT_URDU : self::FONT_BODY;
        $tfont = self::FONT_TITLE;
        $lh = $ur ? '2.3' : '1.9';
        $fs = $ur ? '17px' : '16px';

        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $br = static fn (string $s): string => nl2br($e($s), false);
        $t = self::tr($lang);
        $app = self::appName($lang);
        $site = Config::siteUrl();
        $title = (string) ($o['title'] ?? $app);
        $p = static fn (string $s): string => '<p class="nq-text nq-p" style="margin:0 0 16px;font-family:' . $font . ';font-size:' . $fs . ';line-height:' . $lh . ';color:#2B2B2B;text-align:' . $align . ';">' . $br($s) . '</p>';
        $lists = static fn (string $k): array => array_values(array_filter(array_map('strval', (array) ($o[$k] ?? [])), static fn (string $s): bool => $s !== ''));
        $table = '<table role="presentation" dir="' . $dir . '" width="100%" cellpadding="0" cellspacing="0" border="0"';
        $divider = static fn (string $pad): string => $table . '><tr><td align="center" style="padding:' . $pad . ';font-size:0;line-height:0;">'
            . '<img src="' . $e(self::asset('divider.png')) . '" width="240" height="24" alt="" style="display:block;width:240px;max-width:100%;height:auto;border:0;outline:none;"></td></tr></table>';

        $txt = [];   // plain-text lines
        $h = '';     // card body html

        $txt[] = $app;
        $txt[] = str_repeat('═', 24);
        $txt[] = $title;
        $txt[] = '';
        $h .= '<h1 class="nq-h1" style="margin:0 0 6px;font-family:' . $tfont . ';font-size:26px;line-height:1.5;font-weight:bold;color:#0F4A33;text-align:center;">' . $e($title) . '</h1>';
        $h .= $divider('6px 0 22px');

        if (($o['greeting'] ?? '') !== '') {
            $txt[] = (string) $o['greeting'];
            $txt[] = '';
            $h .= '<p class="nq-text" style="margin:0 0 14px;font-family:' . $font . ';font-size:17px;line-height:' . $lh . ';font-weight:bold;color:#13201A;text-align:' . $align . ';">' . $e((string) $o['greeting']) . '</p>';
        }
        foreach ($lists('paragraphs') as $para) {
            $txt[] = $para;
            $txt[] = '';
            $h .= $p($para);
        }

        if (is_array($o['highlight'] ?? null)) {
            $hl = $o['highlight'];
            // admin-written text keeps its own direction (dir="auto"); template text follows the language
            $userDir = !empty($hl['auto_dir']) ? ' dir="auto"' : '';
            $inner = '';
            if (($hl['label'] ?? '') !== '') {
                $txt[] = '【' . $hl['label'] . '】';
                $inner .= '<div class="nq-gold" style="font-family:' . $font . ';font-size:13px;line-height:1.7;font-weight:bold;color:#8C6A1E;margin:0 0 4px;">' . $e((string) $hl['label']) . '</div>';
            }
            if (($hl['title'] ?? '') !== '') {
                $txt[] = (string) $hl['title'];
                $inner .= '<div class="nq-text"' . $userDir . ' style="font-family:' . self::FONT_BODY . ';font-size:17px;line-height:1.7;font-weight:bold;color:#13201A;margin:0 0 6px;">' . $e((string) $hl['title']) . '</div>';
            }
            if (($hl['text'] ?? '') !== '') {
                $txt[] = (string) $hl['text'];
                $inner .= '<div class="nq-text"' . $userDir . ' style="font-family:' . ($userDir !== '' ? self::FONT_BODY : $font) . ';font-size:15px;line-height:' . $lh . ';color:#2B2B2B;">' . $br((string) $hl['text']) . '</div>';
            }
            $txt[] = '';
            $h .= $table . ' style="margin:4px 0 20px;"><tr>'
                . '<td class="nq-box" style="background:#F8F2E2;border:1px solid #E8D7AA;border-' . $start . ':4px solid #B8893A;border-radius:8px;padding:16px 20px;text-align:' . $align . ';">'
                . $inner . '</td></tr></table>';
        }
        foreach ($lists('after_highlight') as $para) {
            $txt[] = $para;
            $txt[] = '';
            $h .= $p($para);
        }

        if (is_array($o['list'] ?? null) && $o['list'] !== []) {
            $arrow = $rtl ? '&#8592;' : '&#8594;';
            $rows = '';
            $n = count($o['list']);
            foreach (array_values($o['list']) as $i => $item) {
                [$it, $desc, $url] = array_map('strval', array_pad(array_values((array) $item), 3, ''));
                $txt[] = ($i + 1) . '. ' . $it . ' — ' . $desc;
                if ($url !== '') {
                    $txt[] = '   ' . $url;
                }
                $last = $i === $n - 1;
                $sep = $last ? '' : 'border-bottom:1px solid #EFE5CC;';
                $cls = $last ? '' : ' class="nq-rule"';
                $label = $url !== ''
                    ? '<a class="nq-link" href="' . $e($url) . '" target="_blank" style="color:#0F4A33;text-decoration:none;font-weight:bold;">' . $e($it) . '&nbsp;' . $arrow . '</a>'
                    : $e($it);
                $rows .= '<tr>'
                    . '<td' . $cls . ' width="46" valign="top" style="padding:14px 0;padding-' . $end . ':12px;' . $sep . '">'
                    . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="nq-badge" width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#0F3324;border:1px solid #B8893A;border-radius:17px;font-family:' . self::FONT_BODY . ';font-size:15px;font-weight:bold;line-height:34px;color:#F0D89A;text-align:center;">' . MailText::digits($lang, (string) ($i + 1)) . '</td></tr></table>'
                    . '</td>'
                    . '<td' . $cls . ' valign="top" style="padding:12px 0;text-align:' . $align . ';' . $sep . '">'
                    . '<div class="nq-text" style="font-family:' . $font . ';font-size:16px;line-height:1.8;font-weight:bold;color:#0F4A33;">' . $label . '</div>'
                    . '<div class="nq-muted" style="font-family:' . $font . ';font-size:14px;line-height:' . ($ur ? '2.2' : '1.8') . ';color:#5A5A52;">' . $e($desc) . '</div>'
                    . '</td></tr>';
            }
            $txt[] = '';
            $h .= $table . ' style="margin:0 0 8px;">' . $rows . '</table>';
        }

        if (($o['code'] ?? '') !== '') {
            $code = (string) $o['code'];
            $txt[] = $code;
            $txt[] = '';
            $h .= $table . ' style="margin:6px 0 20px;"><tr><td align="center">'
                . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="nq-box" dir="ltr" style="background:#F8F2E2;border:1px dashed #B8893A;border-radius:10px;padding:14px 28px;font-family:Consolas,\'Courier New\',monospace;font-size:28px;letter-spacing:6px;font-weight:bold;color:#0F4A33;text-align:center;">'
                . $e($code) . '</td></tr></table></td></tr></table>';
        }

        if (is_array($o['button'] ?? null) && count($o['button']) === 2) {
            [$bt, $bu] = array_map('strval', array_values($o['button']));
            $txt[] = $bt . ':';
            $txt[] = $bu;
            $txt[] = '';
            $h .= self::button($bt, $bu, $dir, $font);
            if (!empty($o['show_link'])) {
                $h .= '<p class="nq-muted" style="margin:0 0 18px;font-family:' . $font . ';font-size:12px;line-height:' . ($ur ? '2.2' : '1.8') . ';color:#7A7A70;text-align:center;">' . $e($t('c.fallback')) . '<br>'
                    . '<a class="nq-link" href="' . $e($bu) . '" target="_blank" dir="ltr" style="font-family:' . self::FONT_BODY . ';color:#8C6A1E;text-decoration:underline;word-break:break-all;direction:ltr;unicode-bidi:embed;">' . $e($bu) . '</a></p>';
            }
        }
        foreach ($lists('after') as $para) {
            $txt[] = $para;
            $txt[] = '';
            $h .= '<p class="nq-muted" style="margin:0 0 14px;font-family:' . $font . ';font-size:14px;line-height:' . $lh . ';color:#5A5A52;text-align:center;">' . $br($para) . '</p>';
        }

        if (is_string($o['ayah'] ?? null) && $o['ayah'] !== '') {
            $a = MailText::ayah((string) $o['ayah'], $lang);
            $txt[] = '﴿' . $a['text'] . '﴾ [' . $a['ref'] . ']';
            $meaningHtml = '';
            if ($a['meaning'] !== null) {
                $txt[] = $a['meaning'];
                $txt[] = '(' . $a['source'] . ')';
                $meaningHtml = '<div dir="' . $dir . '" style="font-family:' . $font . ';font-size:14px;line-height:' . ($ur ? '2.2' : '1.75') . ';color:#E3D6B2;margin-top:12px;padding-top:10px;border-top:1px solid #3E5A3E;">' . $e($a['meaning']) . '</div>'
                    . '<div dir="' . $dir . '" style="font-family:' . $font . ';font-size:12px;line-height:1.7;color:#A99A6E;margin-top:4px;">' . $e($a['source']) . '</div>';
            }
            $txt[] = '';
            $h .= $divider('8px 0 18px');
            $h .= $table . ' style="margin:0 0 24px;"><tr>'
                . '<td class="nq-ayah" style="background:#0F3324;border:1px solid #B8893A;border-radius:12px;padding:4px;">'
                . $table . '><tr>'
                . '<td style="border:1px solid #6F5A2C;border-radius:9px;padding:18px 22px 16px;text-align:center;">'
                . '<div class="nq-ayah-t" dir="rtl" lang="ar" style="font-family:' . self::FONT_AYAH . ';font-size:27px;line-height:2;color:#F0D89A;">﴿&nbsp;' . $e($a['text']) . '&nbsp;﴾</div>'
                . '<div dir="rtl" style="font-family:' . self::FONT_BODY . ';font-size:13px;line-height:1.6;color:#C9B27A;">[' . $e($a['ref']) . ']</div>'
                . $meaningHtml
                . '</td></tr></table></td></tr></table>';
        }

        $txt[] = $t('c.signoff');
        $txt[] = $t('c.team');
        $h .= '<p class="nq-text" style="margin:0;font-family:' . $font . ';font-size:15px;line-height:' . $lh . ';color:#2B2B2B;text-align:' . $align . ';">' . $e($t('c.signoff'))
            . '<br><strong class="nq-sign" style="font-family:' . $tfont . ';font-size:18px;color:#0F4A33;">' . $e($t('c.team')) . '</strong></p>';

        if (($o['notice'] ?? '') !== '') {
            $txt[] = '';
            $txt[] = '— ' . $o['notice'];
            $h .= $table . ' style="margin:22px 0 0;"><tr>'
                . '<td class="nq-rule" style="border-top:1px solid #EADFC2;padding:16px 0 0;font-family:' . $font . ';font-size:13px;line-height:' . ($ur ? '2.2' : '1.8') . ';color:#7A7A70;text-align:' . $align . ';">'
                . '<span class="nq-muted" style="color:#7A7A70;">' . $br((string) $o['notice']) . '</span></td></tr></table>';
        }

        $reason = (string) ($o['reason'] ?? '');
        $txt[] = '';
        $txt[] = str_repeat('─', 24);
        $txt[] = $t('c.tagline');
        $txt[] = $t('c.site') . ': ' . $site . '/';
        $txt[] = $t('c.support') . ': ' . $site . '/support';
        $txt[] = $t('c.privacy') . ': ' . $site . '/privacy';
        if ($reason !== '') {
            $txt[] = $reason;
        }
        $text = implode("\n", $txt) . "\n";

        $pre = $e((string) ($o['preheader'] ?? ''));
        $link = static fn (string $label, string $url): string => '<a href="' . $e($url) . '" target="_blank" style="color:#D6B267;text-decoration:none;">' . $e($label) . '</a>';
        $dot = '<span style="color:#5E6F64;">&nbsp;&nbsp;•&nbsp;&nbsp;</span>';
        $brand = MailText::brand($lang);

        $html = '<!DOCTYPE html>'
            . '<html lang="' . $lang . '" dir="' . $dir . '" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
            . '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">'
            . '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">'
            . '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">'
            . '<title>' . $e($title) . '</title>'
            . '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>'
            // Outlook for Windows ignores web fonts and would fall back to Times: force the system stack there
            . '<style>body,table,td,p,a,div,span,h1,strong,center{font-family:\'Segoe UI\',Tahoma,Arial,sans-serif!important}</style><![endif]-->'
            . self::fontFaces()
            . '<style>'
            . 'body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}'
            . 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}'
            . '@media only screen and (max-width:620px){.nq-outer{padding:12px 6px!important}.nq-card{padding:6px!important}.nq-pad{padding:28px 18px 24px!important}'
            . '.nq-h1{font-size:23px!important}.nq-ayah-t{font-size:23px!important}.nq-foot{padding:26px 18px!important}}'
            . '@media (prefers-color-scheme:dark){.nq-body,.nq-bg{background:#060D0A!important}.nq-card{background:#0E1C16!important;border-color:#2A3A31!important}'
            . '.nq-frame{border-color:#9C7A35!important}.nq-frame2{border-color:#4A3E22!important}.nq-text,.nq-p{color:#F1EBDC!important}.nq-h1,.nq-sign{color:#F0D89A!important}'
            . '.nq-muted{color:#A9B6AC!important}.nq-gold{color:#D6B267!important}.nq-link{color:#F0D89A!important}.nq-box{background:#132A20!important;border-color:#3D4A34!important}'
            . '.nq-ayah{background:#08140F!important}.nq-rule{border-color:#2A3A31!important}}'
            . '</style>'
            // Outlook.com dark mode (kept in its own block so clients that reject attribute selectors keep the one above)
            . '<style>[data-ogsc] .nq-text,[data-ogsc] .nq-p{color:#F1EBDC!important}[data-ogsc] .nq-h1{color:#F0D89A!important}[data-ogsc] .nq-muted{color:#A9B6AC!important}[data-ogsc] .nq-link{color:#F0D89A!important}</style>'
            . '</head>'
            . '<body class="nq-body" dir="' . $dir . '" style="margin:0;padding:0;background:#EEEAE0;">'
            . '<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEEAE0;opacity:0;">'
            . $pre . str_repeat('&#8199;&#65279;&#847; ', 40) . '</div>'
            . '<table role="presentation" class="nq-bg" dir="' . $dir . '" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEEAE0;">'
            . '<tr><td align="center" class="nq-outer" style="padding:28px 12px;">'
            . '<!--[if mso]><table role="presentation" dir="' . $dir . '" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->'
            . $table . ' style="width:100%;max-width:600px;margin:0 auto;">'
            // header banner
            . '<tr><td align="center" style="background:#060D0A;border-radius:14px 14px 0 0;font-size:0;line-height:0;">'
            . '<a href="' . $e($site . '/') . '" target="_blank" style="text-decoration:none;">'
            . '<img src="' . $e(self::asset('header.png')) . '" width="600" height="200" alt="' . $e($brand) . '" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;border-radius:14px 14px 0 0;font-family:' . $tfont . ';font-size:28px;line-height:200px;color:#D6B267;text-align:center;background:#060D0A;">'
            . '</a></td></tr>'
            // gold double-framed card
            . '<tr><td class="nq-card" style="background:#FFFDF8;padding:10px;border-left:1px solid #E2D6B8;border-right:1px solid #E2D6B8;">'
            . $table . '><tr>'
            . '<td class="nq-frame" style="border:1px solid #C9A55A;border-radius:6px;padding:3px;">'
            . $table . '><tr>'
            . '<td class="nq-frame2 nq-pad" dir="' . $dir . '" style="border:1px solid #EADBB2;border-radius:4px;padding:34px 40px 30px;text-align:' . $align . ';">'
            . $h
            . '</td></tr></table></td></tr></table></td></tr>'
            // footer band
            . '<tr><td class="nq-foot" align="center" style="background:#0B1F17;border-radius:0 0 14px 14px;padding:30px 28px;border-top:2px solid #B8893A;">'
            . '<a href="' . $e($site . '/') . '" target="_blank" style="text-decoration:none;"><img src="' . $e(self::asset('footer-mark.png')) . '" width="48" height="48" alt="' . $e($brand) . '" style="display:block;margin:0 auto 12px;width:48px;height:48px;border:0;font-family:' . $font . ';font-size:13px;color:#D6B267;"></a>'
            . '<p style="margin:0 0 10px;font-family:' . $tfont . ';font-size:16px;line-height:1.8;font-weight:bold;color:#F0D89A;text-align:center;">' . $e($t('c.tagline')) . '</p>'
            . '<p style="margin:0 0 14px;font-family:' . $font . ';font-size:14px;line-height:1.9;text-align:center;">'
            . $link($t('c.site'), $site . '/') . $dot . $link($t('c.support'), $site . '/support') . $dot . $link($t('c.privacy'), $site . '/privacy') . '</p>'
            . ($reason !== '' ? '<p style="margin:0;font-family:' . $font . ';font-size:12px;line-height:' . ($ur ? '2.2' : '1.8') . ';color:#A9B6AC;text-align:center;">' . $e($reason) . '</p>' : '')
            . '</td></tr>'
            . '</table>'
            . '<!--[if mso]></td></tr></table><![endif]-->'
            . '</td></tr></table></body></html>';

        return [$text, $html];
    }

    /**
     * @font-face rules for the site's fonts, inside @media screen so Outlook for Windows skips them.
     * In their own <style> block: clients that drop @font-face (Gmail) keep the other styles.
     */
    private static function fontFaces(): string
    {
        $faces = [
            // [family, weight, file prefix, subsets]
            ['NQ Kufi', '100 900', 'reem-kufi-%s-600-normal', ['arabic', 'latin', 'latin-ext']],
            ['IBM Plex Sans Arabic', '400', 'ibm-plex-sans-arabic-%s-400-normal', ['arabic', 'latin', 'latin-ext']],
            ['IBM Plex Sans Arabic', '700', 'ibm-plex-sans-arabic-%s-700-normal', ['arabic', 'latin', 'latin-ext']],
            ['Amiri Quran', '400', 'amiri-quran-%s-400-normal', ['arabic', 'latin']],
        ];
        $ranges = ['arabic' => self::RANGE_ARABIC, 'latin' => self::RANGE_LATIN, 'latin-ext' => self::RANGE_LATIN_EXT];
        $css = '';
        foreach ($faces as [$family, $weight, $file, $subsets]) {
            foreach ($subsets as $sub) {
                $base = 'fonts/' . sprintf($file, $sub);
                $css .= "@font-face{font-family:'" . $family . "';font-style:normal;font-weight:" . $weight . ';font-display:swap;'
                    . 'src:url(' . self::asset($base . '.woff2') . ") format('woff2'),url(" . self::asset($base . '.woff') . ") format('woff');"
                    . 'unicode-range:' . $ranges[$sub] . '}';
            }
        }
        return '<style>@media screen{' . $css . '}</style>';
    }

    /** Bulletproof button: padded link in a coloured cell, plus a VML round rectangle for Outlook (Windows). */
    private static function button(string $text, string $url, string $dir, string $font): string
    {
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $w = max(220, min(520, mb_strlen($text) * 11 + 96));
        return '<table role="presentation" dir="' . $dir . '" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px;"><tr><td align="center">'
            . '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' . $e($url) . '" style="height:52px;v-text-anchor:middle;width:' . $w . 'px;" arcsize="20%" strokecolor="#9C7A35" fillcolor="#B8893A">'
            . '<w:anchorlock/><center style="color:#ffffff;font-family:Tahoma,Arial,sans-serif;font-size:18px;font-weight:bold;">' . $e($text) . '</center></v:roundrect><![endif]-->'
            . '<!--[if !mso]><!-->'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td align="center" bgcolor="#B8893A" style="border-radius:10px;background:#B8893A;background-image:linear-gradient(180deg,#C99A47 0%,#B8893A 55%,#A77A2E 100%);border:1px solid #9C7A35;box-shadow:0 2px 0 #8A6A2C;">'
            . '<a href="' . $e($url) . '" target="_blank" style="display:inline-block;padding:15px 40px;font-family:' . $font . ';font-size:18px;line-height:26px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;">'
            . $e($text) . '</a></td></tr></table>'
            . '<!--<![endif]-->'
            . '</td></tr></table>';
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Local previews: load images and fonts from another base URL (e.g. file://…/api/public/email) and skip the database. */
    public static function usePreview(string $assetBase): void
    {
        self::$assetBase = rtrim($assetBase, '/');
        self::$preview = true;
    }

    private static function asset(string $file): string
    {
        if (self::$assetBase !== null) {
            return self::$assetBase . '/' . $file;
        }
        // Served by the API host itself (api/public/email/), so emails show their images
        // as soon as the API is deployed, independent of the frontend.
        return Config::apiUrl() . '/email/' . $file . '?v=' . self::ASSET_VERSION;
    }

    /** Integration setting; previews run without a database. */
    private static function setting(string $key): string
    {
        return self::$preview ? '' : Integrations::get($key);
    }

    /** Site name in the email's language, unless the admin gave the site another name. */
    private static function appName(string $lang): string
    {
        $n = '';
        if (!self::$preview) {
            try {
                $n = trim((string) Settings::get('app_name'));
            } catch (\Throwable) {
                $n = '';
            }
        }
        return $n === '' || $n === self::DEFAULT_APP_NAME ? MailText::brand($lang) : $n;
    }

    /**
     * Salutation with the user's name. Names are user-chosen and some emails go to an address the
     * signer-up typed, so a name that looks like a link or an address is left out.
     */
    private static function greeting(string $name, string $lang): string
    {
        $name = trim((string) preg_replace('/\s+/u', ' ', $name));
        if ($name === '' || preg_match('~(://|www\.|@|\.[a-z]{2,}\b)~iu', $name)) {
            return MailText::t($lang, 'c.greet');
        }
        return MailText::t($lang, 'c.greet_name', ['name' => self::clip($name, 40)]);
    }

    /** Shorten to $max characters, preferring to cut at a word boundary. */
    private static function clip(string $s, int $max): string
    {
        if (mb_strlen($s) <= $max) {
            return $s;
        }
        $cut = mb_substr($s, 0, $max - 1);
        $space = mb_strrpos($cut, ' ');
        if ($space !== false && $space > $max * 0.7) {
            $cut = mb_substr($cut, 0, $space);
        }
        return rtrim($cut, " \n\t،,.") . '…';
    }
}
