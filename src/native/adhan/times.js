// ─── Prayer times for any day, offline-first ────────────────────────────────
// The prayer page shows api.aladhan.com times. To keep the adhan in step with
// what the visitor sees, month calendars from the same API (same city, method)
// are cached in localStorage when online; any day without a cached calendar is
// calculated locally with src/praytimes.js (works offline, ±1–2 min).
import { calcPrayerTimes, METHODS } from '../../praytimes.js';

// aladhan method id → local calculation parameters. Ids the local table has no
// key for get the closest published angles (aladhan's own method definitions).
const LOCAL_METHOD = {
  '1': 'Karachi', '2': 'ISNA', '3': 'MWL', '4': 'Makkah', '5': 'Egypt', '8': 'Gulf',
  '9': 'Kuwait', '10': 'Qatar', '12': 'France', '13': 'Turkey', '14': 'Russia', '21': 'Morocco',
  '16': 'Karachi',   // Dubai: 18.2° / 18.2°
  '18': 'Karachi',   // Tunisia: 18° / 18°
  '19': 'MWL',       // Algeria: 18° / 17°
  '23': 'Karachi',   // Jordan: 18° / 18°
};
export function localMethodKey(methodId) {
  const k = LOCAL_METHOD[String(methodId)] || 'MWL';
  return METHODS[k] ? k : 'MWL';
}

export function localTimes(city, day) {
  const t = calcPrayerTimes(new Date(day.y, day.mo - 1, day.d), city.lat, city.lon, localMethodKey(city.method), city.tz || undefined);
  if (!t || !/^\d\d:\d\d$/.test(t.Fajr || '')) return null;
  return t;
}

// ── aladhan month cache ──────────────────────────────────────────────────────
const CAL_PREFIX = 'nq_adhan_cal_';
const calKey = (city, y, mo) => `${CAL_PREFIX}${y}-${mo}_${(+city.lat).toFixed(3)}_${(+city.lon).toFixed(3)}_${city.method}`;
const clean = t => String(t || '').trim().slice(0, 5);

function readCal(city, y, mo) {
  try {
    const v = JSON.parse(localStorage.getItem(calKey(city, y, mo)) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

async function fetchMonth(city, y, mo, timeout = 8000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const url = `https://api.aladhan.com/v1/calendar/${y}/${mo}?latitude=${city.lat}&longitude=${city.lon}&method=${city.method}`;
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    const json = await res.json();
    if (json.code !== 200 || !Array.isArray(json.data)) return null;
    const days = {};
    json.data.forEach(row => {
      const g = row.date && row.date.gregorian;
      const d = g ? parseInt(g.day, 10) : NaN;
      if (!d) return;
      const t = row.timings || {};
      days[d] = { Fajr: clean(t.Fajr), Sunrise: clean(t.Sunrise), Dhuhr: clean(t.Dhuhr), Asr: clean(t.Asr), Maghrib: clean(t.Maghrib), Isha: clean(t.Isha) };
    });
    return Object.keys(days).length ? days : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fetch (when online) the months the plan needs; keeps only recent months for this city. */
export async function prefetchMonths(city, months) {
  if (!city) return;
  const keep = new Set();
  for (const { y, mo } of months) {
    keep.add(calKey(city, y, mo));
    if (readCal(city, y, mo)) continue;
    const days = await fetchMonth(city, y, mo);
    if (days) { try { localStorage.setItem(calKey(city, y, mo), JSON.stringify(days)); } catch {} }
  }
  try {
    Object.keys(localStorage).filter(k => k.startsWith(CAL_PREFIX) && !keep.has(k)).forEach(k => localStorage.removeItem(k));
  } catch {}
}

/** Times for a calendar day in the city's zone: cached aladhan month, else local calculation. */
export function timesFor(city, day) {
  const cal = readCal(city, day.y, day.mo);
  const hit = cal && cal[day.d];
  if (hit && /^\d\d:\d\d$/.test(hit.Fajr) && /^\d\d:\d\d$/.test(hit.Isha)) return hit;
  return localTimes(city, day);
}
