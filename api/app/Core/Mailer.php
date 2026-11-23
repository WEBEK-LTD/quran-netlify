<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Branded Arabic emails (HTML + plain text) sent through the host's mail() or an SMTP server.
 *
 * Every message is built from one layout (render()) so all emails look the same: the gold-framed
 * card, the header banner, the ayah box and the footer. Images are PNGs served by the frontend
 * at <site_url>/brand/email/ (rendered by api/tools/render-email-assets.js).
 */
final class Mailer
{
    private const ASSET_VERSION = '1';
    private const FONT = "'Segoe UI',Tahoma,Arial,sans-serif";
    private const BRAND = 'نور القرآن';

    private static string $lastError = '';
    private static ?string $assetBase = null;
    private static ?string $appNameOverride = null;

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
    public static function sender(): array
    {
        $addr = self::setting('mail_from_address') ?: (string) Config::get('mail_from');
        if (!filter_var($addr, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>"]/', $addr)) {
            $addr = 'no-reply@nuralquran.net';
        }
        $name = self::setting('mail_from_name') ?: self::appName();
        $name = trim(str_replace(["\r", "\n", '"'], '', $name));
        return [$addr, $name];
    }

    public static function send(string $to, string $subject, string $text, string $html): bool
    {
        self::$lastError = '';
        $to = trim($to);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/', $to)) {
            self::$lastError = 'عنوان المستلم غير صالح.';
            return false;
        }
        $subject = trim(str_replace(["\r", "\n"], ' ', $subject));
        [$fromAddr, $fromName] = self::sender();

        if (Config::get('mail_transport') === 'log') {
            $dir = Config::storageDir('mail');
            $entry = json_encode([
                'to' => $to, 'from' => $fromAddr, 'subject' => $subject, 'text' => $text,
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
        return self::send($to, $msg[0], $text, $html);
    }

    // ── Messages ─────────────────────────────────────────────────────────────
    // Each *Message() returns [subject, render options] so previews can render without sending.

    public static function sendVerification(string $to, string $name, string $token): bool
    {
        return self::deliver($to, self::verificationMessage($name, Config::siteUrl() . '/auth/callback?type=verify&token=' . rawurlencode($token)));
    }

    public static function sendReset(string $to, string $name, string $token): bool
    {
        return self::deliver($to, self::resetMessage($name, Config::siteUrl() . '/reset-password?token=' . rawurlencode($token)));
    }

    public static function sendWelcome(string $to, string $name): bool
    {
        return self::deliver($to, self::welcomeMessage($name));
    }

    /** $via: 'change' (from the account settings) or 'reset' (through a reset link). */
    public static function sendPasswordChanged(string $to, string $name, string $via, ?int $time = null): bool
    {
        return self::deliver($to, self::passwordChangedMessage($name, $via, $time ?? time()));
    }

    /** $newThread: the team started the conversation (true) or replied to the user's ticket (false). */
    public static function sendTeamMessage(string $to, string $name, string $subject, string $body, bool $newThread): bool
    {
        return self::deliver($to, self::teamMessage($name, $subject, $body, $newThread));
    }

    public static function sendTest(string $to, string $name): bool
    {
        return self::deliver($to, self::testMessage($name));
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function verificationMessage(string $name, string $url): array
    {
        return ['أكِّد بريدك الإلكتروني — ' . self::appName(), [
            'preheader' => 'خطوة أخيرة لتفعيل حسابك في ' . self::appName() . ': أكِّد بريدك الإلكتروني.',
            'title' => 'تأكيد البريد الإلكتروني',
            'greeting' => self::greeting($name),
            'paragraphs' => [
                'شكراً لانضمامك إلى ' . self::appName() . '. بقيت خطوة واحدة لتفعيل حسابك، وهي تأكيد بريدك الإلكتروني؛ حتى نحمي حسابك ونتمكّن من مراسلتك عند الحاجة.',
            ],
            'button' => ['تأكيد البريد الإلكتروني', $url],
            'show_link' => true,
            'after' => ['الرابط صالح لمدة ٢٤ ساعة، ويُستخدم مرة واحدة فقط.'],
            'ayah' => ['وَقُل رَّبِّ زِدْنِي عِلْمًا', 'طه: ١١٤'],
            'notice' => 'إن لم تُنشئ حساباً في ' . self::appName() . ' فتجاهل هذه الرسالة، ولن يُؤكَّد هذا البريد.',
            'reason' => 'وصلتك هذه الرسالة لأن هذا البريد استُخدم لإنشاء حساب في ' . self::appName() . '.',
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function resetMessage(string $name, string $url): array
    {
        return ['إعادة تعيين كلمة المرور — ' . self::appName(), [
            'preheader' => 'رابط اختيار كلمة مرور جديدة لحسابك، صالح لمدة ساعة واحدة.',
            'title' => 'إعادة تعيين كلمة المرور',
            'greeting' => self::greeting($name),
            'paragraphs' => [
                'وصلنا طلبٌ لإعادة تعيين كلمة المرور لحسابك في ' . self::appName() . '. لاختيار كلمة مرور جديدة اضغط على الزر أدناه.',
            ],
            'button' => ['اختيار كلمة مرور جديدة', $url],
            'show_link' => true,
            'after' => ['الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة فقط. وبعد تغيير كلمة المرور يُسجَّل خروج حسابك من جميع الأجهزة احتياطاً.'],
            'ayah' => ['وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', 'الطلاق: ٣'],
            'notice' => 'إن لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة مرورك كما هي. لا تشارك هذا الرابط مع أحد؛ فريقنا لن يطلبه منك أبداً.',
            'reason' => 'وصلتك هذه الرسالة لأن طلباً لإعادة تعيين كلمة المرور أُرسل لحساب مرتبط بهذا البريد.',
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function welcomeMessage(string $name): array
    {
        $site = Config::siteUrl();
        return ['أهلاً بك في ' . self::appName(), [
            'preheader' => 'حسابك جاهز. ثلاث بدايات طيبة لرحلتك مع كتاب الله.',
            'title' => 'أهلاً بك في ' . self::appName(),
            'greeting' => self::greeting($name),
            'paragraphs' => [
                'تمّ تفعيل حسابك بنجاح، والحمد لله الذي بنعمته تتمّ الصالحات. نسأل الله أن يجعل القرآن ربيع قلبك ونور صدرك.',
                self::appName() . ' موقعٌ مجاني لوجه الله، بلا إعلانات. وهذه ثلاث بدايات طيبة:',
            ],
            'list' => [
                ['اقرأ القرآن الكريم', 'مصحف واضح بالرسم العثماني، ويحفظ موضع قراءتك لتكمل من حيث توقفت.', $site . '/reader'],
                ['مواقيت الصلاة', 'مواقيت الصلاة لمدينتك، ومعها في الموقع اتجاه القبلة والأذكار.', $site . '/prayer-times'],
                ['الختمة الجماعية', 'أنشئ ختمة مع أهلك وأصدقائك، ووزّعوا الأجزاء بينكم، وتابعوا التقدّم معاً.', $site . '/khatma-group'],
            ],
            'button' => ['ابدأ القراءة', $site . '/reader'],
            'ayah' => ['إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ', 'الإسراء: ٩'],
            'reason' => 'وصلتك هذه الرسالة لأنك فعّلت حسابك في ' . self::appName() . '. لن نرسل إليك رسائل دعائية.',
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function passwordChangedMessage(string $name, string $via, int $time): array
    {
        $when = self::arabicDate($time);
        $intro = $via === 'reset'
            ? 'نُعلمك بأنه تمّ تعيين كلمة مرور جديدة لحسابك في ' . self::appName() . ' عبر رابط إعادة التعيين، وسُجِّل خروج حسابك من جميع الأجهزة احتياطاً.'
            : 'نُعلمك بأنه تمّ تغيير كلمة المرور لحسابك في ' . self::appName() . ' من صفحة الإعدادات، وسُجِّل خروج حسابك من الأجهزة الأخرى احتياطاً.';
        return ['تم تغيير كلمة المرور — ' . self::appName(), [
            'preheader' => 'تنبيه أمني: تم تغيير كلمة مرور حسابك يوم ' . $when . '.',
            'title' => 'تم تغيير كلمة المرور',
            'greeting' => self::greeting($name),
            'paragraphs' => [$intro],
            'highlight' => ['label' => 'وقت التغيير', 'text' => $when . "\n" . 'بالتوقيت العالمي (UTC)'],
            'after_highlight' => [
                'إن كنت أنت من قام بذلك فلا حاجة لأي إجراء، وجزاك الله خيراً على حرصك على أمان حسابك.',
                'وإن لم تكن أنت، فأعد تعيين كلمة المرور فوراً من الزر أدناه، ثم راسلنا عبر صفحة الدعم.',
            ],
            'button' => ['إعادة تعيين كلمة المرور الآن', Config::siteUrl() . '/login?view=forgot'],
            'ayah' => ['فَاللَّهُ خَيْرٌ حَافِظًا وَهُوَ أَرْحَمُ الرَّاحِمِينَ', 'يوسف: ٦٤'],
            'notice' => 'لأمانك: لن يطلب منك فريق ' . self::appName() . ' كلمة مرورك أبداً، لا عبر البريد ولا غيره.',
            'reason' => 'وصلتك هذه الرسالة لأنها تنبيه أمني يخص حسابك، ويُرسل عند كل تغيير لكلمة المرور.',
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function teamMessage(string $name, string $subject, string $body, bool $newThread): array
    {
        $subject = self::clip(trim($subject), 120);
        $excerpt = self::clip(trim((string) preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $body))), 300);
        $oneLine = self::clip((string) preg_replace('/\s+/u', ' ', $excerpt), 110);
        return [($newThread ? 'رسالة من فريق ' . self::appName() : 'ردّ جديد من فريق الدعم') . ': ' . self::clip($subject, 70), [
            'preheader' => $oneLine,
            'title' => $newThread ? 'رسالة من فريق ' . self::appName() : 'ردّ جديد من فريق الدعم',
            'greeting' => self::greeting($name),
            'paragraphs' => [$newThread
                ? 'أرسل إليك فريق ' . self::appName() . ' رسالة جديدة عبر حسابك في الموقع:'
                : 'ردّ فريق الدعم على رسالتك. هذا مقتطف من الرد:'],
            'highlight' => ['label' => 'الموضوع', 'title' => $subject, 'text' => $excerpt],
            'after_highlight' => ['لقراءة الرسالة كاملة والرد عليها، افتح صفحة الدعم في حسابك.'],
            'button' => ['عرض الرسالة والرد', Config::siteUrl() . '/support'],
            'ayah' => ['وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَىٰ', 'المائدة: ٢'],
            'notice' => 'للرد استخدم صفحة الدعم في الموقع، حتى تبقى المحادثة كاملة في مكان واحد.',
            'reason' => 'وصلتك هذه الرسالة لأن فريق ' . self::appName() . ' راسلك عبر حسابك في الموقع.',
        ]];
    }

    /** @return array{0:string,1:array<string,mixed>} */
    public static function testMessage(string $name, ?string $transportLabel = null): array
    {
        [$addr, $from] = self::sender();
        if ($transportLabel === null) {
            $transportLabel = 'خادم الموقع (mail)';
            if (self::transport() === 'smtp') {
                $transportLabel = 'SMTP — ' . (self::setting('smtp_host') ?: '؟');
            }
        }
        return ['رسالة تجريبية — ' . self::appName(), [
            'preheader' => 'إعدادات البريد تعمل. هكذا تبدو الرسائل التي تصل إلى المستخدمين.',
            'title' => 'رسالة تجريبية',
            'greeting' => self::greeting($name),
            'paragraphs' => [
                'إن وصلتك هذه الرسالة فإعدادات البريد في ' . self::appName() . ' تعمل بنجاح، والحمد لله.',
                'وهي نموذج كامل لتصميم الرسائل التي تصل إلى المستخدمين: الترويسة، والنص، والزر، وإطار الآية، والتذييل.',
            ],
            'highlight' => ['label' => 'تفاصيل الإرسال', 'text' => 'طريقة الإرسال: ' . $transportLabel . "\n" . 'المُرسِل: ' . $from . ' — ' . $addr . "\n" . 'الوقت: ' . self::arabicDate(time())],
            'button' => ['زيارة ' . self::appName(), Config::siteUrl() . '/'],
            'ayah' => ['كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَدَّبَّرُوا آيَاتِهِ', 'ص: ٢٩'],
            'notice' => 'هذه رسالة تجريبية أُرسلت من لوحة الإدارة، ولا تحتاج إلى رد.',
            'reason' => 'وصلتك هذه الرسالة لأنك ضغطت زر «اختبار» في إعدادات البريد بلوحة الإدارة.',
        ]];
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    /**
     * Render one email in the shared premium layout.
     * Options: preheader, title, greeting, paragraphs (list), highlight {label?, title?, text},
     * after_highlight (list), list (list of [title, description, url]), code, button [text, url],
     * show_link (bool: print the button URL under it), after (list), ayah [text, reference],
     * notice, reason (footer line: why the user got this email).
     * @param array<string,mixed> $o
     * @return array{0:string,1:string} [plain text, html]
     */
    public static function render(array $o): array
    {
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $br = static fn (string $s): string => nl2br($e($s), false);
        $app = self::appName();
        $site = Config::siteUrl();
        $title = (string) ($o['title'] ?? $app);
        $font = self::FONT;
        $p = static fn (string $s): string => '<p class="nq-text nq-p" style="margin:0 0 16px;font-family:' . $font . ';font-size:16px;line-height:1.9;color:#2B2B2B;text-align:right;">' . $br($s) . '</p>';
        $lists = static fn (string $k): array => array_values(array_filter(array_map('strval', (array) ($o[$k] ?? [])), static fn (string $s): bool => $s !== ''));

        $t = [];   // plain-text lines
        $h = '';   // card body html

        $t[] = $app;
        $t[] = str_repeat('═', 24);
        $t[] = $title;
        $t[] = '';
        $h .= '<h1 class="nq-h1" style="margin:0 0 6px;font-family:' . $font . ';font-size:25px;line-height:1.5;font-weight:bold;color:#0F4A33;text-align:center;">' . $e($title) . '</h1>';
        $divider = static fn (string $pad): string => '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:' . $pad . ';font-size:0;line-height:0;">'
            . '<img src="' . $e(self::asset('divider.png')) . '" width="240" height="24" alt="" style="display:block;width:240px;max-width:100%;height:auto;border:0;outline:none;"></td></tr></table>';
        $h .= $divider('6px 0 22px');

        if (($o['greeting'] ?? '') !== '') {
            $t[] = (string) $o['greeting'];
            $t[] = '';
            $h .= '<p class="nq-text" style="margin:0 0 14px;font-family:' . $font . ';font-size:17px;line-height:1.9;font-weight:bold;color:#13201A;text-align:right;">' . $e((string) $o['greeting']) . '</p>';
        }
        foreach ($lists('paragraphs') as $para) {
            $t[] = $para;
            $t[] = '';
            $h .= $p($para);
        }

        if (is_array($o['highlight'] ?? null)) {
            $hl = $o['highlight'];
            $inner = '';
            if (($hl['label'] ?? '') !== '') {
                $t[] = '【' . $hl['label'] . '】';
                $inner .= '<div class="nq-gold" style="font-family:' . $font . ';font-size:13px;line-height:1.6;font-weight:bold;color:#8C6A1E;margin:0 0 4px;">' . $e((string) $hl['label']) . '</div>';
            }
            if (($hl['title'] ?? '') !== '') {
                $t[] = (string) $hl['title'];
                $inner .= '<div class="nq-text" style="font-family:' . $font . ';font-size:17px;line-height:1.7;font-weight:bold;color:#13201A;margin:0 0 6px;">' . $e((string) $hl['title']) . '</div>';
            }
            if (($hl['text'] ?? '') !== '') {
                $t[] = (string) $hl['text'];
                $inner .= '<div class="nq-text" style="font-family:' . $font . ';font-size:15px;line-height:1.9;color:#2B2B2B;">' . $br((string) $hl['text']) . '</div>';
            }
            $t[] = '';
            $h .= '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr>'
                . '<td class="nq-box" style="background:#F8F2E2;border:1px solid #E8D7AA;border-right:4px solid #B8893A;border-radius:8px;padding:16px 20px;text-align:right;">'
                . $inner . '</td></tr></table>';
        }
        foreach ($lists('after_highlight') as $para) {
            $t[] = $para;
            $t[] = '';
            $h .= $p($para);
        }

        if (is_array($o['list'] ?? null) && $o['list'] !== []) {
            $digits = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
            $rows = '';
            foreach (array_values($o['list']) as $i => $item) {
                [$it, $desc, $url] = array_map('strval', array_pad(array_values((array) $item), 3, ''));
                $t[] = ($i + 1) . '. ' . $it . ' — ' . $desc;
                if ($url !== '') {
                    $t[] = '   ' . $url;
                }
                $last = $i === count($o['list']) - 1;
                $sep = $last ? '' : 'border-bottom:1px solid #EFE5CC;';
                $cls = $last ? '' : ' class="nq-rule"';
                $label = $url !== ''
                    ? '<a class="nq-link" href="' . $e($url) . '" target="_blank" style="color:#0F4A33;text-decoration:none;font-weight:bold;">' . $e($it) . '&nbsp;&#8592;</a>'
                    : $e($it);
                $rows .= '<tr>'
                    . '<td' . $cls . ' width="46" valign="top" style="padding:14px 0 14px 12px;' . $sep . '">'
                    . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="nq-badge" width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#0F3324;border:1px solid #B8893A;border-radius:17px;font-family:' . $font . ';font-size:15px;font-weight:bold;line-height:34px;color:#F0D89A;text-align:center;">' . ($digits[$i] ?? (string) ($i + 1)) . '</td></tr></table>'
                    . '</td>'
                    . '<td' . $cls . ' valign="top" style="padding:12px 0;text-align:right;' . $sep . '">'
                    . '<div class="nq-text" style="font-family:' . $font . ';font-size:16px;line-height:1.7;font-weight:bold;color:#0F4A33;">' . $label . '</div>'
                    . '<div class="nq-muted" style="font-family:' . $font . ';font-size:14px;line-height:1.8;color:#5A5A52;">' . $e($desc) . '</div>'
                    . '</td></tr>';
            }
            $t[] = '';
            $h .= '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">' . $rows . '</table>';
        }

        if (($o['code'] ?? '') !== '') {
            $code = (string) $o['code'];
            $t[] = $code;
            $t[] = '';
            $h .= '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;"><tr><td align="center">'
                . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="nq-box" dir="ltr" style="background:#F8F2E2;border:1px dashed #B8893A;border-radius:10px;padding:14px 28px;font-family:Consolas,\'Courier New\',monospace;font-size:28px;letter-spacing:6px;font-weight:bold;color:#0F4A33;text-align:center;">'
                . $e($code) . '</td></tr></table></td></tr></table>';
        }

        if (is_array($o['button'] ?? null) && count($o['button']) === 2) {
            [$bt, $bu] = array_map('strval', array_values($o['button']));
            $t[] = $bt . ':';
            $t[] = $bu;
            $t[] = '';
            $h .= self::button($bt, $bu);
            if (!empty($o['show_link'])) {
                $h .= '<p class="nq-muted" style="margin:0 0 18px;font-family:' . $font . ';font-size:12px;line-height:1.8;color:#7A7A70;text-align:center;">إن لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:<br>'
                    . '<a class="nq-link" href="' . $e($bu) . '" target="_blank" dir="ltr" style="color:#8C6A1E;text-decoration:underline;word-break:break-all;direction:ltr;unicode-bidi:embed;">' . $e($bu) . '</a></p>';
            }
        }
        foreach ($lists('after') as $para) {
            $t[] = $para;
            $t[] = '';
            $h .= '<p class="nq-muted" style="margin:0 0 14px;font-family:' . $font . ';font-size:14px;line-height:1.9;color:#5A5A52;text-align:center;">' . $br($para) . '</p>';
        }

        if (is_array($o['ayah'] ?? null) && count($o['ayah']) === 2) {
            [$ayah, $ref] = array_map('strval', array_values($o['ayah']));
            $t[] = '﴿' . $ayah . '﴾ [' . $ref . ']';
            $t[] = '';
            $h .= $divider('8px 0 18px');
            $h .= '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr>'
                . '<td class="nq-ayah" style="background:#0F3324;border:1px solid #B8893A;border-radius:12px;padding:4px;">'
                . '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
                . '<td style="border:1px solid #6F5A2C;border-radius:9px;padding:20px 22px 16px;text-align:center;">'
                . '<div class="nq-ayah-t" style="font-family:\'Amiri\',\'Scheherazade New\',\'Traditional Arabic\',' . $font . ';font-size:24px;line-height:2;color:#F0D89A;">﴿&nbsp;' . $e($ayah) . '&nbsp;﴾</div>'
                . '<div style="font-family:' . $font . ';font-size:13px;line-height:1.6;color:#C9B27A;margin-top:4px;">[' . $e($ref) . ']</div>'
                . '</td></tr></table></td></tr></table>';
        }

        $t[] = 'مع خالص الدعاء،';
        $t[] = 'فريق ' . $app;
        $h .= '<p class="nq-text" style="margin:0;font-family:' . $font . ';font-size:15px;line-height:1.9;color:#2B2B2B;text-align:right;">مع خالص الدعاء،<br><strong class="nq-sign" style="font-size:17px;color:#0F4A33;">فريق ' . $e($app) . '</strong></p>';

        if (($o['notice'] ?? '') !== '') {
            $t[] = '';
            $t[] = '— ' . $o['notice'];
            $h .= '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;"><tr>'
                . '<td class="nq-rule" style="border-top:1px solid #EADFC2;padding:16px 0 0;font-family:' . $font . ';font-size:13px;line-height:1.8;color:#7A7A70;text-align:right;">'
                . '<span class="nq-muted" style="color:#7A7A70;">' . $br((string) $o['notice']) . '</span></td></tr></table>';
        }

        $reason = (string) ($o['reason'] ?? '');
        $t[] = '';
        $t[] = str_repeat('─', 24);
        $t[] = $app . ' — مجاني لوجه الله، بلا إعلانات';
        $t[] = 'الموقع: ' . $site . '/';
        $t[] = 'الدعم: ' . $site . '/support';
        $t[] = 'الخصوصية: ' . $site . '/privacy';
        if ($reason !== '') {
            $t[] = $reason;
        }
        $text = implode("\n", $t) . "\n";

        $pre = $e((string) ($o['preheader'] ?? ''));
        $link = static fn (string $label, string $url): string => '<a href="' . $e($url) . '" target="_blank" style="color:#D6B267;text-decoration:none;">' . $e($label) . '</a>';
        $dot = '<span style="color:#5E6F64;">&nbsp;&nbsp;•&nbsp;&nbsp;</span>';

        $html = '<!DOCTYPE html>'
            . '<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
            . '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">'
            . '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">'
            . '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">'
            . '<title>' . $e($title) . '</title>'
            . '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->'
            . '<style>'
            . 'body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}'
            . 'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}'
            . '@media only screen and (max-width:620px){.nq-outer{padding:12px 6px!important}.nq-card{padding:6px!important}.nq-pad{padding:28px 18px 24px!important}'
            . '.nq-h1{font-size:22px!important}.nq-p{font-size:16px!important}.nq-ayah-t{font-size:21px!important}.nq-foot{padding:26px 18px!important}}'
            . '@media (prefers-color-scheme:dark){.nq-body,.nq-bg{background:#060D0A!important}.nq-card{background:#0E1C16!important;border-color:#2A3A31!important}'
            . '.nq-frame{border-color:#9C7A35!important}.nq-frame2{border-color:#4A3E22!important}.nq-text,.nq-p{color:#F1EBDC!important}.nq-h1,.nq-sign{color:#F0D89A!important}'
            . '.nq-muted{color:#A9B6AC!important}.nq-gold{color:#D6B267!important}.nq-link{color:#F0D89A!important}.nq-box{background:#132A20!important;border-color:#3D4A34!important}'
            . '.nq-ayah{background:#08140F!important}.nq-rule{border-color:#2A3A31!important}}'
            . '</style>'
            // Outlook.com dark mode (kept in its own block so clients that reject attribute selectors keep the one above)
            . '<style>[data-ogsc] .nq-text,[data-ogsc] .nq-p{color:#F1EBDC!important}[data-ogsc] .nq-h1{color:#F0D89A!important}[data-ogsc] .nq-muted{color:#A9B6AC!important}[data-ogsc] .nq-link{color:#F0D89A!important}</style>'
            . '</head>'
            . '<body class="nq-body" dir="rtl" style="margin:0;padding:0;background:#EEEAE0;">'
            . '<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEEAE0;opacity:0;">'
            . $pre . str_repeat('&#8199;&#65279;&#847; ', 40) . '</div>'
            . '<table role="presentation" class="nq-bg" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEEAE0;">'
            . '<tr><td align="center" class="nq-outer" style="padding:28px 12px;">'
            . '<!--[if mso]><table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->'
            . '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">'
            // header banner
            . '<tr><td align="center" style="background:#060D0A;border-radius:14px 14px 0 0;font-size:0;line-height:0;">'
            . '<a href="' . $e($site . '/') . '" target="_blank" style="text-decoration:none;">'
            . '<img src="' . $e(self::asset('header.png')) . '" width="600" height="200" alt="' . $e(self::BRAND) . '" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;border-radius:14px 14px 0 0;font-family:' . $font . ';font-size:28px;line-height:200px;color:#D6B267;text-align:center;background:#060D0A;">'
            . '</a></td></tr>'
            // gold double-framed card
            . '<tr><td class="nq-card" style="background:#FFFDF8;padding:10px;border-left:1px solid #E2D6B8;border-right:1px solid #E2D6B8;">'
            . '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td class="nq-frame" style="border:1px solid #C9A55A;border-radius:6px;padding:3px;">'
            . '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td class="nq-frame2 nq-pad" dir="rtl" style="border:1px solid #EADBB2;border-radius:4px;padding:34px 40px 30px;text-align:right;">'
            . $h
            . '</td></tr></table></td></tr></table></td></tr>'
            // footer band
            . '<tr><td class="nq-foot" align="center" style="background:#0B1F17;border-radius:0 0 14px 14px;padding:30px 28px;border-top:2px solid #B8893A;">'
            . '<a href="' . $e($site . '/') . '" target="_blank" style="text-decoration:none;"><img src="' . $e(self::asset('footer-mark.png')) . '" width="48" height="48" alt="' . $e(self::BRAND) . '" style="display:block;margin:0 auto 12px;width:48px;height:48px;border:0;font-family:' . $font . ';font-size:13px;color:#D6B267;"></a>'
            . '<p style="margin:0 0 10px;font-family:' . $font . ';font-size:15px;line-height:1.8;font-weight:bold;color:#F0D89A;text-align:center;">' . $e($app) . ' — مجاني لوجه الله، بلا إعلانات</p>'
            . '<p style="margin:0 0 14px;font-family:' . $font . ';font-size:14px;line-height:1.8;text-align:center;">'
            . $link('الموقع', $site . '/') . $dot . $link('الدعم', $site . '/support') . $dot . $link('الخصوصية', $site . '/privacy') . '</p>'
            . ($reason !== '' ? '<p style="margin:0;font-family:' . $font . ';font-size:12px;line-height:1.8;color:#A9B6AC;text-align:center;">' . $e($reason) . '</p>' : '')
            . '</td></tr>'
            . '</table>'
            . '<!--[if mso]></td></tr></table><![endif]-->'
            . '</td></tr></table></body></html>';

        return [$text, $html];
    }

    /** Bulletproof button: padded link in a coloured cell, plus a VML round rectangle for Outlook (Windows). */
    private static function button(string $text, string $url): string
    {
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $w = max(220, min(520, mb_strlen($text) * 11 + 96));
        $font = self::FONT;
        return '<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px;"><tr><td align="center">'
            . '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' . $e($url) . '" style="height:52px;v-text-anchor:middle;width:' . $w . 'px;" arcsize="20%" strokecolor="#9C7A35" fillcolor="#B8893A">'
            . '<w:anchorlock/><center style="color:#ffffff;font-family:Tahoma,Arial,sans-serif;font-size:18px;font-weight:bold;">' . $e($text) . '</center></v:roundrect><![endif]-->'
            . '<!--[if !mso]><!-->'
            . '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            . '<td align="center" bgcolor="#B8893A" style="border-radius:10px;background:#B8893A;background-image:linear-gradient(180deg,#C99A47 0%,#B8893A 55%,#A77A2E 100%);border:1px solid #9C7A35;box-shadow:0 2px 0 #8A6A2C;">'
            . '<a href="' . $e($url) . '" target="_blank" style="display:inline-block;padding:15px 40px;font-family:' . $font . ';font-size:18px;line-height:22px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;">'
            . $e($text) . '</a></td></tr></table>'
            . '<!--<![endif]-->'
            . '</td></tr></table>';
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Local previews: load images from another base URL (e.g. file://…) and skip the database. */
    public static function usePreview(string $assetBase, string $appName = self::BRAND): void
    {
        self::$assetBase = rtrim($assetBase, '/');
        self::$appNameOverride = $appName;
    }

    private static function asset(string $file): string
    {
        if (self::$assetBase !== null) {
            return self::$assetBase . '/' . $file;
        }
        return Config::siteUrl() . '/brand/email/' . $file . '?v=' . self::ASSET_VERSION;
    }

    /** Integration setting; previews run without a database. */
    private static function setting(string $key): string
    {
        return self::$appNameOverride !== null ? '' : Integrations::get($key);
    }

    private static function appName(): string
    {
        if (self::$appNameOverride !== null) {
            return self::$appNameOverride;
        }
        try {
            $n = trim((string) Settings::get('app_name'));
        } catch (\Throwable) {
            $n = '';
        }
        return $n !== '' ? $n : self::BRAND;
    }

    /**
     * Salutation with the user's name. Names are user-chosen and some emails go to an address the
     * signer-up typed, so a name that looks like a link or an address is left out.
     */
    private static function greeting(string $name): string
    {
        $name = trim((string) preg_replace('/\s+/u', ' ', $name));
        if ($name === '' || preg_match('~(://|www\.|@|\.[a-z]{2,}\b)~iu', $name)) {
            return 'السلام عليكم ورحمة الله وبركاته،';
        }
        return 'السلام عليكم ورحمة الله وبركاته يا ' . self::clip($name, 40) . '،';
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

    /** e.g. «الاثنين، ٢٣ نوفمبر ٢٠٢٦، الساعة ١٤:٠٥» (UTC). */
    public static function arabicDate(int $ts): string
    {
        if (class_exists(\IntlDateFormatter::class)) {
            $f = new \IntlDateFormatter('ar', \IntlDateFormatter::NONE, \IntlDateFormatter::NONE, 'UTC', \IntlDateFormatter::GREGORIAN, "EEEE، d MMMM y، 'الساعة' HH:mm");
            $s = $f->format($ts);
            if (is_string($s) && $s !== '') {
                return $s;
            }
        }
        return gmdate('Y-m-d H:i', $ts) . ' UTC';
    }
}
