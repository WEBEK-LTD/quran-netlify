// «تذكرة من كتاب الله لقلبك اليوم» — the home card and /tadhkira.
// Each row: [Arabic source, en, tr, fr, ur, id]. Keys are the exact Arabic strings.
// Several keys are short words («احفظ», «استمع», «رزق») that other pages use with
// another meaning, so these rows are read only through tadTr(); the shared
// dictionary (plain useTr) is left untouched. The feature-list title and
// description live in core.js with the rest of the feature list.
import { getLang } from '../i18n';
import { trNow } from '../l10n';

const ROWS = [
  ['تذكرة من كتاب الله لقلبك اليوم', 'A reminder from the Book of Allah for your heart today', "Bugün kalbiniz için Allah'ın Kitabı'ndan bir hatırlatma", "Un rappel du Livre d'Allah pour votre cœur aujourd'hui", 'آج آپ کے دل کے لیے اللہ کی کتاب سے ایک یاددہانی', 'Pengingat dari Kitab Allah untuk hatimu hari ini'],
  ['اضغط لتفتح تذكرتك اليوم', 'Tap to open your reminder for today', 'Bugünkü hatırlatmanızı açmak için dokunun', "Touchez pour ouvrir votre rappel du jour", 'آج کی یاددہانی کھولنے کے لیے دبائیں', 'Ketuk untuk membuka pengingatmu hari ini'],
  ['افتح تذكرتك اليوم', 'Open your reminder for today', 'Bugünkü hatırlatmanızı açın', "Ouvrir votre rappel du jour", 'آج کی یاددہانی کھولیں', 'Buka pengingatmu hari ini'],
  ['آيةٌ من كتاب الله تُفتح لك كل يوم، فيها رجاءٌ وطمأنينة.', 'An ayah from the Book of Allah that opens for you each day, with hope and calm in it.', "Her gün sizin için açılan, içinde umut ve huzur olan Allah'ın Kitabı'ndan bir ayet.", "Chaque jour, un verset du Livre d'Allah s'ouvre pour vous, porteur d'espoir et de sérénité.", 'ہر روز آپ کے لیے کھلنے والی اللہ کی کتاب کی ایک آیت، جس میں امید اور سکون ہے۔', 'Satu ayat dari Kitab Allah yang terbuka untukmu setiap hari, berisi harapan dan ketenangan.'],
  ['تذكرتك لهذا اليوم — تتجدد غداً', 'Your reminder for today — a new one tomorrow', 'Bugünkü hatırlatmanız — yarın yenilenir', "Votre rappel du jour — un nouveau demain", 'آج کی یاددہانی — کل نئی ہوگی', 'Pengingatmu hari ini — diperbarui besok'],
  ['تذكرتك اليوم', 'Your reminder today', 'Bugünkü hatırlatmanız', "Votre rappel du jour", 'آج کی یاددہانی', 'Pengingatmu hari ini'],
  ['اقرأ تذكرتك', 'Read your reminder', 'Hatırlatmanızı okuyun', 'Lire votre rappel', 'اپنی یاددہانی پڑھیں', 'Baca pengingatmu'],
  ['تُفتح تذكرتك…', 'Opening your reminder…', 'Hatırlatmanız açılıyor…', "Ouverture de votre rappel…", 'یاددہانی کھل رہی ہے…', 'Membuka pengingatmu…'],
  ['فُتحت تذكرتك: {ref}', 'Your reminder is open: {ref}', 'Hatırlatmanız açıldı: {ref}', 'Votre rappel est ouvert : {ref}', 'یاددہانی کھل گئی: {ref}', 'Pengingatmu terbuka: {ref}'],
  ['تذكرة اليوم: {theme}', "Today's theme: {theme}", 'Bugünün konusu: {theme}', 'Thème du jour : {theme}', 'آج کا موضوع: {theme}', 'Tema hari ini: {theme}'],
  ['تعذّر تحميل التذكرة. تحقّق من اتصالك ثم أعد المحاولة.', 'Could not load the reminder. Check your connection and try again.', 'Hatırlatma yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.', "Impossible de charger le rappel. Vérifiez votre connexion et réessayez.", 'یاددہانی لوڈ نہیں ہو سکی۔ کنکشن دیکھ کر دوبارہ کوشش کریں۔', 'Pengingat tidak dapat dimuat. Periksa koneksimu lalu coba lagi.'],
  ['أعد المحاولة', 'Try again', 'Tekrar deneyin', 'Réessayer', 'دوبارہ کوشش کریں', 'Coba lagi'],

  // reference line
  ['سورة {name} · الآية {n}', 'Surah {name} · Ayah {n}', '{name} Suresi · Ayet {n}', 'Sourate {name} · verset {n}', 'سورۃ {name} · آیت {n}', 'Surah {name} · Ayat {n}'],
  ['سورة {name} · الآيتان {a}–{b}', 'Surah {name} · Ayahs {a}–{b}', '{name} Suresi · Ayet {a}–{b}', 'Sourate {name} · versets {a}–{b}', 'سورۃ {name} · آیات {a}–{b}', 'Surah {name} · Ayat {a}–{b}'],
  ['سورة {name} · الآيات {a}–{b}', 'Surah {name} · Ayahs {a}–{b}', '{name} Suresi · Ayet {a}–{b}', 'Sourate {name} · versets {a}–{b}', 'سورۃ {name} · آیات {a}–{b}', 'Surah {name} · Ayat {a}–{b}'],
  ['سورة {name} · من الآية {n}', 'Surah {name} · from Ayah {n}', "{name} Suresi · {n}. ayetten", 'Sourate {name} · extrait du verset {n}', 'سورۃ {name} · آیت {n} کا حصہ', 'Surah {name} · bagian dari Ayat {n}'],

  // themes
  ['رزق', 'Provision', 'Rızık', 'Subsistance', 'رزق', 'Rezeki'],
  ['مغفرة', 'Forgiveness', 'Mağfiret', 'Pardon', 'مغفرت', 'Ampunan'],
  ['رحمة', 'Mercy', 'Rahmet', 'Miséricorde', 'رحمت', 'Rahmat'],
  ['توبة', 'Repentance', 'Tövbe', 'Repentir', 'توبہ', 'Tobat'],
  ['فرج', 'Relief', 'Ferahlık', 'Délivrance', 'کشادگی', 'Jalan keluar'],
  ['طمأنينة', 'Tranquillity', 'Huzur', 'Sérénité', 'اطمینان', 'Ketenangan'],
  ['توكل', 'Reliance on Allah', 'Tevekkül', 'Confiance en Allah', 'توکل', 'Tawakal'],
  ['دعاء', 'Supplication', 'Dua', 'Invocation', 'دعا', 'Doa'],
  ['صبر', 'Patience', 'Sabır', 'Patience', 'صبر', 'Sabar'],
  ['شكر', 'Gratitude', 'Şükür', 'Gratitude', 'شکر', 'Syukur'],

  // actions
  ['التفسير الميسّر', 'Tafsir al-Muyassar', 'Tefsîr el-Müyesser', 'Tafsir al-Muyassar', 'التفسیر المیسر', 'Tafsir Al-Muyassar'],
  ['استمع', 'Listen', 'Dinle', 'Écouter', 'سنیں', 'Dengarkan'],
  ['شارك كصورة', 'Share as image', 'Görsel olarak paylaş', 'Partager en image', 'تصویر کے طور پر شیئر کریں', 'Bagikan sebagai gambar'],
  ['احفظ', 'Save', 'Kaydet', 'Enregistrer', 'محفوظ کریں', 'Simpan'],
  ['محفوظة', 'Saved', 'Kaydedildi', 'Enregistré', 'محفوظ ہے', 'Tersimpan'],
  ['احفظ في المفضلة', 'Save to favorites', 'Favorilere kaydet', 'Enregistrer dans les favoris', 'پسندیدہ میں محفوظ کریں', 'Simpan ke favorit'],
  ['إزالة من المفضلة', 'Remove from favorites', 'Favorilerden kaldır', 'Retirer des favoris', 'پسندیدہ سے ہٹائیں', 'Hapus dari favorit'],
  ['استمع إلى التلاوة في المصحف', 'Listen to the recitation in the Mushaf', "Tilaveti Mushaf'ta dinle", 'Écouter la récitation dans le Mushaf', 'مصحف میں تلاوت سنیں', 'Dengarkan bacaan di mushaf'],

  // tafsir
  ['جارٍ تحميل التفسير', 'Loading the tafsir', 'Tefsir yükleniyor', 'Chargement du tafsir', 'تفسیر لوڈ ہو رہی ہے', 'Memuat tafsir'],
  ['تعذّر تحميل التفسير الآن.', 'Could not load the tafsir right now.', 'Tefsir şu anda yüklenemedi.', 'Impossible de charger le tafsir pour le moment.', 'تفسیر ابھی لوڈ نہیں ہو سکی۔', 'Tafsir tidak dapat dimuat sekarang.'],
  ['المصدر: التفسير الميسّر — مجمع الملك فهد لطباعة المصحف الشريف.', 'Source: Tafsir al-Muyassar — King Fahd Glorious Quran Printing Complex.', 'Kaynak: Tefsîr el-Müyesser — Kral Fahd Kur’an-ı Kerim Basım Kompleksi.', 'Source : Tafsir al-Muyassar — Complexe du Roi Fahd pour l’impression du Noble Coran.', 'ماخذ: التفسیر المیسر — شاہ فہد قرآن کریم پرنٹنگ کمپلیکس۔', 'Sumber: Tafsir Al-Muyassar — Kompleks Percetakan Al-Quran Raja Fahd.'],
  ['التفسير بالعربية', 'The tafsir is in Arabic', 'Tefsir Arapçadır', 'Le tafsir est en arabe', 'تفسیر عربی میں ہے', 'Tafsir dalam bahasa Arab'],

  // meaning
  ['ترجمة معاني الآية: {name}', 'Translation of the meaning: {name}', 'Meal (anlam tercümesi): {name}', 'Traduction du sens : {name}', 'ترجمۂ معانی: {name}', 'Terjemahan makna: {name}'],

  // the rule, under the card
  ['كل يوم آية جديدة من {n} آية مختارة في الرجاء، لا تتكرر عليك حتى تمرّ بها كلها.', 'A new ayah each day from {n} chosen ayahs of hope, with no repeats until you have been through them all.', 'Her gün, umut üzerine seçilmiş {n} ayetten yeni biri; hepsini görmeden hiçbiri tekrarlanmaz.', "Chaque jour un nouveau verset parmi {n} versets d'espoir choisis, sans répétition avant que vous les ayez tous parcourus.", 'ہر روز امید کی {n} منتخب آیات میں سے ایک نئی آیت، جب تک سب نہ گزر جائیں کوئی نہیں دہرائی جاتی۔', 'Setiap hari satu ayat baru dari {n} ayat harapan pilihan, tanpa pengulangan sampai semuanya kamu lalui.'],
  ['العودة للرئيسية', 'Back to home', 'Ana sayfaya dön', "Retour à l'accueil", 'ہوم پر واپس', 'Kembali ke beranda'],
];

const LANGS = ['en', 'tr', 'fr', 'ur', 'id'];
const own = { en: {}, tr: {}, fr: {}, ur: {}, id: {} };
for (const [ar, ...t] of ROWS) LANGS.forEach((l, i) => { own[l][ar] = t[i]; });

// Nothing is added to the shared dictionary (see the note at the top).
export default {};

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (all, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : all)) : s);
//   const tr = tadTr(useTr());      in components
export function tadTr(tr) {
  const f = (ar, vars) => {
    const hit = own[tr.lang] && own[tr.lang][ar];
    return hit ? fill(hit, vars) : tr(ar, vars);
  };
  f.lang = tr.lang;
  f.dir = tr.dir;
  return f;
}
export function tadTrNow(ar, vars) {
  const hit = own[getLang()] && own[getLang()][ar];
  return hit ? fill(hit, vars) : trNow(ar, vars);
}
