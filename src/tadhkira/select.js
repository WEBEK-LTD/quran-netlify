// ─── Which ayah does this person open today? ─────────────────────────────────
// Owner-approved rule: one ayah per person per day, the same all day, a new one
// each day, and no repeat until the whole list has been used.
//
// Every person (signed-in user id, or the anonymous visitor id) gets their own
// shuffle of the list from a seeded PRNG. Day n since a fixed epoch (in the
// person's local calendar) shows entry n mod L of the current cycle's shuffle;
// each completed cycle reshuffles with seed + cycle number. Different people see
// different ayat on the same day; nothing is stored or sent to a server.
import { AYAT } from './ayat';

export const EPOCH = '2026-01-01';            // day 0 (a fixed local calendar date)

// xmur3-style string hash → 32-bit seed
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// mulberry32 PRNG → floats in [0, 1)
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates shuffle of 0..n-1 for (seed, cycle).
export function permutation(n, seed, cycle) {
  const rnd = mulberry32(hashString(`${seed}#${cycle}`));
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

// Cycle order, with one guard: the first day of a cycle never repeats the last
// day of the previous one (swap the first two entries if it would).
const cache = new Map();
function cycleOrder(n, seed, cycle) {
  const key = `${n}|${seed}|${cycle}`;
  let p = cache.get(key);
  if (!p) {
    p = permutation(n, seed, cycle);
    if (n > 1) {
      const prevLast = permutation(n, seed, cycle - 1)[n - 1];
      if (p[0] === prevLast) [p[0], p[1]] = [p[1], p[0]];
    }
    if (cache.size > 16) cache.clear();
    cache.set(key, p);
  }
  return p;
}

// Local calendar date → "YYYY-MM-DD"
export function localDateKey(d = new Date()) {
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Whole days between EPOCH and a "YYYY-MM-DD" key (calendar days, no DST drift).
export function dayNumber(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [ey, em, ed] = EPOCH.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86400000);
}

// Index into AYAT for this seed on this local day.
export function pickIndex(seed, dateKey = localDateKey(), n = AYAT.length) {
  const day = dayNumber(dateKey);
  const cycle = Math.floor(day / n);
  const pos = ((day % n) + n) % n;
  return cycleOrder(n, String(seed || 'guest'), cycle)[pos];
}

export function pickRef(seed, dateKey = localDateKey()) {
  return AYAT[pickIndex(seed, dateKey)][0];
}

// ── today's state on this device (localStorage nq_tadhkira = { date, ref }) ──
const KEY = 'nq_tadhkira';
export function openedToday(dateKey = localDateKey()) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && v.date === dateKey && AYAT.some(([r]) => r === v.ref)) return v.ref;
  } catch {}
  return null;
}
export function markOpened(ref, dateKey = localDateKey()) {
  try { localStorage.setItem(KEY, JSON.stringify({ date: dateKey, ref })); } catch {}
}
// Today's ref: the one already opened today, else the person's pick.
export function todaysRef(seed, dateKey = localDateKey()) {
  return openedToday(dateKey) || pickRef(seed, dateKey);
}
