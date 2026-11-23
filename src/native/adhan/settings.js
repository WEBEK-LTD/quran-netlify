// ─── Adhan settings (device-only, localStorage) ─────────────────────────────
// The prayer page owns the city/method/tz (nq_pray_*) and the per-prayer on/off
// toggles (nq_pray_alarms); these settings add the native-only parts.
import { normalizeSettings, PRAYERS } from './schedule';

const KEY = 'nq_adhan_settings';
const listeners = new Set();

export function readSettings() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch { return normalizeSettings(null); }
}

export function writeSettings(patch) {
  const next = normalizeSettings({ ...readSettings(), ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach(fn => { try { fn(next); } catch {} });
  return next;
}

export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function readAlarms() {
  try {
    const a = JSON.parse(localStorage.getItem('nq_pray_alarms') || '{}') || {};
    return Object.fromEntries(PRAYERS.map(p => [p, !!a[p]]));
  } catch { return {}; }
}

// Same default as PrayerTimesPage.suggestMethod() (the page only stores the method
// once the visitor changes it), so the adhan uses the method the page shows.
function suggestMethod(tz) {
  tz = tz || '';
  const table = [['Cairo', '5'], ['Riyadh', '4'], ['Kuwait', '9'], ['Qatar', '10'], ['Dubai', '16'], ['Bahrain', '8'], ['Muscat', '8'],
    ['Istanbul', '13'], ['Baghdad', '3'], ['Amman', '23'], ['Beirut', '3'], ['Damascus', '3'], ['Casablanca', '21'], ['Tunis', '18'],
    ['Algiers', '19'], ['Gaza', '3'], ['Hebron', '3'], ['Paris', '12'], ['London', '3'], ['America/', '2']];
  const hit = table.find(([k]) => tz.includes(k));
  return hit ? hit[1] : '3';
}

/** The prayer page's saved city (nq_pray_*), or null when none was chosen yet. */
export function readCity() {
  try {
    const lat = parseFloat(localStorage.getItem('nq_pray_lat'));
    const lon = parseFloat(localStorage.getItem('nq_pray_lon'));
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const tz = localStorage.getItem('nq_pray_tz') || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const method = localStorage.getItem('nq_pray_method_v2') || suggestMethod(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    return { lat, lon, tz, method, name: localStorage.getItem('nq_pray_city') || '' };
  } catch { return null; }
}
