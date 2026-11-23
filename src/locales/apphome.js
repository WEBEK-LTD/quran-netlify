// The app's home screen (src/pages/AppHome.jsx, app only) and the Qibla compass's
// calibration / sensor states (src/pages/QiblaPage.jsx, site and app).
// Each row: [Arabic source, en, tr, fr, ur, id]. Keys are the exact Arabic strings.
const ROWS = [
  // ── app home ──
  ['السلام عليكم', 'Assalamu alaikum', 'Esselâmü aleyküm', 'Assalamou alaykoum', 'السلام علیکم', 'Assalamu’alaikum'],
  ['السلام عليكم، {name}', 'Assalamu alaikum, {name}', 'Esselâmü aleyküm, {name}', 'Assalamou alaykoum, {name}', 'السلام علیکم، {name}', 'Assalamu’alaikum, {name}'],
  ['صباح الخير', 'Good morning', 'Günaydın', 'Bonjour', 'صبح بخیر', 'Selamat pagi'],
  ['مساء الخير', 'Good evening', 'İyi akşamlar', 'Bonsoir', 'شام بخیر', 'Selamat sore'],
  ['الأقسام', 'Sections', 'Bölümler', 'Rubriques', 'حصے', 'Menu'],
  ['الآية {n} من {t}', 'Verse {n} of {t}', '{t} ayetin {n}. ayeti', 'Verset {n} sur {t}', '{t} میں سے آیت {n}', 'Ayat {n} dari {t}'],
  ['التسبيح', 'Tasbih', 'Tesbih', 'Tasbih', 'تسبیح', 'Tasbih'],
  // ── qibla compass ──
  ['البوصلة تحتاج إلى معايرة', 'The compass needs calibrating', 'Pusulanın kalibre edilmesi gerekiyor', 'La boussole doit être calibrée', 'کمپاس کو کیلیبریٹ کرنا ضروری ہے', 'Kompas perlu dikalibrasi'],
  ['حرّك الهاتف في الهواء على شكل الرقم ٨ مرتين أو ثلاثاً، وابتعد عن المعادن والمغناطيس والأجهزة الكهربائية.',
    'Move your phone through the air in a figure 8 two or three times, away from metal, magnets and electrical devices.',
    'Telefonunuzu havada iki üç kez 8 çizecek şekilde hareket ettirin; metallerden, mıknatıslardan ve elektrikli cihazlardan uzak durun.',
    'Décrivez deux ou trois fois un 8 en l’air avec votre téléphone, loin des métaux, des aimants et des appareils électriques.',
    'فون کو ہوا میں دو تین بار ۸ کی شکل میں گھمائیں، اور دھات، مقناطیس اور برقی آلات سے دور رہیں۔',
    'Gerakkan ponsel di udara membentuk angka 8 dua atau tiga kali, jauh dari logam, magnet, dan perangkat listrik.'],
  ['الاتجاه مُصحَّح بالانحراف المغناطيسي لموقعك ({d}°).',
    'Corrected for the magnetic declination at your location ({d}°).',
    'Konumunuzdaki manyetik sapmaya göre düzeltildi ({d}°).',
    'Corrigé de la déclinaison magnétique à votre position ({d}°).',
    'آپ کے مقام کے مقناطیسی انحراف کے مطابق درست کیا گیا ({d}°)۔',
    'Dikoreksi dengan deklinasi magnetik di lokasi Anda ({d}°).'],
  ['لا يوجد حسّاس بوصلة', 'No compass sensor', 'Pusula sensörü yok', 'Pas de capteur de boussole', 'کمپاس سینسر موجود نہیں', 'Tidak ada sensor kompas'],
];

const LANGS = ['en', 'tr', 'fr', 'ur', 'id'];
const out = { en: {}, tr: {}, fr: {}, ur: {}, id: {} };
for (const [ar, ...t] of ROWS) LANGS.forEach((l, i) => { out[l][ar] = t[i]; });
export default out;
