// ─── Surah text (Uthmani) ─────────────────────────────────────────────────────
// Kept in memory for the session and in localStorage for the last few surahs, so
// reopening the mushaf (or going back to a surah) shows the text at once instead
// of a skeleton. Requests for the same surah share one fetch.
const _ayahCache = new Map();      // surah → ayahs
const _ayahInflight = new Map();   // surah → promise
const AYAH_LS = 'nq_text_';        // + surah
const AYAH_LS_INDEX = 'nq_text_idx';
const AYAH_LS_MAX = 12;

function readCachedAyahs(surahNum) {
  if (_ayahCache.has(surahNum)) return _ayahCache.get(surahNum);
  try {
    const raw = localStorage.getItem(AYAH_LS + surahNum);
    if (!raw) return null;
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length) { _ayahCache.set(surahNum, list); return list; }
  } catch {}
  return null;
}

function rememberAyahs(surahNum, list) {
  _ayahCache.set(surahNum, list);
  try {
    let idx = [];
    try { idx = JSON.parse(localStorage.getItem(AYAH_LS_INDEX) || '[]') || []; } catch {}
    idx = [surahNum, ...idx.filter(n => n !== surahNum)];
    while (idx.length > AYAH_LS_MAX) localStorage.removeItem(AYAH_LS + idx.pop());
    localStorage.setItem(AYAH_LS + surahNum, JSON.stringify(list));
    localStorage.setItem(AYAH_LS_INDEX, JSON.stringify(idx));
  } catch {
    // storage full: the memory copy is enough for this session
  }
}

/** The surah's ayahs if they are already on this device (sync), else null. */
export function cachedSurahAyahs(surahNum) {
  return readCachedAyahs(surahNum);
}

export function fetchSurahAyahs(surahNum) {
  const hit = readCachedAyahs(surahNum);
  if (hit) return Promise.resolve(hit);
  if (_ayahInflight.has(surahNum)) return _ayahInflight.get(surahNum);
  const p = loadSurahAyahs(surahNum)
    .then(list => { rememberAyahs(surahNum, list); return list; })
    .finally(() => { _ayahInflight.delete(surahNum); });
  _ayahInflight.set(surahNum, p);
  return p;
}

/** Warm the cache for a surah the visitor is likely to open next (fire and forget). */
export function prefetchSurahAyahs(surahNum) {
  if (!(surahNum >= 1 && surahNum <= 114) || readCachedAyahs(surahNum) || _ayahInflight.has(surahNum)) return;
  fetchSurahAyahs(surahNum).catch(() => {});
}

async function loadSurahAyahs(surahNum) {
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
    // Fallback: quran.com v4 — max 50 verses per page, so paginate.
    // Note: its text has no basmala prefix (Reader only strips it when present).
    const verses = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await fetch(
        `https://api.quran.com/api/v4/verses/by_chapter/${surahNum}?language=ar&words=false&fields=text_uthmani&per_page=50&page=${page}`
      );
      if (!res.ok) throw new Error('Quran.com API error');
      const data = await res.json();
      verses.push(...(data.verses || []));
      totalPages = data.pagination?.total_pages || 1;
      page++;
    } while (page <= totalPages && page <= 10);
    if (!verses.length) throw new Error('Quran.com API returned no verses');
    return verses.map(v => ({
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

// everyayah has no separate basmala file: it is Al-Fatiha 1 (Kufi), 001001.
export function getBasmalaUrl(readerId) {
  return getAudioUrl(readerId, 1, 1);
}

// Every file needed to listen to a whole surah: the basmala (surahs ≠ 1, 9) + each ayah.
export function getSurahAudioUrls(readerId, surahNum, ayahCount) {
  const urls = [];
  if (surahNum !== 1 && surahNum !== 9) urls.push(getBasmalaUrl(readerId));
  for (let a = 1; a <= ayahCount; a++) urls.push(getAudioUrl(readerId, surahNum, a));
  return urls;
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
 * Fetch full surah tafsir for a given edition (returns array keyed by ayahNum).
 * Kept in memory for the session; requests for the same surah/edition share one fetch.
 */
const _tafsirCache = new Map();
export function cachedSurahTafsir(surahNum, edition = 'ar.muyassar') {
  const v = _tafsirCache.get(`${surahNum}:${edition}`);
  return Array.isArray(v) ? v : null;
}
export function fetchSurahTafsir(surahNum, edition = 'ar.muyassar') {
  const key = `${surahNum}:${edition}`;
  const hit = _tafsirCache.get(key);
  if (hit) return Array.isArray(hit) ? Promise.resolve(hit) : hit;
  const p = fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/${edition}`)
    .then(res => { if (!res.ok) throw new Error('Tafsir API error'); return res.json(); })
    .then(data => {
      const list = data.data.ayahs.map(a => ({ number: a.numberInSurah, tafsir: a.text }));
      _tafsirCache.set(key, list);
      return list;
    })
    .catch(err => { _tafsirCache.delete(key); throw err; });
  _tafsirCache.set(key, p);
  return p;
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
