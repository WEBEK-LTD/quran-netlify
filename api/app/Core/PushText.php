<?php
declare(strict_types=1);

namespace NQ\Core;

/**
 * Notification wording in the member's language (users.lang: ar, en, tr, fr, ur, id).
 *
 * Notifications are written once, in Arabic, by the code that raises them (Push::notify…). This class
 * translates the fixed parts when a push is sent (Push::process) and when the in-app list is read
 * (GET /me/notifications). Names, room titles, group names, admin reasons and message text are what
 * people wrote and are never translated. Unknown text is returned unchanged.
 */
final class PushText
{
    public const LANGS = ['ar', 'en', 'tr', 'fr', 'ur', 'id'];

    /** Fixed sentences (titles and bodies). */
    private const FIXED = [
        'تم منعك من الغرف الصوتية' => [
            'en' => 'You have been barred from voice rooms', 'tr' => 'Sesli odalara katılmanız engellendi',
            'fr' => 'Vous ne pouvez plus rejoindre les salons vocaux', 'ur' => 'آپ کو صوتی رومز سے روک دیا گیا ہے',
            'id' => 'Anda dilarang masuk ruang suara',
        ],
        'تم إيقاف حسابك في المجتمع' => [
            'en' => 'Your community account has been suspended', 'tr' => 'Topluluk hesabınız askıya alındı',
            'fr' => 'Votre compte communautaire a été suspendu', 'ur' => 'کمیونٹی میں آپ کا اکاؤنٹ معطل کر دیا گیا ہے',
            'id' => 'Akun komunitas Anda ditangguhkan',
        ],
        'استخدمت كلمة محظورة. سيراجع فريق الإدارة الأمر.' => [
            'en' => 'You used a prohibited word. The moderation team will review it.',
            'tr' => 'Yasaklı bir kelime kullandınız. Yönetim ekibi inceleyecek.',
            'fr' => 'Vous avez utilisé un mot interdit. L’équipe de modération va examiner la situation.',
            'ur' => 'آپ نے ممنوعہ لفظ استعمال کیا۔ انتظامیہ اس کا جائزہ لے گی۔',
            'id' => 'Anda menggunakan kata terlarang. Tim moderasi akan meninjaunya.',
        ],
        'قبل طلب الصداقة.' => [
            'en' => 'accepted your friend request.', 'tr' => 'arkadaşlık isteğinizi kabul etti.',
            'fr' => 'a accepté votre demande d’ami.', 'ur' => 'نے آپ کی دوستی کی درخواست قبول کر لی۔',
            'id' => 'menerima permintaan pertemanan Anda.',
        ],
        'قبل طلب صداقتك.' => [
            'en' => 'accepted your friend request.', 'tr' => 'arkadaşlık isteğinizi kabul etti.',
            'fr' => 'a accepté votre demande d’ami.', 'ur' => 'نے آپ کی دوستی کی درخواست قبول کر لی۔',
            'id' => 'menerima permintaan pertemanan Anda.',
        ],
        'أرسل لك طلب صداقة.' => [
            'en' => 'sent you a friend request.', 'tr' => 'size arkadaşlık isteği gönderdi.',
            'fr' => 'vous a envoyé une demande d’ami.', 'ur' => 'نے آپ کو دوستی کی درخواست بھیجی ہے۔',
            'id' => 'mengirimi Anda permintaan pertemanan.',
        ],
        'تمت دعوتك للتحدث على المنصة.' => [
            'en' => 'You have been invited to speak on stage.', 'tr' => 'Sahnede konuşmaya davet edildiniz.',
            'fr' => 'Vous êtes invité à prendre la parole.', 'ur' => 'آپ کو اسٹیج پر بولنے کی دعوت دی گئی ہے۔',
            'id' => 'Anda diundang untuk berbicara di panggung.',
        ],
        'تغيّر موعد أو عنوان غرفة' => [
            'en' => 'A room’s time or title has changed', 'tr' => 'Bir odanın saati veya başlığı değişti',
            'fr' => 'L’horaire ou le titre d’un salon a changé', 'ur' => 'ایک روم کا وقت یا عنوان بدل گیا ہے',
            'id' => 'Waktu atau judul ruang berubah',
        ],
        'بدأت الغرفة الآن' => [
            'en' => 'The room has started', 'tr' => 'Oda şimdi başladı', 'fr' => 'Le salon a commencé',
            'ur' => 'روم ابھی شروع ہو گیا ہے', 'id' => 'Ruang sudah dimulai',
        ],
        'أُلغيت غرفة مجدولة' => [
            'en' => 'A scheduled room was cancelled', 'tr' => 'Planlanan bir oda iptal edildi',
            'fr' => 'Un salon programmé a été annulé', 'ur' => 'ایک طے شدہ روم منسوخ ہو گیا',
            'id' => 'Ruang terjadwal dibatalkan',
        ],
        'تبدأ بعد قليل' => [
            'en' => 'Starting soon', 'tr' => 'Birazdan başlıyor', 'fr' => 'Bientôt',
            'ur' => 'جلد شروع ہو رہا ہے', 'id' => 'Segera dimulai',
        ],
        'بشكل دائم' => [
            'en' => 'permanently', 'tr' => 'süresiz', 'fr' => 'définitivement', 'ur' => 'مستقل طور پر', 'id' => 'secara permanen',
        ],
    ];

    /** Sentences with a part written by people: regex on the Arabic text → template per language ({1}, {2}…). */
    private const PATTERNS = [
        '/^(.+) يطلب الانضمام إلى الجروب\.$/u' => [
            'en' => '{1} asked to join the group.', 'tr' => '{1} gruba katılmak istiyor.',
            'fr' => '{1} demande à rejoindre le groupe.', 'ur' => '{1} گروپ میں شامل ہونا چاہتے ہیں۔',
            'id' => '{1} meminta bergabung dengan grup.',
        ],
        '/^(.+) دعاك للانضمام إلى الجروب\.$/u' => [
            'en' => '{1} invited you to join the group.', 'tr' => '{1} sizi gruba davet etti.',
            'fr' => '{1} vous invite à rejoindre le groupe.', 'ur' => '{1} نے آپ کو گروپ میں شامل ہونے کی دعوت دی ہے۔',
            'id' => '{1} mengundang Anda bergabung dengan grup.',
        ],
        '/^غرفة مجدولة: (.*)$/su' => [
            'en' => 'Scheduled room: {1}', 'tr' => 'Planlanan oda: {1}', 'fr' => 'Salon programmé : {1}',
            'ur' => 'طے شدہ روم: {1}', 'id' => 'Ruang terjadwal: {1}',
        ],
        '/^غرفة مفتوحة الآن: (.*)$/su' => [
            'en' => 'Room open now: {1}', 'tr' => 'Şu an açık oda: {1}', 'fr' => 'Salon ouvert maintenant : {1}',
            'ur' => 'ابھی کھلا روم: {1}', 'id' => 'Ruang dibuka sekarang: {1}',
        ],
        '/^جدول غرفة: (.*)$/su' => [
            'en' => 'scheduled a room: {1}', 'tr' => 'bir oda planladı: {1}', 'fr' => 'a programmé un salon : {1}',
            'ur' => 'نے ایک روم طے کیا: {1}', 'id' => 'menjadwalkan ruang: {1}',
        ],
        '/^فتح غرفة الآن: (.*)$/su' => [
            'en' => 'opened a room now: {1}', 'tr' => 'şimdi bir oda açtı: {1}', 'fr' => 'vient d’ouvrir un salon : {1}',
            'ur' => 'نے ابھی ایک روم کھولا: {1}', 'id' => 'membuka ruang sekarang: {1}',
        ],
        '/^«(.*)» مفتوحة الآن\.$/su' => [
            'en' => '“{1}” is open now.', 'tr' => '“{1}” şu an açık.', 'fr' => '« {1} » est ouvert maintenant.',
            'ur' => '«{1}» ابھی کھلا ہے۔', 'id' => '“{1}” dibuka sekarang.',
        ],
        '/^«(.*)» لن تُعقد في موعدها\.$/su' => [
            'en' => '“{1}” will not take place as scheduled.', 'tr' => '“{1}” planlanan saatte yapılmayacak.',
            'fr' => '« {1} » n’aura pas lieu à l’heure prévue.', 'ur' => '«{1}» اپنے وقت پر نہیں ہوگا۔',
            'id' => '“{1}” tidak jadi diadakan sesuai jadwal.',
        ],
        '/^«(.*)» تبدأ خلال 10 دقائق\.$/su' => [
            'en' => '“{1}” starts in 10 minutes.', 'tr' => '“{1}” 10 dakika içinde başlıyor.',
            'fr' => '« {1} » commence dans 10 minutes.', 'ur' => '«{1}» 10 منٹ میں شروع ہو رہا ہے۔',
            'id' => '“{1}” dimulai dalam 10 menit.',
        ],
        // suspension body: "<admin reason> — حتى 2026-12-01" / "حتى …" / "… — بشكل دائم"
        '/^(.*?)(?: — )?حتى (\d{4}-\d{2}-\d{2})$/su' => [
            'en' => '{1}{sep}until {2}', 'tr' => '{1}{sep}{2} tarihine kadar', 'fr' => '{1}{sep}jusqu’au {2}',
            'ur' => '{1}{sep}{2} تک', 'id' => '{1}{sep}hingga {2}',
        ],
        '/^(.+) — بشكل دائم$/su' => [
            'en' => '{1} — permanently', 'tr' => '{1} — süresiz', 'fr' => '{1} — définitivement',
            'ur' => '{1} — مستقل طور پر', 'id' => '{1} — secara permanen',
        ],
    ];

    public static function lang(?string $lang): string
    {
        $l = strtolower(substr((string) $lang, 0, 2));
        return in_array($l, self::LANGS, true) ? $l : 'ar';
    }

    public static function tr(string $text, ?string $lang): string
    {
        $lang = self::lang($lang);
        if ($lang === 'ar' || $text === '') {
            return $text;
        }
        if (isset(self::FIXED[$text][$lang])) {
            return self::FIXED[$text][$lang];
        }
        foreach (self::PATTERNS as $re => $by) {
            if (!isset($by[$lang]) || !preg_match($re, $text, $m)) {
                continue;
            }
            $out = $by[$lang];
            $first = $m[1] ?? '';
            $out = str_replace('{sep}', $first !== '' ? ' — ' : '', $out);
            for ($i = count($m) - 1; $i >= 1; $i--) {
                $out = str_replace('{' . $i . '}', $m[$i], $out);
            }
            return $out;
        }
        return $text;
    }

    /**
     * @param array<string,mixed> $p a push payload {type,title,body,…}
     * @return array<string,mixed>
     */
    public static function payload(array $p, ?string $lang): array
    {
        foreach (['title', 'body'] as $k) {
            if (isset($p[$k]) && is_string($p[$k])) {
                $p[$k] = self::tr($p[$k], $lang);
            }
        }
        return $p;
    }
}
