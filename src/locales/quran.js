// The mushaf's tap-to-listen wording, the recitations page (/listen) and the
// tafsir page (/tafsir). Each row: [Arabic source, en, tr, fr, ur, id]. Keys are
// the exact Arabic strings. These rows are read first through quranTr(); anything
// not here falls back to the reader's own wording (core.js), then the shared
// dictionary.
import { getLang } from '../i18n';
import { coreTr, coreTrNow } from './core';

const ROWS = [
  // ── mushaf: one tap plays ──
  ['اضغط للاستماع من هذه الآية، واضغط مطوّلاً لبقية الأدوات', 'Tap to listen from this ayah; press and hold for more tools', 'Bu ayetten dinlemek için dokunun; diğer araçlar için basılı tutun', 'Touchez pour écouter à partir de ce verset ; appui long pour les autres outils', 'اس آیت سے سننے کے لیے دبائیں، باقی ٹولز کے لیے دیر تک دبائیں', 'Ketuk untuk mendengarkan dari ayat ini; tekan lama untuk alat lainnya'],
  ['المزيد: التفسير، المفضلة، النسخ…', 'More: tafsir, favorites, copy…', 'Daha fazla: tefsir, favoriler, kopyala…', 'Plus : tafsir, favoris, copier…', 'مزید: تفسیر، پسندیدہ، کاپی…', 'Lainnya: tafsir, favorit, salin…'],
  ['في المفضلة', 'In favorites', 'Favorilerde', 'Dans les favoris', 'پسندیدہ میں', 'Di favorit'],

  // ── /listen ──
  ['استمع إلى كتاب الله', 'Listen to the Book of Allah', "Allah'ın Kitabı'nı dinleyin", "Écoutez le Livre d'Allah", 'اللہ کی کتاب سنیں', 'Dengarkan Kitab Allah'],
  ['اختر القارئ، ثم اضغط على السورة لتستمع إليها كاملة. تبقى التلاوة مستمرة وأنت تتنقّل في التطبيق.', 'Choose a reciter, then tap a surah to hear it in full. The recitation keeps playing while you move around the app.', 'Bir kâri seçin, ardından tamamını dinlemek için bir sureye dokunun. Uygulamada gezinirken tilavet devam eder.', "Choisissez un récitateur, puis touchez une sourate pour l'écouter en entier. La récitation continue pendant que vous naviguez dans l'application.", 'قاری منتخب کریں، پھر پوری سورت سننے کے لیے اس پر دبائیں۔ ایپ میں دوسری جگہ جانے پر بھی تلاوت جاری رہتی ہے۔', 'Pilih qari, lalu ketuk surah untuk mendengarkannya sampai selesai. Bacaan tetap berlanjut saat Anda berpindah halaman di aplikasi.'],
  ['استمع إلى سورة {name} كاملة', 'Listen to Surah {name} in full', '{name} Suresi’ni baştan sona dinle', 'Écouter la sourate {name} en entier', 'سورۃ {name} مکمل سنیں', 'Dengarkan Surah {name} lengkap'],
  ['إيقاف سورة {name} مؤقتاً', 'Pause Surah {name}', '{name} Suresi’ni duraklat', 'Mettre en pause la sourate {name}', 'سورۃ {name} روکیں', 'Jeda Surah {name}'],
  ['متابعة سورة {name}', 'Resume Surah {name}', '{name} Suresi’ne devam et', 'Reprendre la sourate {name}', 'سورۃ {name} جاری رکھیں', 'Lanjutkan Surah {name}'],
  ['اقرأ سورة {name} في المصحف', 'Read Surah {name} in the Mushaf', "{name} Suresi’ni Mushaf'ta oku", 'Lire la sourate {name} dans le Mushaf', 'سورۃ {name} مصحف میں پڑھیں', 'Baca Surah {name} di mushaf'],
  ['اقرأها في المصحف', 'Read it in the Mushaf', "Mushaf'ta oku", 'La lire dans le Mushaf', 'مصحف میں پڑھیں', 'Baca di mushaf'],
  ['اقرأ مع التلاوة', 'Read along', 'Tilavetle birlikte oku', 'Lire en écoutant', 'تلاوت کے ساتھ پڑھیں', 'Baca sambil mendengar'],
  ['{n} سورة', '{n} surahs', '{n} sure', '{n} sourates', '{n} سورتیں', '{n} surah'],
  ['ابحث باسم السورة أو رقمها', 'Search by surah name or number', 'Sure adı veya numarasıyla ara', 'Chercher par nom ou numéro de sourate', 'سورت کے نام یا نمبر سے تلاش کریں', 'Cari dengan nama atau nomor surah'],

  // ── /tafsir ──
  ['السورة', 'Surah', 'Sure', 'Sourate', 'سورۃ', 'Surah'],
  ['الآية', 'Ayah', 'Ayet', 'Verset', 'آیت', 'Ayat'],
  ['استمع', 'Listen', 'Dinle', 'Écouter', 'سنیں', 'Dengarkan'],
  ['{name} · {ayah}', '{name} · {ayah}', '{name} · {ayah}', '{name} · {ayah}', '{name} · {ayah}', '{name} · {ayah}'],
  ['تعذّر تحميل التفسير — تحقّق من اتصالك بالإنترنت', 'Could not load the tafsir — check your internet connection', 'Tefsir yüklenemedi — internet bağlantınızı kontrol edin', 'Impossible de charger le tafsir — vérifiez votre connexion Internet', 'تفسیر لوڈ نہیں ہو سکی — انٹرنیٹ کنکشن دیکھیں', 'Tafsir tidak dapat dimuat — periksa koneksi internet Anda'],
  ['لا يوجد تفسير لهذه الآية في هذا المصدر.', 'This source has no tafsir for this ayah.', 'Bu kaynakta bu ayet için tefsir yok.', "Cette source n'a pas de tafsir pour ce verset.", 'اس ماخذ میں اس آیت کی تفسیر موجود نہیں۔', 'Sumber ini tidak memiliki tafsir untuk ayat ini.'],
  ['التنقل بين الآيات', 'Move between ayahs', 'Ayetler arasında gezin', 'Naviguer entre les versets', 'آیات کے درمیان جائیں', 'Berpindah antar ayat'],
];

const LANGS = ['en', 'tr', 'fr', 'ur', 'id'];
const out = { en: {}, tr: {}, fr: {}, ur: {}, id: {} };
for (const [ar, ...t] of ROWS) LANGS.forEach((l, i) => { out[l][ar] = t[i]; });
// Short keys here («الآية», «السورة», «استمع») mean the same everywhere, but this area
// keeps them to itself like tadhkira.js: nothing is added to the shared dictionary.
export default {};

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (all, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : all)) : s);

//   const tr = quranTr(useTr());   in components
//   quranTrNow('…')                in handlers / utilities
export function quranTr(tr) {
  const core = coreTr(tr);
  const f = (ar, vars) => {
    const own = out[tr.lang] && out[tr.lang][ar];
    return own ? fill(own, vars) : core(ar, vars);
  };
  f.lang = tr.lang;
  f.dir = tr.dir;
  return f;
}
export function quranTrNow(ar, vars) {
  const lang = getLang();
  const own = out[lang] && out[lang][ar];
  return own ? fill(own, vars) : coreTrNow(ar, vars);
}
