<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Email wording in the six site languages (ar, en, tr, fr, ur, id).
 *
 * Placeholders: {app} (site name in that language), {name}, {date}, {subject}, {via}, {from}.
 * Missing keys fall back to Arabic. Ayah boxes keep the Arabic text in every language and add
 * the meaning in the email's language underneath (see AYAT).
 */
final class MailText
{
    public const LANGS = ['ar', 'en', 'tr', 'fr', 'ur', 'id'];
    public const DEFAULT = 'ar';

    /** Site name per language (used unless the admin renamed the site). */
    private const BRAND = [
        'ar' => 'نور القرآن', 'en' => 'Nur Al-Quran', 'tr' => 'Nur Al-Kuran',
        'fr' => 'Nur Al-Coran', 'ur' => 'نور القرآن', 'id' => 'Nur Al-Quran',
    ];

    public static function lang(mixed $lang): string
    {
        return is_string($lang) && in_array($lang, self::LANGS, true) ? $lang : self::DEFAULT;
    }

    public static function isRtl(string $lang): bool
    {
        return $lang === 'ar' || $lang === 'ur';
    }

    public static function brand(string $lang): string
    {
        return self::BRAND[self::lang($lang)];
    }

    /** @param array<string,string> $vars */
    public static function t(string $lang, string $key, array $vars = []): string
    {
        $s = self::STR[self::lang($lang)][$key] ?? self::STR['ar'][$key] ?? $key;
        foreach ($vars as $k => $v) {
            $s = str_replace('{' . $k . '}', $v, $s);
        }
        return $s;
    }

    /** Arabic-Indic digits for ar, Extended (Urdu) digits for ur, Western digits otherwise. */
    public static function digits(string $lang, string $s): string
    {
        $map = match ($lang) {
            'ar' => ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
            'ur' => ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
            default => null,
        };
        return $map === null ? $s : strtr($s, array_combine(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], $map));
    }

    /** Date and time (UTC) written for the language, e.g. «الاثنين، ٢٣ نوفمبر ٢٠٢٦، الساعة ١٤:٠٥». */
    public static function date(string $lang, int $ts): string
    {
        $lang = self::lang($lang);
        if (class_exists(\IntlDateFormatter::class)) {
            $f = match ($lang) {
                'ar' => new \IntlDateFormatter('ar', \IntlDateFormatter::NONE, \IntlDateFormatter::NONE, 'UTC', \IntlDateFormatter::GREGORIAN, "EEEE، d MMMM y، 'الساعة' HH:mm"),
                'ur' => new \IntlDateFormatter('ur_PK', \IntlDateFormatter::NONE, \IntlDateFormatter::NONE, 'UTC', \IntlDateFormatter::GREGORIAN, 'EEEE، d MMMM y، HH:mm'),
                default => new \IntlDateFormatter(['en' => 'en_GB', 'tr' => 'tr_TR', 'fr' => 'fr_FR', 'id' => 'id_ID'][$lang], \IntlDateFormatter::FULL, \IntlDateFormatter::SHORT, 'UTC', \IntlDateFormatter::GREGORIAN),
            };
            $s = $f->format($ts);
            if (is_string($s) && $s !== '') {
                return $lang === 'ur' ? self::digits('ur', $s) : $s;
            }
        }
        return gmdate('Y-m-d H:i', $ts) . ' UTC';
    }

    /**
     * Ayah for a box: Arabic text + Arabic reference, and (except in Arabic) a meaning line.
     * @return array{text:string, ref:string, meaning:?string, source:?string}
     */
    public static function ayah(string $id, string $lang): array
    {
        $a = self::AYAT[$id];
        $lang = self::lang($lang);
        $m = $lang === 'ar' ? null : ($a[$lang] ?? null);
        return [
            'text' => $a['text'],
            'ref' => $a['ref'],
            'meaning' => $m[0] ?? null,
            'source' => $m === null ? null : self::t($lang, 'c.meaning') . ' — ' . $m[1],
        ];
    }

    /**
     * Arabic text (standard vowelled script, which renders reliably in mail fonts) with its reference.
     * en follows Sahih International; the other languages give a faithful meaning in the wording of the
     * common translations (Diyanet, Hamidullah, Kemenag, Urdu tafsir translations) and are labelled as
     * a meaning, not quoted as a specific edition.
     */
    private const AYAT = [
        'taha114' => [
            'text' => 'وَقُل رَّبِّ زِدْنِي عِلْمًا', 'ref' => 'طه: ١١٤',
            'en' => ['And say, “My Lord, increase me in knowledge.”', 'Taha 20:114'],
            'tr' => ['Ve de ki: “Rabbim! İlmimi artır.”', 'Tâhâ 20/114'],
            'fr' => ['Et dis : « Ô mon Seigneur, accroît mes connaissances ! »', 'Tâ-Hâ 20:114'],
            'ur' => ['اور کہو: اے میرے رب! میرے علم میں اضافہ فرما۔', 'طٰہٰ ۲۰:۱۱۴'],
            'id' => ['Dan katakanlah, “Ya Tuhanku, tambahkanlah ilmu kepadaku.”', 'QS. Taha [20]: 114'],
        ],
        'isra9' => [
            'text' => 'إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ', 'ref' => 'الإسراء: ٩',
            'en' => ['Indeed, this Qur’an guides to that which is most suitable.', 'Al-Isra 17:9'],
            'tr' => ['Şüphesiz bu Kur’an, en doğru yola iletir.', 'İsrâ 17/9'],
            'fr' => ['Ce Coran guide vers ce qu’il y a de plus droit.', 'Al-Isrâ’ 17:9'],
            'ur' => ['بے شک یہ قرآن وہ راستہ دکھاتا ہے جو سب سے سیدھا ہے۔', 'بنی اسرائیل ۱۷:۹'],
            'id' => ['Sungguh, Al-Qur’an ini memberi petunjuk ke (jalan) yang paling lurus.', 'QS. Al-Isra’ [17]: 9'],
        ],
        'talaq3' => [
            'text' => 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', 'ref' => 'الطلاق: ٣',
            'en' => ['And whoever relies upon Allah – then He is sufficient for him.', 'At-Talaq 65:3'],
            'tr' => ['Kim Allah’a tevekkül ederse, O ona yeter.', 'Talâk 65/3'],
            'fr' => ['Et quiconque place sa confiance en Allah, Il lui suffit.', 'At-Talâq 65:3'],
            'ur' => ['اور جو اللہ پر بھروسہ کرے تو وہ اس کے لیے کافی ہے۔', 'الطلاق ۶۵:۳'],
            'id' => ['Dan barang siapa bertawakal kepada Allah, niscaya Allah akan mencukupkan (keperluan)nya.', 'QS. At-Talaq [65]: 3'],
        ],
        'yusuf64' => [
            'text' => 'فَاللَّهُ خَيْرٌ حَافِظًا وَهُوَ أَرْحَمُ الرَّاحِمِينَ', 'ref' => 'يوسف: ٦٤',
            'en' => ['But Allah is the best guardian, and He is the most merciful of the merciful.', 'Yusuf 12:64'],
            'tr' => ['Allah en iyi koruyandır ve O, merhametlilerin en merhametlisidir.', 'Yûsuf 12/64'],
            'fr' => ['Allah est le meilleur gardien, et Il est le plus Miséricordieux des miséricordieux.', 'Yûsuf 12:64'],
            'ur' => ['اللہ ہی بہترین نگہبان ہے، اور وہ سب مہربانوں سے بڑھ کر مہربان ہے۔', 'یوسف ۱۲:۶۴'],
            'id' => ['Allah adalah penjaga yang terbaik, dan Dia Maha Penyayang di antara para penyayang.', 'QS. Yusuf [12]: 64'],
        ],
        'maidah2' => [
            'text' => 'وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَىٰ', 'ref' => 'المائدة: ٢',
            'en' => ['And cooperate in righteousness and piety.', 'Al-Ma’idah 5:2'],
            'tr' => ['İyilik ve takva üzere yardımlaşın.', 'Mâide 5/2'],
            'fr' => ['Entraidez-vous dans l’accomplissement des bonnes œuvres et de la piété.', 'Al-Mâ’ida 5:2'],
            'ur' => ['اور نیکی اور پرہیزگاری کے کاموں میں ایک دوسرے کی مدد کرو۔', 'المائدہ ۵:۲'],
            'id' => ['Dan tolong-menolonglah kamu dalam (mengerjakan) kebajikan dan takwa.', 'QS. Al-Ma’idah [5]: 2'],
        ],
        'sad29' => [
            'text' => 'كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَدَّبَّرُوا آيَاتِهِ', 'ref' => 'ص: ٢٩',
            'en' => ['[This is] a blessed Book which We have revealed to you, that they might reflect upon its verses.', 'Sad 38:29'],
            'tr' => ['Bu, ayetlerini düşünsünler diye sana indirdiğimiz mübarek bir Kitap’tır.', 'Sâd 38/29'],
            'fr' => ['Voici un Livre béni que Nous avons fait descendre vers toi, afin qu’ils méditent sur ses versets.', 'Sâd 38:29'],
            'ur' => ['یہ ایک بابرکت کتاب ہے جو ہم نے آپ کی طرف نازل کی ہے، تاکہ لوگ اس کی آیات میں غور کریں۔', 'صٓ ۳۸:۲۹'],
            'id' => ['Kitab (Al-Qur’an) yang Kami turunkan kepadamu penuh berkah agar mereka menghayati ayat-ayatnya.', 'QS. Sad [38]: 29'],
        ],
    ];

    private const STR = [
        // ── العربية ─────────────────────────────────────────────────────────
        'ar' => [
            'c.greet' => 'السلام عليكم ورحمة الله وبركاته،',
            'c.greet_name' => 'السلام عليكم ورحمة الله وبركاته يا {name}،',
            'c.signoff' => 'مع خالص الدعاء،',
            'c.team' => 'فريق {app}',
            'c.tagline' => '{app} — مجاني لوجه الله، بلا إعلانات',
            'c.site' => 'الموقع', 'c.support' => 'الدعم', 'c.privacy' => 'الخصوصية',
            'c.fallback' => 'إن لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:',
            'c.meaning' => 'المعنى',
            'c.utc' => 'بالتوقيت العالمي (UTC)',

            'verify.subject' => 'أكِّد بريدك الإلكتروني — {app}',
            'verify.preheader' => 'خطوة أخيرة لتفعيل حسابك في {app}: أكِّد بريدك الإلكتروني.',
            'verify.title' => 'تأكيد البريد الإلكتروني',
            'verify.p1' => 'شكراً لانضمامك إلى {app}. بقيت خطوة واحدة لتفعيل حسابك، وهي تأكيد بريدك الإلكتروني؛ حتى نحمي حسابك ونتمكّن من مراسلتك عند الحاجة.',
            'verify.button' => 'تأكيد البريد الإلكتروني',
            'verify.after' => 'الرابط صالح لمدة ٢٤ ساعة، ويُستخدم مرة واحدة فقط.',
            'verify.notice' => 'إن لم تُنشئ حساباً في {app} فتجاهل هذه الرسالة، ولن يُؤكَّد هذا البريد.',
            'verify.reason' => 'وصلتك هذه الرسالة لأن هذا البريد استُخدم لإنشاء حساب في {app}.',

            'reset.subject' => 'إعادة تعيين كلمة المرور — {app}',
            'reset.preheader' => 'رابط اختيار كلمة مرور جديدة لحسابك، صالح لمدة ساعة واحدة.',
            'reset.title' => 'إعادة تعيين كلمة المرور',
            'reset.p1' => 'وصلنا طلبٌ لإعادة تعيين كلمة المرور لحسابك في {app}. لاختيار كلمة مرور جديدة اضغط على الزر أدناه.',
            'reset.button' => 'اختيار كلمة مرور جديدة',
            'reset.after' => 'الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة فقط. وبعد تغيير كلمة المرور يُسجَّل خروج حسابك من جميع الأجهزة احتياطاً.',
            'reset.notice' => 'إن لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة مرورك كما هي. لا تشارك هذا الرابط مع أحد؛ فريقنا لن يطلبه منك أبداً.',
            'reset.reason' => 'وصلتك هذه الرسالة لأن طلباً لإعادة تعيين كلمة المرور أُرسل لحساب مرتبط بهذا البريد.',

            'welcome.subject' => 'أهلاً بك في {app}',
            'welcome.preheader' => 'حسابك جاهز. ثلاث بدايات طيبة لرحلتك مع كتاب الله.',
            'welcome.title' => 'أهلاً بك في {app}',
            'welcome.p1' => 'تمّ تفعيل حسابك بنجاح، والحمد لله الذي بنعمته تتمّ الصالحات. نسأل الله أن يجعل القرآن ربيع قلبك ونور صدرك.',
            'welcome.p2' => '{app} موقعٌ مجاني لوجه الله، بلا إعلانات. وهذه ثلاث بدايات طيبة:',
            'welcome.l1t' => 'اقرأ القرآن الكريم',
            'welcome.l1d' => 'مصحف واضح بالرسم العثماني، ويحفظ موضع قراءتك لتكمل من حيث توقفت.',
            'welcome.l2t' => 'مواقيت الصلاة',
            'welcome.l2d' => 'مواقيت الصلاة لمدينتك، ومعها في الموقع اتجاه القبلة والأذكار.',
            'welcome.l3t' => 'الختمة الجماعية',
            'welcome.l3d' => 'أنشئ ختمة مع أهلك وأصدقائك، ووزّعوا الأجزاء بينكم، وتابعوا التقدّم معاً.',
            'welcome.button' => 'ابدأ القراءة',
            'welcome.reason' => 'وصلتك هذه الرسالة لأنك فعّلت حسابك في {app}. لن نرسل إليك رسائل دعائية.',

            'pwd.subject' => 'تم تغيير كلمة المرور — {app}',
            'pwd.preheader' => 'تنبيه أمني: تم تغيير كلمة مرور حسابك يوم {date}.',
            'pwd.title' => 'تم تغيير كلمة المرور',
            'pwd.intro_change' => 'نُعلمك بأنه تمّ تغيير كلمة المرور لحسابك في {app} من صفحة الإعدادات، وسُجِّل خروج حسابك من الأجهزة الأخرى احتياطاً.',
            'pwd.intro_reset' => 'نُعلمك بأنه تمّ تعيين كلمة مرور جديدة لحسابك في {app} عبر رابط إعادة التعيين، وسُجِّل خروج حسابك من جميع الأجهزة احتياطاً.',
            'pwd.time_label' => 'وقت التغيير',
            'pwd.ok' => 'إن كنت أنت من قام بذلك فلا حاجة لأي إجراء، وجزاك الله خيراً على حرصك على أمان حسابك.',
            'pwd.notme' => 'وإن لم تكن أنت، فأعد تعيين كلمة المرور فوراً من الزر أدناه، ثم راسلنا عبر صفحة الدعم.',
            'pwd.button' => 'إعادة تعيين كلمة المرور الآن',
            'pwd.notice' => 'لأمانك: لن يطلب منك فريق {app} كلمة مرورك أبداً، لا عبر البريد ولا غيره.',
            'pwd.reason' => 'وصلتك هذه الرسالة لأنها تنبيه أمني يخص حسابك، ويُرسل عند كل تغيير لكلمة المرور.',

            'team.subject_new' => 'رسالة من فريق {app}: {subject}',
            'team.subject_reply' => 'ردّ جديد من فريق الدعم: {subject}',
            'team.title_new' => 'رسالة من فريق {app}',
            'team.title_reply' => 'ردّ جديد من فريق الدعم',
            'team.intro_new' => 'أرسل إليك فريق {app} رسالة جديدة عبر حسابك في الموقع:',
            'team.intro_reply' => 'ردّ فريق الدعم على رسالتك. هذا مقتطف من الرد:',
            'team.subject_label' => 'الموضوع',
            'team.after' => 'لقراءة الرسالة كاملة والرد عليها، افتح صفحة الدعم في حسابك.',
            'team.button' => 'عرض الرسالة والرد',
            'team.notice' => 'للرد استخدم صفحة الدعم في الموقع، حتى تبقى المحادثة كاملة في مكان واحد.',
            'team.reason' => 'وصلتك هذه الرسالة لأن فريق {app} راسلك عبر حسابك في الموقع.',

            'test.subject' => 'رسالة تجريبية — {app}',
            'test.preheader' => 'إعدادات البريد تعمل. هكذا تبدو الرسائل التي تصل إلى المستخدمين.',
            'test.title' => 'رسالة تجريبية',
            'test.p1' => 'إن وصلتك هذه الرسالة فإعدادات البريد في {app} تعمل بنجاح، والحمد لله.',
            'test.p2' => 'وهي نموذج كامل لتصميم الرسائل التي تصل إلى المستخدمين: الترويسة، والنص، والزر، وإطار الآية، والتذييل.',
            'test.details' => 'تفاصيل الإرسال',
            'test.via' => 'طريقة الإرسال: {via}',
            'test.from' => 'المُرسِل: {from}',
            'test.time' => 'الوقت: {date}',
            'test.via_server' => 'خادم الموقع (mail)',
            'test.button' => 'زيارة {app}',
            'test.notice' => 'هذه رسالة تجريبية أُرسلت من لوحة الإدارة، ولا تحتاج إلى رد.',
            'test.reason' => 'وصلتك هذه الرسالة لأنك ضغطت زر «اختبار» في إعدادات البريد بلوحة الإدارة.',
        ],

        // ── English ─────────────────────────────────────────────────────────
        'en' => [
            'c.greet' => 'Assalamu alaikum wa rahmatullahi wa barakatuh,',
            'c.greet_name' => 'Assalamu alaikum wa rahmatullahi wa barakatuh, {name},',
            'c.signoff' => 'With warm regards and duas,',
            'c.team' => 'The {app} team',
            'c.tagline' => '{app} — free for the sake of Allah, with no ads',
            'c.site' => 'Website', 'c.support' => 'Support', 'c.privacy' => 'Privacy',
            'c.fallback' => 'If the button does not work, copy this link into your browser:',
            'c.meaning' => 'Meaning (Sahih International)',
            'c.utc' => 'Coordinated Universal Time (UTC)',

            'verify.subject' => 'Confirm your email — {app}',
            'verify.preheader' => 'One last step to activate your {app} account.',
            'verify.title' => 'Confirm your email address',
            'verify.p1' => 'Thank you for joining {app}. Just one step remains to activate your account: confirming your email address, so that we can keep your account safe and reach you when needed.',
            'verify.button' => 'Confirm my email',
            'verify.after' => 'This link is valid for 24 hours and can be used only once.',
            'verify.notice' => 'If you did not create an account on {app}, you can safely ignore this email, and this address will not be confirmed.',
            'verify.reason' => 'You received this email because this address was used to create an account on {app}.',

            'reset.subject' => 'Reset your password — {app}',
            'reset.preheader' => 'A link to choose a new password, valid for one hour.',
            'reset.title' => 'Reset your password',
            'reset.p1' => 'We received a request to reset the password of your {app} account. To choose a new password, please use the button below.',
            'reset.button' => 'Choose a new password',
            'reset.after' => 'This link is valid for one hour and can be used only once. Once your password is changed, your account will be signed out of all devices as a precaution.',
            'reset.notice' => 'If you did not request this, please ignore this email and your password will stay the same. Never share this link with anyone; our team will never ask you for it.',
            'reset.reason' => 'You received this email because a password reset was requested for an account linked to this address.',

            'welcome.subject' => 'Welcome to {app}',
            'welcome.preheader' => 'Your account is ready: three good ways to begin your journey with the Book of Allah.',
            'welcome.title' => 'Welcome to {app}',
            'welcome.p1' => 'Your account is now active. All praise is due to Allah, by whose grace good deeds are completed. We ask Allah to make the Quran the spring of your heart and the light of your chest.',
            'welcome.p2' => '{app} is free for the sake of Allah, with no ads. Here are three good places to begin:',
            'welcome.l1t' => 'Read the Noble Quran',
            'welcome.l1d' => 'A clear mushaf in the Uthmani script that remembers where you stopped, so you can continue right where you left off.',
            'welcome.l2t' => 'Prayer times',
            'welcome.l2d' => 'Prayer times for your city, with the qibla direction and daily adhkar also on the site.',
            'welcome.l3t' => 'Group khatma',
            'welcome.l3d' => 'Start a khatma with your family and friends, share the juz’ between you, and follow your progress together.',
            'welcome.button' => 'Start reading',
            'welcome.reason' => 'You received this email because you activated your account on {app}. We will never send you promotional emails.',

            'pwd.subject' => 'Your password was changed — {app}',
            'pwd.preheader' => 'Security notice: your account password was changed on {date}.',
            'pwd.title' => 'Your password was changed',
            'pwd.intro_change' => 'We would like to let you know that the password of your {app} account was changed from the settings page, and your account was signed out of other devices as a precaution.',
            'pwd.intro_reset' => 'We would like to let you know that a new password was set for your {app} account through a reset link, and your account was signed out of all devices as a precaution.',
            'pwd.time_label' => 'Time of the change',
            'pwd.ok' => 'If this was you, there is nothing more to do. May Allah reward you for taking care of your account’s security.',
            'pwd.notme' => 'If this was not you, please reset your password right away using the button below, then contact us through the support page.',
            'pwd.button' => 'Reset my password now',
            'pwd.notice' => 'For your safety: the {app} team will never ask for your password, by email or in any other way.',
            'pwd.reason' => 'You received this email because it is a security notice about your account, sent whenever your password changes.',

            'team.subject_new' => 'A message from the {app} team: {subject}',
            'team.subject_reply' => 'New reply from our support team: {subject}',
            'team.title_new' => 'A message from the {app} team',
            'team.title_reply' => 'New reply from our support team',
            'team.intro_new' => 'The {app} team has sent you a new message through your account:',
            'team.intro_reply' => 'Our support team has replied to your message. Here is an excerpt:',
            'team.subject_label' => 'Subject',
            'team.after' => 'To read the full message and reply, please open the support page in your account.',
            'team.button' => 'View and reply',
            'team.notice' => 'Please reply through the support page on the site, so the whole conversation stays in one place.',
            'team.reason' => 'You received this email because the {app} team wrote to you through your account on the site.',

            'test.subject' => 'Test email — {app}',
            'test.preheader' => 'Email settings are working. This is how your users’ emails look.',
            'test.title' => 'Test email',
            'test.p1' => 'If this message has reached you, the email settings of {app} are working, all praise is due to Allah.',
            'test.p2' => 'It is a complete sample of the design your users receive: the header, the text, the button, the ayah frame and the footer.',
            'test.details' => 'Delivery details',
            'test.via' => 'Sending method: {via}',
            'test.from' => 'Sender: {from}',
            'test.time' => 'Time: {date}',
            'test.via_server' => 'the site’s server (mail)',
            'test.button' => 'Visit {app}',
            'test.notice' => 'This test email was sent from the admin panel; no reply is needed.',
            'test.reason' => 'You received this email because you pressed the test button in the email settings of the admin panel.',
        ],

        // ── Türkçe ──────────────────────────────────────────────────────────
        'tr' => [
            'c.greet' => 'Esselâmu aleyküm ve rahmetullâhi ve berekâtüh,',
            'c.greet_name' => 'Esselâmu aleyküm ve rahmetullâhi ve berekâtüh, {name},',
            'c.signoff' => 'Dualarımızla,',
            'c.team' => '{app} Ekibi',
            'c.tagline' => '{app} — Allah rızası için ücretsiz, reklamsız',
            'c.site' => 'Web sitesi', 'c.support' => 'Destek', 'c.privacy' => 'Gizlilik',
            'c.fallback' => 'Düğme çalışmazsa bu bağlantıyı kopyalayıp tarayıcınıza yapıştırın:',
            'c.meaning' => 'Meali',
            'c.utc' => 'Eş Güdümlü Evrensel Saat (UTC)',

            'verify.subject' => 'E-posta adresinizi doğrulayın — {app}',
            'verify.preheader' => '{app} hesabınızı etkinleştirmek için son bir adım kaldı.',
            'verify.title' => 'E-posta adresinizi doğrulayın',
            'verify.p1' => 'Aramıza katıldığınız için teşekkür ederiz. Hesabınızı etkinleştirmek için tek bir adım kaldı: e-posta adresinizi doğrulamak. Böylece hesabınızı koruyabilir ve gerektiğinde size ulaşabiliriz.',
            'verify.button' => 'E-postamı doğrula',
            'verify.after' => 'Bu bağlantı 24 saat geçerlidir ve yalnızca bir kez kullanılabilir.',
            'verify.notice' => '{app} üzerinde bir hesap oluşturmadıysanız bu e-postayı dikkate almayabilirsiniz; bu adres doğrulanmayacaktır.',
            'verify.reason' => 'Bu e-postayı, bu adres {app} üzerinde bir hesap oluşturmak için kullanıldığından aldınız.',

            'reset.subject' => 'Şifrenizi sıfırlayın — {app}',
            'reset.preheader' => 'Yeni bir şifre belirlemeniz için bağlantı; bir saat geçerlidir.',
            'reset.title' => 'Şifre sıfırlama',
            'reset.p1' => '{app} hesabınızın şifresini sıfırlamak için bir talep aldık. Yeni bir şifre belirlemek için aşağıdaki düğmeyi kullanabilirsiniz.',
            'reset.button' => 'Yeni şifre belirle',
            'reset.after' => 'Bu bağlantı bir saat geçerlidir ve yalnızca bir kez kullanılabilir. Şifreniz değiştiğinde, güvenliğiniz için hesabınızdan tüm cihazlarda çıkış yapılır.',
            'reset.notice' => 'Bu talebi siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmeyecektir. Bu bağlantıyı kimseyle paylaşmayın; ekibimiz onu sizden asla istemez.',
            'reset.reason' => 'Bu e-postayı, bu adrese bağlı bir hesap için şifre sıfırlama talep edildiğinden aldınız.',

            'welcome.subject' => 'Hoş geldiniz — {app}',
            'welcome.preheader' => 'Hesabınız hazır. Allah’ın Kitabı ile yolculuğunuza başlamak için üç güzel adım.',
            'welcome.title' => 'Aramıza hoş geldiniz',
            'welcome.p1' => 'Hesabınız başarıyla etkinleştirildi. Nimetiyle salih amellerin tamamlandığı Allah’a hamdolsun. Allah’tan, Kur’an’ı kalbinizin baharı ve gönlünüzün nuru kılmasını niyaz ederiz.',
            'welcome.p2' => '{app} Allah rızası için ücretsizdir ve reklam içermez. Başlamak için üç güzel yol:',
            'welcome.l1t' => 'Kur’an-ı Kerim’i okuyun',
            'welcome.l1d' => 'Resm-i Osmânî ile okunaklı bir mushaf; kaldığınız yeri hatırlar, böylece okumaya oradan devam edersiniz.',
            'welcome.l2t' => 'Namaz vakitleri',
            'welcome.l2d' => 'Şehrinize göre namaz vakitleri; sitede ayrıca kıble yönü ve günlük zikirler de var.',
            'welcome.l3t' => 'Toplu hatim',
            'welcome.l3d' => 'Ailenizle ve dostlarınızla bir hatim başlatın, cüzleri aranızda paylaşın ve ilerlemeyi birlikte takip edin.',
            'welcome.button' => 'Okumaya başla',
            'welcome.reason' => 'Bu e-postayı, {app} hesabınızı etkinleştirdiğiniz için aldınız. Size asla tanıtım e-postası göndermeyiz.',

            'pwd.subject' => 'Şifreniz değiştirildi — {app}',
            'pwd.preheader' => 'Güvenlik bildirimi: hesabınızın şifresi {date} tarihinde değiştirildi.',
            'pwd.title' => 'Şifreniz değiştirildi',
            'pwd.intro_change' => '{app} hesabınızın şifresinin ayarlar sayfasından değiştirildiğini bildirmek isteriz. Güvenliğiniz için hesabınızdan diğer cihazlarda çıkış yapıldı.',
            'pwd.intro_reset' => '{app} hesabınız için sıfırlama bağlantısıyla yeni bir şifre belirlendiğini bildirmek isteriz. Güvenliğiniz için hesabınızdan tüm cihazlarda çıkış yapıldı.',
            'pwd.time_label' => 'Değişiklik zamanı',
            'pwd.ok' => 'Bu işlemi siz yaptıysanız başka bir şey yapmanıza gerek yok. Hesabınızın güvenliğine gösterdiğiniz özen için Allah razı olsun.',
            'pwd.notme' => 'Bu işlemi siz yapmadıysanız aşağıdaki düğmeyle şifrenizi hemen sıfırlayın, ardından destek sayfası üzerinden bize yazın.',
            'pwd.button' => 'Şifremi şimdi sıfırla',
            'pwd.notice' => 'Güvenliğiniz için: {app} ekibi şifrenizi e-postayla ya da başka bir yolla asla istemez.',
            'pwd.reason' => 'Bu e-posta hesabınızla ilgili bir güvenlik bildirimidir ve şifreniz her değiştiğinde gönderilir.',

            'team.subject_new' => '{app} ekibinden mesaj: {subject}',
            'team.subject_reply' => 'Destek ekibinden yeni yanıt: {subject}',
            'team.title_new' => '{app} ekibinden bir mesaj',
            'team.title_reply' => 'Destek ekibinden yeni yanıt',
            'team.intro_new' => '{app} ekibi, hesabınız üzerinden size yeni bir mesaj gönderdi:',
            'team.intro_reply' => 'Destek ekibimiz mesajınızı yanıtladı. Yanıttan bir bölüm:',
            'team.subject_label' => 'Konu',
            'team.after' => 'Mesajın tamamını okumak ve yanıtlamak için hesabınızdaki destek sayfasını açın.',
            'team.button' => 'Mesajı görüntüle ve yanıtla',
            'team.notice' => 'Tüm yazışmanın tek bir yerde kalması için lütfen sitedeki destek sayfası üzerinden yanıt verin.',
            'team.reason' => 'Bu e-postayı, {app} ekibi size sitedeki hesabınız üzerinden yazdığı için aldınız.',

            'test.subject' => 'Deneme e-postası — {app}',
            'test.preheader' => 'E-posta ayarları çalışıyor. Kullanıcılarınızın aldığı e-postalar böyle görünür.',
            'test.title' => 'Deneme e-postası',
            'test.p1' => 'Bu mesaj size ulaştıysa {app} e-posta ayarları sorunsuz çalışıyor, elhamdülillah.',
            'test.p2' => 'Bu, kullanıcılarınızın aldığı tasarımın eksiksiz bir örneğidir: başlık, metin, düğme, ayet çerçevesi ve alt bilgi.',
            'test.details' => 'Gönderim ayrıntıları',
            'test.via' => 'Gönderim yöntemi: {via}',
            'test.from' => 'Gönderen: {from}',
            'test.time' => 'Zaman: {date}',
            'test.via_server' => 'sitenin sunucusu (mail)',
            'test.button' => 'Siteyi ziyaret edin',
            'test.notice' => 'Bu deneme e-postası yönetim panelinden gönderildi; yanıt vermenize gerek yoktur.',
            'test.reason' => 'Bu e-postayı, yönetim panelindeki e-posta ayarlarında test düğmesine bastığınız için aldınız.',
        ],

        // ── Français ────────────────────────────────────────────────────────
        'fr' => [
            'c.greet' => 'Assalamu alaykum wa rahmatullahi wa barakatuh,',
            'c.greet_name' => 'Assalamu alaykum wa rahmatullahi wa barakatuh, {name},',
            'c.signoff' => 'Avec nos meilleures invocations,',
            'c.team' => 'L’équipe {app}',
            'c.tagline' => '{app} — gratuit, pour l’agrément d’Allah, sans publicité',
            'c.site' => 'Site', 'c.support' => 'Assistance', 'c.privacy' => 'Confidentialité',
            'c.fallback' => 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
            'c.meaning' => 'Sens',
            'c.utc' => 'Temps universel coordonné (UTC)',

            'verify.subject' => 'Confirmez votre adresse e-mail — {app}',
            'verify.preheader' => 'Une dernière étape pour activer votre compte {app}.',
            'verify.title' => 'Confirmez votre adresse e-mail',
            'verify.p1' => 'Merci d’avoir rejoint {app}. Il ne reste qu’une étape pour activer votre compte : confirmer votre adresse e-mail, afin que nous puissions protéger votre compte et vous écrire si nécessaire.',
            'verify.button' => 'Confirmer mon adresse',
            'verify.after' => 'Ce lien est valable 24 heures et ne peut être utilisé qu’une seule fois.',
            'verify.notice' => 'Si vous n’avez pas créé de compte sur {app}, ignorez simplement ce message : cette adresse ne sera pas confirmée.',
            'verify.reason' => 'Vous recevez cet e-mail car cette adresse a été utilisée pour créer un compte sur {app}.',

            'reset.subject' => 'Réinitialisation de votre mot de passe — {app}',
            'reset.preheader' => 'Un lien pour choisir un nouveau mot de passe, valable une heure.',
            'reset.title' => 'Réinitialiser votre mot de passe',
            'reset.p1' => 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte {app}. Pour choisir un nouveau mot de passe, utilisez le bouton ci-dessous.',
            'reset.button' => 'Choisir un nouveau mot de passe',
            'reset.after' => 'Ce lien est valable une heure et ne peut être utilisé qu’une seule fois. Une fois le mot de passe changé, votre compte sera déconnecté de tous les appareils par précaution.',
            'reset.notice' => 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe restera inchangé. Ne partagez jamais ce lien ; notre équipe ne vous le demandera jamais.',
            'reset.reason' => 'Vous recevez cet e-mail car une réinitialisation du mot de passe a été demandée pour un compte associé à cette adresse.',

            'welcome.subject' => 'Bienvenue sur {app}',
            'welcome.preheader' => 'Votre compte est prêt : trois belles façons de commencer votre cheminement avec le Livre d’Allah.',
            'welcome.title' => 'Bienvenue sur {app}',
            'welcome.p1' => 'Votre compte est activé. Louange à Allah, par la grâce de qui s’accomplissent les bonnes œuvres. Nous demandons à Allah de faire du Coran le printemps de votre cœur et la lumière de votre poitrine.',
            'welcome.p2' => '{app} est gratuit, pour l’agrément d’Allah, et sans publicité. Voici trois belles façons de commencer :',
            'welcome.l1t' => 'Lire le Noble Coran',
            'welcome.l1d' => 'Un mushaf clair en écriture othmanienne, qui retient l’endroit où vous vous êtes arrêté pour reprendre facilement votre lecture.',
            'welcome.l2t' => 'Horaires de prière',
            'welcome.l2d' => 'Les horaires de prière de votre ville, avec aussi la direction de la qibla et les invocations du jour sur le site.',
            'welcome.l3t' => 'Khatma collective',
            'welcome.l3d' => 'Lancez une khatma avec vos proches et vos amis, répartissez les juz’ entre vous et suivez votre progression ensemble.',
            'welcome.button' => 'Commencer la lecture',
            'welcome.reason' => 'Vous recevez cet e-mail car vous avez activé votre compte sur {app}. Nous ne vous enverrons jamais d’e-mails promotionnels.',

            'pwd.subject' => 'Votre mot de passe a été modifié — {app}',
            'pwd.preheader' => 'Alerte de sécurité : le mot de passe de votre compte a été modifié le {date}.',
            'pwd.title' => 'Votre mot de passe a été modifié',
            'pwd.intro_change' => 'Nous vous informons que le mot de passe de votre compte {app} a été modifié depuis la page des paramètres, et que votre compte a été déconnecté des autres appareils par précaution.',
            'pwd.intro_reset' => 'Nous vous informons qu’un nouveau mot de passe a été défini pour votre compte {app} à l’aide d’un lien de réinitialisation, et que votre compte a été déconnecté de tous les appareils par précaution.',
            'pwd.time_label' => 'Date de la modification',
            'pwd.ok' => 'Si c’est bien vous, aucune action n’est nécessaire. Qu’Allah vous récompense pour le soin que vous portez à la sécurité de votre compte.',
            'pwd.notme' => 'Si ce n’est pas vous, réinitialisez immédiatement votre mot de passe avec le bouton ci-dessous, puis contactez-nous via la page d’assistance.',
            'pwd.button' => 'Réinitialiser mon mot de passe',
            'pwd.notice' => 'Pour votre sécurité : l’équipe {app} ne vous demandera jamais votre mot de passe, ni par e-mail ni autrement.',
            'pwd.reason' => 'Vous recevez cet e-mail car il s’agit d’une alerte de sécurité concernant votre compte, envoyée à chaque changement de mot de passe.',

            'team.subject_new' => 'Message de l’équipe {app} : {subject}',
            'team.subject_reply' => 'Nouvelle réponse de notre équipe d’assistance : {subject}',
            'team.title_new' => 'Un message de l’équipe {app}',
            'team.title_reply' => 'Nouvelle réponse de notre équipe d’assistance',
            'team.intro_new' => 'L’équipe {app} vous a envoyé un nouveau message via votre compte :',
            'team.intro_reply' => 'Notre équipe d’assistance a répondu à votre message. En voici un extrait :',
            'team.subject_label' => 'Objet',
            'team.after' => 'Pour lire le message en entier et y répondre, ouvrez la page d’assistance de votre compte.',
            'team.button' => 'Voir le message et répondre',
            'team.notice' => 'Merci de répondre depuis la page d’assistance du site, afin que toute la conversation reste au même endroit.',
            'team.reason' => 'Vous recevez cet e-mail car l’équipe {app} vous a écrit via votre compte sur le site.',

            'test.subject' => 'E-mail de test — {app}',
            'test.preheader' => 'Les réglages e-mail fonctionnent. Voici à quoi ressemblent les e-mails de vos utilisateurs.',
            'test.title' => 'E-mail de test',
            'test.p1' => 'Si ce message vous est parvenu, les réglages e-mail de {app} fonctionnent, louange à Allah.',
            'test.p2' => 'C’est un exemple complet de la présentation que reçoivent vos utilisateurs : l’en-tête, le texte, le bouton, le cadre du verset et le pied de page.',
            'test.details' => 'Détails de l’envoi',
            'test.via' => 'Méthode d’envoi : {via}',
            'test.from' => 'Expéditeur : {from}',
            'test.time' => 'Date : {date}',
            'test.via_server' => 'le serveur du site (mail)',
            'test.button' => 'Visiter {app}',
            'test.notice' => 'Cet e-mail de test a été envoyé depuis le panneau d’administration ; aucune réponse n’est nécessaire.',
            'test.reason' => 'Vous recevez cet e-mail car vous avez utilisé le bouton de test dans les réglages e-mail du panneau d’administration.',
        ],

        // ── اردو ────────────────────────────────────────────────────────────
        'ur' => [
            'c.greet' => 'السلام علیکم ورحمۃ اللہ وبرکاتہ،',
            'c.greet_name' => 'السلام علیکم ورحمۃ اللہ وبرکاتہ، {name}!',
            'c.signoff' => 'دعاؤں کے ساتھ،',
            'c.team' => '{app} ٹیم',
            'c.tagline' => '{app} — اللہ کی رضا کے لیے مفت، اشتہارات کے بغیر',
            'c.site' => 'ویب سائٹ', 'c.support' => 'مدد', 'c.privacy' => 'رازداری',
            'c.fallback' => 'اگر بٹن کام نہ کرے تو یہ لنک کاپی کر کے اپنے براؤزر میں کھولیں:',
            'c.meaning' => 'مفہوم',
            'c.utc' => 'عالمی معیاری وقت (UTC)',

            'verify.subject' => 'اپنی ای میل کی تصدیق کریں — {app}',
            'verify.preheader' => '{app} میں اپنا اکاؤنٹ فعال کرنے کے لیے بس ایک قدم باقی ہے۔',
            'verify.title' => 'ای میل کی تصدیق',
            'verify.p1' => '{app} میں شامل ہونے کا شکریہ۔ آپ کا اکاؤنٹ فعال کرنے کے لیے صرف ایک قدم باقی ہے، یعنی اپنی ای میل کی تصدیق، تاکہ ہم آپ کے اکاؤنٹ کی حفاظت کر سکیں اور ضرورت پڑنے پر آپ سے رابطہ کر سکیں۔',
            'verify.button' => 'ای میل کی تصدیق کریں',
            'verify.after' => 'یہ لنک ۲۴ گھنٹے کے لیے کارآمد ہے اور صرف ایک بار استعمال ہو سکتا ہے۔',
            'verify.notice' => 'اگر آپ نے {app} پر اکاؤنٹ نہیں بنایا تو اس ای میل کو نظر انداز کر دیں؛ یہ پتہ تصدیق شدہ نہیں ہوگا۔',
            'verify.reason' => 'آپ کو یہ ای میل اس لیے موصول ہوئی کہ یہ پتہ {app} پر اکاؤنٹ بنانے کے لیے استعمال کیا گیا۔',

            'reset.subject' => 'پاس ورڈ دوبارہ ترتیب دیں — {app}',
            'reset.preheader' => 'نیا پاس ورڈ منتخب کرنے کا لنک، جو ایک گھنٹے کے لیے کارآمد ہے۔',
            'reset.title' => 'پاس ورڈ دوبارہ ترتیب دیں',
            'reset.p1' => 'ہمیں آپ کے {app} اکاؤنٹ کا پاس ورڈ دوبارہ ترتیب دینے کی درخواست موصول ہوئی ہے۔ نیا پاس ورڈ منتخب کرنے کے لیے نیچے دیا گیا بٹن استعمال کریں۔',
            'reset.button' => 'نیا پاس ورڈ منتخب کریں',
            'reset.after' => 'یہ لنک ایک گھنٹے کے لیے کارآمد ہے اور صرف ایک بار استعمال ہو سکتا ہے۔ پاس ورڈ تبدیل ہونے کے بعد احتیاطاً آپ کا اکاؤنٹ تمام آلات سے لاگ آؤٹ کر دیا جائے گا۔',
            'reset.notice' => 'اگر آپ نے یہ درخواست نہیں کی تو اس ای میل کو نظر انداز کر دیں، آپ کا پاس ورڈ ویسا ہی رہے گا۔ یہ لنک کسی کے ساتھ شیئر نہ کریں؛ ہماری ٹیم آپ سے کبھی یہ نہیں مانگے گی۔',
            'reset.reason' => 'آپ کو یہ ای میل اس لیے موصول ہوئی کہ اس پتے سے منسلک اکاؤنٹ کے لیے پاس ورڈ دوبارہ ترتیب دینے کی درخواست کی گئی۔',

            'welcome.subject' => '{app} میں خوش آمدید',
            'welcome.preheader' => 'آپ کا اکاؤنٹ تیار ہے۔ اللہ کی کتاب کے ساتھ سفر شروع کرنے کے تین اچھے طریقے۔',
            'welcome.title' => '{app} میں خوش آمدید',
            'welcome.p1' => 'آپ کا اکاؤنٹ کامیابی سے فعال ہو گیا ہے۔ تمام تعریفیں اللہ کے لیے ہیں جس کی نعمت سے نیک کام پایۂ تکمیل کو پہنچتے ہیں۔ اللہ تعالیٰ قرآن کو آپ کے دل کی بہار اور سینے کا نور بنائے۔',
            'welcome.p2' => '{app} اللہ کی رضا کے لیے مفت ہے اور اس میں کوئی اشتہار نہیں۔ آغاز کے لیے تین اچھے طریقے:',
            'welcome.l1t' => 'قرآنِ کریم پڑھیں',
            'welcome.l1d' => 'رسمِ عثمانی میں واضح مصحف، جو آپ کی تلاوت کا مقام یاد رکھتا ہے تاکہ آپ وہیں سے دوبارہ شروع کر سکیں۔',
            'welcome.l2t' => 'اوقاتِ نماز',
            'welcome.l2d' => 'آپ کے شہر کے اوقاتِ نماز، نیز ویب سائٹ پر قبلہ کی سمت اور روزانہ کے اذکار۔',
            'welcome.l3t' => 'اجتماعی ختمِ قرآن',
            'welcome.l3d' => 'اپنے گھر والوں اور دوستوں کے ساتھ ختمِ قرآن شروع کریں، پارے آپس میں تقسیم کریں اور مل کر پیش رفت دیکھیں۔',
            'welcome.button' => 'تلاوت شروع کریں',
            'welcome.reason' => 'آپ کو یہ ای میل اس لیے موصول ہوئی کہ آپ نے {app} پر اپنا اکاؤنٹ فعال کیا۔ ہم آپ کو کبھی تشہیری ای میل نہیں بھیجیں گے۔',

            'pwd.subject' => 'آپ کا پاس ورڈ تبدیل کر دیا گیا — {app}',
            'pwd.preheader' => 'حفاظتی اطلاع: آپ کے اکاؤنٹ کا پاس ورڈ {date} کو تبدیل کیا گیا۔',
            'pwd.title' => 'پاس ورڈ تبدیل کر دیا گیا',
            'pwd.intro_change' => 'ہم آپ کو مطلع کرنا چاہتے ہیں کہ آپ کے {app} اکاؤنٹ کا پاس ورڈ سیٹنگز کے صفحے سے تبدیل کیا گیا ہے، اور احتیاطاً دوسرے آلات سے آپ کا اکاؤنٹ لاگ آؤٹ کر دیا گیا ہے۔',
            'pwd.intro_reset' => 'ہم آپ کو مطلع کرنا چاہتے ہیں کہ ری سیٹ لنک کے ذریعے آپ کے {app} اکاؤنٹ کے لیے نیا پاس ورڈ مقرر کیا گیا ہے، اور احتیاطاً تمام آلات سے آپ کا اکاؤنٹ لاگ آؤٹ کر دیا گیا ہے۔',
            'pwd.time_label' => 'تبدیلی کا وقت',
            'pwd.ok' => 'اگر یہ آپ نے کیا ہے تو کسی کارروائی کی ضرورت نہیں۔ اپنے اکاؤنٹ کی حفاظت کا خیال رکھنے پر جزاک اللہ خیراً۔',
            'pwd.notme' => 'اگر یہ آپ نہیں تھے تو نیچے دیے گئے بٹن سے فوراً اپنا پاس ورڈ دوبارہ ترتیب دیں، پھر مدد کے صفحے کے ذریعے ہم سے رابطہ کریں۔',
            'pwd.button' => 'ابھی پاس ورڈ دوبارہ ترتیب دیں',
            'pwd.notice' => 'آپ کی حفاظت کے لیے: {app} کی ٹیم آپ سے کبھی پاس ورڈ نہیں مانگے گی، نہ ای میل کے ذریعے اور نہ کسی اور طریقے سے۔',
            'pwd.reason' => 'آپ کو یہ ای میل اس لیے موصول ہوئی کہ یہ آپ کے اکاؤنٹ سے متعلق حفاظتی اطلاع ہے، جو ہر بار پاس ورڈ تبدیل ہونے پر بھیجی جاتی ہے۔',

            'team.subject_new' => '{app} ٹیم کی طرف سے پیغام: {subject}',
            'team.subject_reply' => 'سپورٹ ٹیم کا نیا جواب: {subject}',
            'team.title_new' => '{app} ٹیم کی طرف سے پیغام',
            'team.title_reply' => 'سپورٹ ٹیم کا نیا جواب',
            'team.intro_new' => '{app} ٹیم نے آپ کے اکاؤنٹ کے ذریعے آپ کو ایک نیا پیغام بھیجا ہے:',
            'team.intro_reply' => 'سپورٹ ٹیم نے آپ کے پیغام کا جواب دیا ہے۔ جواب کا ایک حصہ:',
            'team.subject_label' => 'موضوع',
            'team.after' => 'پورا پیغام پڑھنے اور جواب دینے کے لیے اپنے اکاؤنٹ میں مدد کا صفحہ کھولیں۔',
            'team.button' => 'پیغام دیکھیں اور جواب دیں',
            'team.notice' => 'براہِ کرم ویب سائٹ پر مدد کے صفحے سے جواب دیں تاکہ پوری گفتگو ایک ہی جگہ رہے۔',
            'team.reason' => 'آپ کو یہ ای میل اس لیے موصول ہوئی کہ {app} ٹیم نے ویب سائٹ پر آپ کے اکاؤنٹ کے ذریعے آپ کو لکھا ہے۔',

            'test.subject' => 'آزمائشی ای میل — {app}',
            'test.preheader' => 'ای میل کی ترتیبات کام کر رہی ہیں۔ صارفین کو ملنے والی ای میلز ایسی دکھائی دیتی ہیں۔',
            'test.title' => 'آزمائشی ای میل',
            'test.p1' => 'اگر یہ پیغام آپ تک پہنچ گیا ہے تو {app} کی ای میل ترتیبات درست کام کر رہی ہیں، الحمد للہ۔',
            'test.p2' => 'یہ اس ڈیزائن کا مکمل نمونہ ہے جو صارفین کو موصول ہوتا ہے: ہیڈر، متن، بٹن، آیت کا فریم اور فوٹر۔',
            'test.details' => 'ارسال کی تفصیلات',
            'test.via' => 'ارسال کا طریقہ: {via}',
            'test.from' => 'بھیجنے والا: {from}',
            'test.time' => 'وقت: {date}',
            'test.via_server' => 'ویب سائٹ کا سرور (mail)',
            'test.button' => '{app} دیکھیں',
            'test.notice' => 'یہ آزمائشی ای میل ایڈمن پینل سے بھیجی گئی ہے، اس کا جواب دینے کی ضرورت نہیں۔',
            'test.reason' => 'آپ کو یہ ای میل اس لیے موصول ہوئی کہ آپ نے ایڈمن پینل کی ای میل ترتیبات میں آزمائش کا بٹن دبایا۔',
        ],

        // ── Bahasa Indonesia ────────────────────────────────────────────────
        'id' => [
            'c.greet' => 'Assalamu’alaikum warahmatullahi wabarakatuh,',
            'c.greet_name' => 'Assalamu’alaikum warahmatullahi wabarakatuh, {name},',
            'c.signoff' => 'Salam hangat dan doa kami,',
            'c.team' => 'Tim {app}',
            'c.tagline' => '{app} — gratis karena Allah, tanpa iklan',
            'c.site' => 'Situs', 'c.support' => 'Bantuan', 'c.privacy' => 'Privasi',
            'c.fallback' => 'Jika tombol tidak berfungsi, salin tautan ini ke peramban Anda:',
            'c.meaning' => 'Artinya',
            'c.utc' => 'Waktu Universal Terkoordinasi (UTC)',

            'verify.subject' => 'Konfirmasi email Anda — {app}',
            'verify.preheader' => 'Satu langkah terakhir untuk mengaktifkan akun {app} Anda.',
            'verify.title' => 'Konfirmasi alamat email Anda',
            'verify.p1' => 'Terima kasih telah bergabung dengan {app}. Tinggal satu langkah lagi untuk mengaktifkan akun Anda, yaitu mengonfirmasi alamat email, agar kami dapat menjaga keamanan akun Anda dan menghubungi Anda bila diperlukan.',
            'verify.button' => 'Konfirmasi email saya',
            'verify.after' => 'Tautan ini berlaku selama 24 jam dan hanya dapat digunakan satu kali.',
            'verify.notice' => 'Jika Anda tidak membuat akun di {app}, abaikan saja email ini; alamat ini tidak akan dikonfirmasi.',
            'verify.reason' => 'Anda menerima email ini karena alamat ini digunakan untuk membuat akun di {app}.',

            'reset.subject' => 'Atur ulang kata sandi — {app}',
            'reset.preheader' => 'Tautan untuk membuat kata sandi baru, berlaku selama satu jam.',
            'reset.title' => 'Atur ulang kata sandi',
            'reset.p1' => 'Kami menerima permintaan untuk mengatur ulang kata sandi akun {app} Anda. Untuk membuat kata sandi baru, silakan gunakan tombol di bawah ini.',
            'reset.button' => 'Buat kata sandi baru',
            'reset.after' => 'Tautan ini berlaku selama satu jam dan hanya dapat digunakan satu kali. Setelah kata sandi diganti, akun Anda akan dikeluarkan dari semua perangkat sebagai langkah pengamanan.',
            'reset.notice' => 'Jika Anda tidak memintanya, abaikan email ini dan kata sandi Anda tidak akan berubah. Jangan bagikan tautan ini kepada siapa pun; tim kami tidak akan pernah memintanya.',
            'reset.reason' => 'Anda menerima email ini karena ada permintaan atur ulang kata sandi untuk akun yang terhubung dengan alamat ini.',

            'welcome.subject' => 'Selamat datang di {app}',
            'welcome.preheader' => 'Akun Anda sudah siap. Tiga cara baik untuk memulai perjalanan bersama Kitab Allah.',
            'welcome.title' => 'Selamat datang di {app}',
            'welcome.p1' => 'Akun Anda telah aktif. Segala puji bagi Allah yang dengan nikmat-Nya segala kebaikan menjadi sempurna. Semoga Allah menjadikan Al-Qur’an penyejuk hati dan cahaya dada Anda.',
            'welcome.p2' => '{app} gratis karena Allah, tanpa iklan. Berikut tiga cara baik untuk memulai:',
            'welcome.l1t' => 'Membaca Al-Qur’an',
            'welcome.l1d' => 'Mushaf yang jelas dengan rasm Utsmani, yang mengingat posisi terakhir bacaan Anda agar dapat dilanjutkan dari tempat Anda berhenti.',
            'welcome.l2t' => 'Jadwal salat',
            'welcome.l2d' => 'Jadwal salat untuk kota Anda, serta arah kiblat dan zikir harian di situs.',
            'welcome.l3t' => 'Khatam bersama',
            'welcome.l3d' => 'Mulailah khatam bersama keluarga dan teman, bagi juz di antara kalian, dan pantau kemajuannya bersama-sama.',
            'welcome.button' => 'Mulai membaca',
            'welcome.reason' => 'Anda menerima email ini karena telah mengaktifkan akun di {app}. Kami tidak akan pernah mengirimkan email promosi.',

            'pwd.subject' => 'Kata sandi Anda telah diubah — {app}',
            'pwd.preheader' => 'Pemberitahuan keamanan: kata sandi akun Anda diubah pada {date}.',
            'pwd.title' => 'Kata sandi Anda telah diubah',
            'pwd.intro_change' => 'Kami ingin memberitahukan bahwa kata sandi akun {app} Anda telah diubah melalui halaman pengaturan, dan akun Anda telah dikeluarkan dari perangkat lain sebagai langkah pengamanan.',
            'pwd.intro_reset' => 'Kami ingin memberitahukan bahwa kata sandi baru telah dibuat untuk akun {app} Anda melalui tautan atur ulang, dan akun Anda telah dikeluarkan dari semua perangkat sebagai langkah pengamanan.',
            'pwd.time_label' => 'Waktu perubahan',
            'pwd.ok' => 'Jika itu memang Anda, tidak ada yang perlu dilakukan. Jazakallahu khairan atas kepedulian Anda terhadap keamanan akun.',
            'pwd.notme' => 'Jika bukan Anda, segera atur ulang kata sandi melalui tombol di bawah ini, lalu hubungi kami lewat halaman bantuan.',
            'pwd.button' => 'Atur ulang kata sandi sekarang',
            'pwd.notice' => 'Demi keamanan Anda: tim {app} tidak akan pernah meminta kata sandi Anda, baik melalui email maupun cara lain.',
            'pwd.reason' => 'Anda menerima email ini karena merupakan pemberitahuan keamanan untuk akun Anda, yang dikirim setiap kali kata sandi diubah.',

            'team.subject_new' => 'Pesan dari tim {app}: {subject}',
            'team.subject_reply' => 'Balasan baru dari tim bantuan: {subject}',
            'team.title_new' => 'Pesan dari tim {app}',
            'team.title_reply' => 'Balasan baru dari tim bantuan',
            'team.intro_new' => 'Tim {app} mengirimkan pesan baru kepada Anda melalui akun Anda:',
            'team.intro_reply' => 'Tim bantuan kami telah membalas pesan Anda. Berikut cuplikannya:',
            'team.subject_label' => 'Perihal',
            'team.after' => 'Untuk membaca pesan selengkapnya dan membalasnya, buka halaman bantuan di akun Anda.',
            'team.button' => 'Lihat dan balas',
            'team.notice' => 'Mohon balas melalui halaman bantuan di situs agar seluruh percakapan tetap berada di satu tempat.',
            'team.reason' => 'Anda menerima email ini karena tim {app} menghubungi Anda melalui akun Anda di situs.',

            'test.subject' => 'Email uji coba — {app}',
            'test.preheader' => 'Pengaturan email berfungsi. Beginilah tampilan email yang diterima pengguna Anda.',
            'test.title' => 'Email uji coba',
            'test.p1' => 'Jika pesan ini sampai kepada Anda, pengaturan email {app} berfungsi dengan baik, alhamdulillah.',
            'test.p2' => 'Ini adalah contoh lengkap tampilan yang diterima pengguna: kepala surat, teks, tombol, bingkai ayat, dan bagian kaki.',
            'test.details' => 'Rincian pengiriman',
            'test.via' => 'Metode pengiriman: {via}',
            'test.from' => 'Pengirim: {from}',
            'test.time' => 'Waktu: {date}',
            'test.via_server' => 'server situs (mail)',
            'test.button' => 'Kunjungi {app}',
            'test.notice' => 'Email uji coba ini dikirim dari panel admin dan tidak perlu dibalas.',
            'test.reason' => 'Anda menerima email ini karena menekan tombol uji coba di pengaturan email panel admin.',
        ],
    ];
}
