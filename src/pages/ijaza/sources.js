// ─── Where the riwayat texts and recordings come from ────────────────────────
// Texts: our API (GET /v1/riwayat/text/{edition}/{surah}, cached on the server)
//   → jsDelivr → raw.githubusercontent (fawazahmed0/quran-api, King Fahd
//   Complex texts) → for Hafs only, api.alquran.cloud as a last resort.
// Audio: our API (GET /v1/riwayat/audio, mp3quran.net mapped to our rawis),
//   loaded once per session → mp3quran.net directly if the API is unreachable.
import { API_BASE } from '../../apiClient';
import { HAFS_EDITION, RAWIS } from './riwayat';
import { SURAHS_META } from '../../data';

const ayahCount = s => SURAHS_META[s - 1][2];

const FAWAZ = [
  'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions',
  'https://raw.githubusercontent.com/fawazahmed0/quran-api/1/editions',
];
const MP3QURAN = ['https://mp3quran.net/api/v3', 'https://www.mp3quran.net/api/v3'];

async function getJson(url, timeout = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Same repair as the API (api/app/Core/Riwayat.php → cleanText): drop
// invisible direction marks / BOM, and join a tanween (or the imala dot) to the
// final alif / alif maqsura that the published texts split off with a space
// («هُدࣰ ى» → «هُدࣰى»). Letters and marks are never changed.
export function cleanAyah(t) {
  return String(t)
    .replace(/[\u200E\u200F\uFEFF\u202A-\u202E]/g, '')
    .replace(/([\u064B-\u064D\u065C\u08F0-\u08F2][\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]*) ([\u0627\u0649\u064A][\u0670\u0653]*)(?=[\u06D6-\u06ED]*(?:\s|$))/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromFawaz(json, surah) {
  const rows = json && json.chapter;
  if (!Array.isArray(rows) || rows.length !== ayahCount(surah)) throw new Error('shape');
  return rows.map((r, i) => {
    if (Number(r.chapter) !== surah || Number(r.verse) !== i + 1 || typeof r.text !== 'string') throw new Error('shape');
    return cleanAyah(r.text);
  });
}

// alquran.cloud prepends the basmala to ayah 1 of every surah but 1 and 9
function fromAlquranCloud(json, surah) {
  const ayahs = json?.data?.ayahs;
  if (!Array.isArray(ayahs) || ayahs.length !== ayahCount(surah)) throw new Error('shape');
  return ayahs.map((a, i) => {
    let t = cleanAyah(a.text);
    if (i === 0 && surah !== 1 && surah !== 9) t = t.split(' ').slice(4).join(' ') || t;
    return t;
  });
}

const textCache = new Map();   // `${edition}/${surah}` → Promise<string[]>

// → Promise<string[]> (one string per ayah, Uthmani/Hafs numbering)
export function loadRiwayaText(edition, surah) {
  const key = `${edition}/${surah}`;
  if (!textCache.has(key)) {
    const p = (async () => {
      try {
        const d = await getJson(`${API_BASE}/riwayat/text/${edition}/${surah}`);
        const ayahs = d?.data?.ayahs;
        if (Array.isArray(ayahs) && ayahs.length === ayahCount(surah)) return ayahs.map(cleanAyah);
      } catch {}
      for (const base of FAWAZ) {
        try { return fromFawaz(await getJson(`${base}/${edition}/${surah}.json`), surah); } catch {}
      }
      if (edition === HAFS_EDITION) {
        return fromAlquranCloud(await getJson(`https://api.alquran.cloud/v1/surah/${surah}/quran-uthmani`), surah);
      }
      throw new Error('text unavailable');
    })();
    p.catch(() => textCache.delete(key));     // let a later attempt retry
    textCache.set(key, p);
  }
  return textCache.get(key);
}

// ─── audio map ───────────────────────────────────────────────────────────────
// { updated_at, rawis: { <id>: [{ reciter, moshaf, server, surahs:[…], style, combined }] } }
const SESSION_KEY = 'nq_riwayat_audio_v1';
let audioPromise = null;

export function audioUrl(entry, surah) {
  return entry.server + String(surah).padStart(3, '0') + '.mp3';
}

function validMap(m) {
  return m && m.rawis && typeof m.rawis === 'object' && RAWIS.every(r => Array.isArray(m.rawis[r.audioId] || []));
}

export function loadAudioMap({ retry = false } = {}) {
  if (audioPromise && !retry) return audioPromise;
  audioPromise = (async () => {
    try {
      const s = sessionStorage.getItem(SESSION_KEY);
      const m = s && JSON.parse(s);
      if (!retry && validMap(m)) return m;
    } catch {}
    let map = null;
    try {
      const d = await getJson(`${API_BASE}/riwayat/audio`, 20000);
      if (validMap(d?.data)) map = d.data;
    } catch {}
    if (!map) {
      for (const base of MP3QURAN) {
        try {
          const d = await getJson(`${base}/reciters?language=ar`, 20000);
          if (Array.isArray(d?.reciters) && d.reciters.length) { map = buildAudioMap(d.reciters); break; }
        } catch {}
      }
    }
    if (!map) throw new Error('audio map unavailable');
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(map)); } catch {}
    return map;
  })();
  audioPromise.catch(() => { audioPromise = null; });
  return audioPromise;
}

// ─── mp3quran → our rawis (fallback only; keep in sync with api/app/Core/Riwayat.php) ───
const RULES = {
  hafs:         { rawi: ['حفص', 'المصحف المجود', 'المصحف المعلم'], not: ['الدوري'] },
  shuba:        { rawi: ['شعبه'] },
  qalun:        { rawi: ['قالون'] },
  warsh:        { rawi: ['ورش'] },
  bazzi:        { rawi: ['البزي', 'بزي'] },
  qunbul:       { rawi: ['قنبل'] },
  duri_abuamr:  { rawi: ['الدوري', 'دوري'], imam: ['عمرو', 'البصري'] },
  susi:         { rawi: ['السوسي', 'سوسي'] },
  hisham:       { rawi: ['هشام'] },
  ibndhakwan:   { rawi: ['ابن ذكوان', 'ذكوان'] },
  khalaf_hamza: { rawi: ['خلف'], imam: ['حمزه'], not: ['العاشر'] },
  khallad:      { rawi: ['خلاد'] },
  abulharith:   { rawi: ['الحارث'] },
  duri_kisai:   { rawi: ['الدوري', 'دوري'], imam: ['الكسائي', 'كسائي'] },
  ibnwardan:    { rawi: ['ابن وردان', 'وردان'] },
  ibnjammaz:    { rawi: ['ابن جماز', 'جماز'] },
  ruways:       { rawi: ['رويس'] },
  rawh:         { rawi: ['روح'] },
  ishaq:        { rawi: ['اسحاق'] },
  idris:        { rawi: ['ادريس'] },
};

export function normAr(s) {
  return String(s)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200C-\u200F]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647').replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A')
    .replace(/\s+/g, ' ').trim();
}

function styleOf(name) {
  const n = normAr(name);
  return n.includes('مرتل') ? 'murattal' : n.includes('مجود') ? 'mujawwad' : n.includes('معلم') ? 'muallim' : null;
}

function riwayaPart(name) {
  const parts = String(name).trim().split(/\s+[-–—]\s+/);
  const keep = parts.filter(p => styleOf(p) === null || normAr(p).length > 12);
  return (keep.length ? keep : parts).join(' - ');
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matchRawis(moshafName) {
  const n = ' ' + normAr(riwayaPart(moshafName)) + ' ';
  const has = w => new RegExp('[\\s(]و?' + escRe(normAr(w)) + '(?=[\\s),،])').test(n);
  const any = ws => ws.some(has);
  return Object.entries(RULES)
    .filter(([, r]) => any(r.rawi) && (!r.imam || any(r.imam)) && !(r.not && any(r.not)))
    .map(([id]) => id);
}

export function buildAudioMap(reciters) {
  const rawis = Object.fromEntries(Object.keys(RULES).map(k => [k, []]));
  const seen = new Set();
  for (const rec of reciters || []) {
    const reciter = String(rec?.name || '').trim();
    for (const m of rec?.moshaf || []) {
      const moshaf = String(m?.name || '').trim();
      let server = String(m?.server || '').trim();
      if (!/^https:\/\/[a-z0-9.-]+(\/|$)/i.test(server) || /[?#]/.test(server)) continue;
      server = server.replace(/\/+$/, '') + '/';
      const surahs = [...new Set(String(m?.surah_list || '').split(',').map(x => Number(x.trim())).filter(x => Number.isInteger(x) && x >= 1 && x <= 114))].sort((a, b) => a - b);
      if (!reciter || !moshaf || !surahs.length) continue;
      const ids = matchRawis(moshaf);
      for (const id of ids) {
        if (seen.has(id + server)) continue;
        seen.add(id + server);
        rawis[id].push({ reciter, reciter_id: Number(rec.id) || 0, moshaf, moshaf_id: Number(m.id) || 0, style: styleOf(moshaf), combined: ids.length > 1, server, surahs });
      }
    }
  }
  const rank = { murattal: 0, mujawwad: 2, muallim: 3 };
  for (const list of Object.values(rawis)) {
    list.sort((a, b) => (a.combined - b.combined) || ((rank[a.style] ?? 1) - (rank[b.style] ?? 1))
      || (b.surahs.length - a.surahs.length) || (a.reciter < b.reciter ? -1 : a.reciter > b.reciter ? 1 : 0));
  }
  return { updated_at: new Date().toISOString(), stale: false, rawis, direct: true };
}

// Reciters of one rawi that have this surah
export function recitersFor(map, rawiId, surah) {
  return ((map && map.rawis && map.rawis[rawiId]) || []).filter(e => e.surahs.includes(surah));
}

// The surah closest to `surah` that at least one reciter of this rawi has
export function nearestSurah(map, rawiId, surah) {
  const all = new Set(((map && map.rawis && map.rawis[rawiId]) || []).flatMap(e => e.surahs));
  let best = null;
  for (const s of all) if (s !== surah && (best === null || Math.abs(s - surah) < Math.abs(best - surah) || (Math.abs(s - surah) === Math.abs(best - surah) && s > best))) best = s;
  return best;
}
