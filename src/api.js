export async function fetchSurahAyahs(surahNum) {
  // Primary: alquran.cloud (no CORS issues)
  try {
    const res = await fetch(
      `https://api.alquran.cloud/v1/surah/${surahNum}/ar.uthmani`
    );
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    return data.data.ayahs.map(a => ({
      number: a.numberInSurah,
      text: a.text,
      key: `${surahNum}:${a.numberInSurah}`,
    }));
  } catch (e) {
    // Fallback: quran.com v4
    const res = await fetch(
      `https://api.quran.com/api/v4/verses/by_chapter/${surahNum}?language=ar&words=false&per_page=300`
    );
    const data = await res.json();
    return data.verses.map(v => ({
      number: v.verse_number,
      text: v.text_uthmani || v.text_imlaei,
      key: v.verse_key,
    }));
  }
}

export function getAudioUrl(readerId, surahNum, ayahNum) {
  const s = String(surahNum).padStart(3, '0');
  const a = String(ayahNum).padStart(3, '0');
  return `https://everyayah.com/data/${readerId}/${s}${a}.mp3`;
}

// ─── Tafsir API ───────────────────────────────────────────────────────────────
// Available editions on alquran.cloud:
//   ar.muyassar  → التفسير الميسر
//   ar.jalalayn  → تفسير الجلالين
//   en.sahih     → English (Saheeh Int.) — kept as fallback reference

export const TAFSIR_EDITIONS = [
  { id: 'ar.muyassar',  name: 'التفسير الميسر',    short: 'ميسر'   },
  { id: 'ar.jalalayn',  name: 'تفسير الجلالين',     short: 'جلالين' },
  { id: 'ar.muyassar',  name: 'التفسير الميسر (2)', short: 'مقارنة' }, // demo second col
];

/**
 * Fetch a single ayah with a given tafsir edition.
 * Returns { text, tafsir }
 */
export async function fetchAyahWithTafsir(surahNum, ayahNum, edition = 'ar.muyassar') {
  const ref = `${surahNum}:${ayahNum}`;
  const [qRes, tRes] = await Promise.all([
    fetch(`https://api.alquran.cloud/v1/ayah/${ref}/ar.uthmani`),
    fetch(`https://api.alquran.cloud/v1/ayah/${ref}/${edition}`),
  ]);

  if (!qRes.ok || !tRes.ok) throw new Error('API error');
  const [qData, tData] = await Promise.all([qRes.json(), tRes.json()]);

  return {
    text:   qData.data.text,
    tafsir: tData.data.text,
    surahName: qData.data.surah.name,
    numberInSurah: qData.data.numberInSurah,
  };
}

/**
 * Fetch full surah tafsir for a given edition (returns array keyed by ayahNum)
 */
export async function fetchSurahTafsir(surahNum, edition = 'ar.muyassar') {
  const res = await fetch(
    `https://api.alquran.cloud/v1/surah/${surahNum}/${edition}`
  );
  if (!res.ok) throw new Error('Tafsir API error');
  const data = await res.json();
  return data.data.ayahs.map(a => ({
    number: a.numberInSurah,
    tafsir: a.text,
  }));
}


// ─── Translation API ──────────────────────────────────────────────────────────
const _transCache = {};

export async function fetchSurahTranslation(surahNum, edition) {
  if (!edition || edition === 'none') return [];
  const key = `${surahNum}:${edition}`;
  if (_transCache[key]) return _transCache[key];

  // Check localStorage cache
  const lsKey = `nq_trans_${key}`;
  try {
    const cached = localStorage.getItem(lsKey);
    if (cached) { _transCache[key] = JSON.parse(cached); return _transCache[key]; }
  } catch {}

  const res = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/${edition}`);
  if (!res.ok) throw new Error('Translation API error');
  const data = await res.json();
  const ayahs = data.data.ayahs.map(a => ({
    number: a.numberInSurah,
    text: a.text,
  }));

  // Cache in memory + localStorage (per surah ~5KB)
  _transCache[key] = ayahs;
  try { localStorage.setItem(lsKey, JSON.stringify(ayahs)); } catch {}
  return ayahs;
}
