// ─── Radio stations: API data, built-in fallback, labels ─────────────────────
// GET /v1/radio (docs/API.md → Radio) returns the curated catalogue + the mp3quran.net
// channels with the stream each browser should play, checked on the server every 6 h.
// When the API can't be reached we fall back to the main official Quran radios below.
import { request } from '../../apiClient';
import { intlLocale } from '../../l10n';

// Tabs: «تفسير وبرامج» groups the tafsir and programmes categories.
export const TABS = [
  { id: 'quran',      label: 'إذاعات القرآن الرسمية', icon: 'mosque', cats: ['quran'] },
  { id: 'recitation', label: 'تلاوات على مدار الساعة', icon: 'head',   cats: ['recitation'] },
  { id: 'tafsir',     label: 'تفسير وبرامج',           icon: 'scroll', cats: ['tafsir', 'programs'] },
  { id: 'fav',        label: 'المفضّلة',               icon: 'heart',  cats: null },
];

export const CAT_LABEL = { quran: 'إذاعة رسمية', recitation: 'تلاوة متواصلة', tafsir: 'تفسير', programs: 'برامج' };
export const CAT_ICON  = { quran: 'mosque', recitation: 'head', tafsir: 'scroll', programs: 'book' };

// Built-in fallback (same ids as the server catalogue, so favourites keep working).
// https only: an https page can't play http audio.
export const FALLBACK = [
  { id: 'eg-cairo-quran', name_ar: 'إذاعة القرآن الكريم من القاهرة', name_en: 'Holy Quran Radio — Cairo', country: 'EG', category: 'quran', featured: true,
    url: 'https://stream.radiojar.com/8s5u5tpdtwzuv' },
  { id: 'sa-quran', name_ar: 'إذاعة القرآن الكريم من المملكة العربية السعودية', name_en: 'Holy Quran Radio — Saudi Arabia', country: 'SA', category: 'quran', featured: true,
    url: 'https://stream.radiojar.com/0tpy1h0kxtzuv' },
  { id: 'ae-sharjah-quran', name_ar: 'إذاعة القرآن الكريم من الشارقة', name_en: 'Sharjah Holy Quran Radio', country: 'AE', category: 'quran', featured: true,
    url: 'https://l3.itworkscdn.net/smcquranlive/quranradiolive/icecast.audio' },
  { id: 'mp3q-mix', name_ar: 'إذاعة تلاوات متنوعة لنخبة من القرّاء', name_en: 'Mixed recitations by renowned reciters', country: null, category: 'recitation',
    url: 'https://backup.qurango.net/radio/mix' },
  { id: 'mp3q-tarateel', name_ar: 'إذاعة تراتيل قصيرة متميزة', name_en: 'Short distinguished recitations', country: null, category: 'recitation',
    url: 'https://backup.qurango.net/radio/tarateel' },
].map(s => ({ source: 'catalog', hls: /\.m3u8(\?|$)/i.test(s.url), status: 'unknown', bitrate: null, ...s }));

function clean(s) {
  if (!s || typeof s.id !== 'string') return null;
  const url = typeof s.url === 'string' && /^https:\/\//i.test(s.url) ? s.url
    // the local API test upstream (http://127.0.0.1 is a secure context, never used in production)
    : (typeof s.url === 'string' && /^http:\/\/127\.0\.0\.1[:/]/.test(s.url) ? s.url : null);
  return {
    id: s.id,
    name_ar: String(s.name_ar || s.name_en || s.id),
    name_en: String(s.name_en || s.name_ar || s.id),
    country: typeof s.country === 'string' && /^[A-Z]{2}$/.test(s.country) ? s.country : null,
    category: ['quran', 'recitation', 'tafsir', 'programs'].includes(s.category) ? s.category : 'programs',
    featured: !!s.featured,
    source: s.source === 'mp3quran' ? 'mp3quran' : 'catalog',
    url,
    hls: !!s.hls,
    status: ['ok', 'down', 'unknown'].includes(s.status) ? s.status : 'unknown',
    bitrate: Number.isFinite(s.bitrate) && s.bitrate > 0 ? s.bitrate : null,
  };
}

/** → { stations, checkedAt, fallback } — never throws. */
export async function loadStations() {
  try {
    const data = await request('GET', '/radio', undefined, { timeout: 45000 });
    const list = (Array.isArray(data?.stations) ? data.stations : []).map(clean).filter(s => s && s.url);
    if (list.length) return { stations: list, checkedAt: data.checked_at || null, fallback: false };
  } catch {}
  return { stations: FALLBACK, checkedAt: null, fallback: true };
}

// Arabic script for Arabic and Urdu, the English name otherwise.
export function stationName(s, lang) {
  return lang === 'ar' || lang === 'ur' ? s.name_ar : s.name_en;
}

// Country names in the interface language (no flag emoji)
const regions = {};
export function countryName(code, lang) {
  if (!code) return '';
  try {
    if (!regions[lang]) regions[lang] = new Intl.DisplayNames([lang === 'ar' ? 'ar' : intlLocale(lang)], { type: 'region' });
    return regions[lang].of(code) || code;
  } catch { return code; }
}

// Search: Arabic without diacritics / hamza forms, case-insensitive
export function fold(s) {
  return String(s || '')
    .toLocaleLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}

// Favourites (per browser)
const FAV_KEY = 'nq_radio_favs';
export function readFavs() {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 200) : [];
  } catch { return []; }
}
export function writeFavs(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
}
