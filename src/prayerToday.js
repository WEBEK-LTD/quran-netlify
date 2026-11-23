// ─── Today's prayer times for the saved city (home page bar) ────────────────
// Uses the same city, method and source (api.aladhan.com) as the prayer page,
// so both always agree. Cached per city/day in localStorage; falls back to the
// local calculation (praytimes.js) when offline.
import { calcPrayerTimes } from './praytimes';

export const PRAYER_NAMES = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
export const PRAYER_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// aladhan method id → local calculation key (fallback only)
const LOCAL_METHOD = { '1': 'Karachi', '2': 'ISNA', '3': 'MWL', '4': 'Makkah', '5': 'Egypt', '8': 'Gulf', '9': 'Kuwait', '10': 'Qatar', '12': 'France', '13': 'Turkey', '14': 'Russia', '16': 'Gulf', '21': 'Morocco' };

function suggestMethod(tz) {
  tz = tz || '';
  if (tz.includes('Cairo')) return '5';
  if (tz.includes('Riyadh')) return '4';
  if (tz.includes('Kuwait')) return '9';
  if (tz.includes('Qatar')) return '10';
  if (tz.includes('Dubai')) return '16';
  if (tz.includes('Bahrain') || tz.includes('Muscat')) return '8';
  if (tz.includes('Istanbul')) return '13';
  if (tz.includes('Amman')) return '23';
  return '3';
}

export function savedCity() {
  try {
    const lat = parseFloat(localStorage.getItem('nq_pray_lat'));
    const lon = parseFloat(localStorage.getItem('nq_pray_lon'));
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const tz = localStorage.getItem('nq_pray_tz') || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const method = localStorage.getItem('nq_pray_method_v2') || suggestMethod(tz);
    return { lat, lon, tz, method, name: localStorage.getItem('nq_pray_city') || '' };
  } catch { return null; }
}

// Wall-clock now in the city's zone → { y, mo, d, secs }
export function cityNow(tz) {
  const date = new Date();
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(date).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    return { y: +p.year, mo: +p.month, d: +p.day, secs: (+p.hour % 24) * 3600 + (+p.minute) * 60 + (+p.second) };
  } catch {
    return { y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(), secs: date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() };
  }
}

const clean = t => String(t || '').slice(0, 5);

export async function loadTodayTimes(city) {
  const n = cityNow(city.tz);
  const key = `nq_pray_day_${n.y}-${n.mo}-${n.d}_${city.lat.toFixed(3)}_${city.lon.toFixed(3)}_${city.method}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit && hit.Fajr) return hit;
  } catch {}
  try {
    const res = await fetch(`https://api.aladhan.com/v1/timings/${n.d}-${n.mo}-${n.y}?latitude=${city.lat}&longitude=${city.lon}&method=${city.method}`);
    const json = await res.json();
    if (json.code !== 200) throw new Error('bad');
    const t = json.data.timings;
    const out = Object.fromEntries(PRAYER_ORDER.map(k => [k, clean(t[k])]));
    try {
      Object.keys(localStorage).filter(k => k.startsWith('nq_pray_day_') && k !== key).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(key, JSON.stringify(out));
    } catch {}
    return out;
  } catch {
    return calcPrayerTimes(new Date(n.y, n.mo - 1, n.d), city.lat, city.lon, LOCAL_METHOD[city.method] || 'MWL', city.tz || undefined);
  }
}

const toSecs = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 3600 + m * 60; };

// Next prayer (Sunrise is shown but never counted as "next prayer").
export function nextPrayer(times, secsNow) {
  for (const k of PRAYER_ORDER) {
    if (k === 'Sunrise') continue;
    const s = toSecs(times[k]);
    if (s > secsNow) return { key: k, left: s - secsNow, tomorrow: false };
  }
  return { key: 'Fajr', left: toSecs(times.Fajr) + 86400 - secsNow, tomorrow: true };
}

export function fmt12(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  if (!isFinite(h)) return { t: '--:--', ap: '' };
  const hh = h % 12 || 12;
  return { t: `${hh}:${String(m).padStart(2, '0')}`, ap: h < 12 ? 'ص' : 'م' };
}
