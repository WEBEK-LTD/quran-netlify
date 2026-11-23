// ─── JUZ (أجزاء) ────────────────────────────────────────────────────────────
// Each entry: [juzNum, startSurah, startAyah, endSurah, endAyah]
export const JUZ_DATA = [
  [1,  1,1,   2,141],  [2,  2,142,  2,252],  [3,  2,253,  3,92],
  [4,  3,93,  4,23],   [5,  4,24,   4,147],  [6,  4,148,  5,81],
  [7,  5,82,  6,110],  [8,  6,111,  7,87],   [9,  7,88,   8,40],
  [10, 8,41,  9,92],   [11, 9,93,   11,5],   [12, 11,6,   12,52],
  [13, 12,53, 14,52],  [14, 15,1,   16,128],  [15, 17,1,   18,74],
  [16, 18,75, 20,135], [17, 21,1,   22,78],   [18, 23,1,   25,20],
  [19, 25,21, 27,55],  [20, 27,56,  29,45],   [21, 29,46,  33,30],
  [22, 33,31, 36,27],  [23, 36,28,  39,31],   [24, 39,32,  41,46],
  [25, 41,47, 45,37],  [26, 46,1,   51,30],   [27, 51,31,  57,29],
  [28, 58,1,  66,12],  [29, 67,1,   77,50],   [30, 78,1,   114,6],
];

// ─── HIZB (أحزاب) ────────────────────────────────────────────────────────────
// 60 ahzab total (2 per juz)
export const HIZB_COUNT = 60;

// ─── SURAH ayah counts (indexed 0-113) — Tanzil, 114 surahs, 6236 ayat ─────
export const SURAH_AYAH_COUNT = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,
  54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
  14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,
  29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,
  11,8,3,9,5,4,7,3,6,3,5,4,5,6
];

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────
// stats: { completedSurahs, memorizedAyahs, streak, wardDays, juzAmmaDone }

// جزء عمّ = السور 78–114 — يتحقق فقط عند اكتمال جميعها
export function isJuzAmmaDone(surahStatus = {}) {
  for (let s = 78; s <= 114; s++) {
    if (surahStatus[s] !== 'completed') return false;
  }
  return true;
}

export const ACHIEVEMENTS = [
  { id: 'first_surah',   icon: '🌱', title: 'البداية',        desc: 'احفظ سورة واحدة',          condition: s => s.completedSurahs >= 1 },
  { id: 'short_surahs',  icon: '⭐', title: 'السور القصيرة',   desc: 'احفظ جزء عمّ (السور 78-114)', condition: s => !!s.juzAmmaDone },
  { id: 'five_surahs',   icon: '🌟', title: 'خمس سور',        desc: 'احفظ 5 سور',                condition: s => s.completedSurahs >= 5 },
  { id: 'ten_surahs',    icon: '💫', title: 'عشر سور',        desc: 'احفظ 10 سور',               condition: s => s.completedSurahs >= 10 },
  { id: 'half_quran',    icon: '🏅', title: 'نصف القرآن',     desc: 'احفظ 57 سورة',              condition: s => s.completedSurahs >= 57 },
  { id: 'full_quran',    icon: '🏆', title: 'حافظ القرآن',    desc: 'احفظ القرآن كاملاً',         condition: s => s.completedSurahs >= 114 },
  { id: 'week_streak',   icon: '🔥', title: 'أسبوع متواصل',   desc: 'مراجعة 7 أيام متتالية',      condition: s => s.streak >= 7 },
  { id: 'month_streak',  icon: '🌙', title: 'شهر متواصل',     desc: 'مراجعة 30 يوماً متتالياً',   condition: s => s.streak >= 30 },
  { id: 'hundred_ayahs', icon: '📖', title: 'مئة آية',        desc: 'احفظ 100 آية',               condition: s => s.memorizedAyahs >= 100 },
  { id: 'five_hundred',  icon: '📚', title: 'خمسمئة آية',     desc: 'احفظ 500 آية',               condition: s => s.memorizedAyahs >= 500 },
  { id: 'daily_ward',    icon: '☀️', title: 'الورد اليومي',   desc: 'أكمل وردك 3 أيام',           condition: s => s.wardDays >= 3 },
];

// Total ayahs in Quran
export const TOTAL_AYAHS = 6236;

// ─── Juz ayah ranges ──────────────────────────────────────────────────────────
// Returns the per-surah ayah ranges covered by a juz: [{ surah, from, to }]
export function juzSurahRanges(juzNum) {
  const row = JUZ_DATA[juzNum - 1];
  if (!row) return [];
  const [, s1, a1, s2, a2] = row;
  const out = [];
  for (let s = s1; s <= s2; s++) {
    const from = s === s1 ? a1 : 1;
    const to   = s === s2 ? a2 : SURAH_AYAH_COUNT[s - 1];
    out.push({ surah: s, from, to });
  }
  return out;
}
