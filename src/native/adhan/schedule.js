// ─── Adhan / reminder / daily-ayah plan (pure, no Capacitor, unit-tested) ───
// buildPlan() turns the prayer settings into a sorted list of notifications to
// schedule. It knows nothing about the OS: notifications.js turns each entry into
// a LocalNotifications schema. Tested by scripts/test-adhan-schedule.mjs.
//
// Budget: iOS keeps at most 64 pending local notifications per app (the soonest
// 64; the rest are silently dropped). We stay under IOS_BUDGET so a snooze, a
// test notification and future room reminders still fit. The plan is cut
// chronologically, so the nearest days are always complete; the app re-plans on
// every launch/resume (and on settings changes), which slides the window forward.

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
export const MODES = ['adhan', 'notify', 'silent'];
export const REMINDER_CHOICES = [0, 10, 15, 30];
export const IOS_PENDING_LIMIT = 64;
export const IOS_BUDGET = 60;          // 4 slots kept free (snooze, test, rooms)
export const ANDROID_BUDGET = 160;     // AlarmManager allows ~500 per app; stay far below
export const DEFAULT_DAYS = 10;

// Notification ids (32-bit ints, stable per day/slot so a re-plan replaces them):
//   1 000 000 + dayNumber × 20 + slot     slot 0–4 prayer, 5–9 reminder, 10 daily ayah
//   2 000 000 000 + n                     snooze (one at a time)
export const ID_BASE = 1_000_000;
export const SNOOZE_ID = 2_000_000_000;
const EPOCH_DAY = Date.UTC(2020, 0, 1) / 86400000;

export function dayNumber({ y, mo, d }) {
  return Date.UTC(y, mo - 1, d) / 86400000 - EPOCH_DAY;
}
export function planId(dateParts, slot) {
  return ID_BASE + dayNumber(dateParts) * 20 + slot;
}
export function isPlanId(id) {
  return Number.isInteger(id) && id >= ID_BASE && id < SNOOZE_ID;
}

// ── time zones ───────────────────────────────────────────────────────────────
// UTC offset (minutes) of `tz` at the instant `ms`. Empty tz → device zone.
export function tzOffsetMinutes(tz, ms) {
  const date = new Date(ms);
  if (!tz) return -date.getTimezoneOffset();
  try {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(date).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

// Wall-clock date in `tz` at instant `ms` → { y, mo, d }
export function zonedDate(tz, ms) {
  const t = ms + tzOffsetMinutes(tz, ms) * 60000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays({ y, mo, d }, n) {
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export const dateKey = ({ y, mo, d }) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// "HH:MM" on calendar day `dateParts` in `tz` → epoch ms (handles DST: the offset
// is taken at the resulting instant, refined once).
export function zonedTimeToMs(dateParts, hm, tz) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
  if (!m) return NaN;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return NaN;
  const wall = Date.UTC(dateParts.y, dateParts.mo - 1, dateParts.d, h, mi);
  let ms = wall - tzOffsetMinutes(tz, wall) * 60000;
  const off2 = tzOffsetMinutes(tz, ms);
  ms = wall - off2 * 60000;
  return ms;
}

// ── settings ─────────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  enabled: false,                       // master switch (turned on with the permission prompt)
  modes: { Fajr: 'adhan', Dhuhr: 'adhan', Asr: 'adhan', Maghrib: 'adhan', Isha: 'adhan' },
  reminder: 0,                          // minutes before the adhan (0 = off)
  muezzin: '',                          // '' = first available regular recording
  fajrMuezzin: '',                      // '' = first available Fajr recording
  dailyAyah: true,
  dailyAyahTime: '07:00',               // device wall clock
  breakthrough: false,                  // user opted in: time-sensitive on iOS (DND/Focus is still the user's call)
  days: DEFAULT_DAYS,
};

export function normalizeSettings(s) {
  const o = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  o.modes = { ...DEFAULT_SETTINGS.modes, ...(s && s.modes) };
  PRAYERS.forEach(p => { if (!MODES.includes(o.modes[p])) o.modes[p] = 'adhan'; });
  if (!REMINDER_CHOICES.includes(+o.reminder)) o.reminder = 0; else o.reminder = +o.reminder;
  if (!/^\d{2}:\d{2}$/.test(o.dailyAyahTime)) o.dailyAyahTime = DEFAULT_SETTINGS.dailyAyahTime;
  o.days = Math.min(14, Math.max(1, Math.round(+o.days) || DEFAULT_DAYS));
  o.enabled = !!o.enabled; o.dailyAyah = !!o.dailyAyah; o.breakthrough = !!o.breakthrough;
  o.muezzin = typeof o.muezzin === 'string' ? o.muezzin : '';
  o.fajrMuezzin = typeof o.fajrMuezzin === 'string' ? o.fajrMuezzin : '';
  return o;
}

/** Effective per-prayer mode: the prayer page's on/off toggle (nq_pray_alarms) gates the native style. */
export function effectiveMode(settings, alarms, prayer) {
  if (!settings.enabled) return 'silent';
  if (!alarms || !alarms[prayer]) return 'silent';
  const m = settings.modes[prayer];
  return m === 'notify' ? 'notify' : m === 'silent' ? 'silent' : 'adhan';
}

/**
 * @param {object} o
 * @param {number}   o.now            epoch ms
 * @param {object}   o.settings       normalizeSettings() output
 * @param {object}   o.alarms         { Fajr: true, … } from the prayer page
 * @param {object|null} o.city        { lat, lon, tz, method, name } or null (no city → no prayers)
 * @param {function} o.getTimes       (dateParts) → { Fajr: 'HH:MM', … } in the city's zone, or null
 * @param {function} [o.dailyAyahFor] (dateParts) → any (payload for the daily-ayah entry)
 * @param {string}   [o.deviceTz]     device zone for the daily ayah ('' = runtime default)
 * @param {number}   o.limit          max entries (IOS_BUDGET / ANDROID_BUDGET)
 * @returns {Array<{id, kind, at, prayer?, mode?, minutesBefore?, time?, date, payload?}>}
 */
export function buildPlan({ now, settings, alarms, city, getTimes, dailyAyahFor, deviceTz = '', limit }) {
  const s = normalizeSettings(settings);
  const out = [];
  const minLead = 5000;   // never schedule something due in < 5 s

  if (city && s.enabled) {
    const start = zonedDate(city.tz, now);
    for (let i = 0; i < s.days; i++) {
      const day = addDays(start, i);
      let times = null;
      try { times = getTimes(day); } catch { times = null; }
      if (!times) continue;
      PRAYERS.forEach((p, idx) => {
        const mode = effectiveMode(s, alarms, p);
        if (mode === 'silent') return;
        const at = zonedTimeToMs(day, times[p], city.tz);
        if (!isFinite(at)) return;
        if (at > now + minLead) {
          out.push({ id: planId(day, idx), kind: 'prayer', prayer: p, mode, at, time: String(times[p]).slice(0, 5), date: dateKey(day) });
        }
        if (s.reminder > 0) {
          const rat = at - s.reminder * 60000;
          if (rat > now + minLead) {
            out.push({ id: planId(day, 5 + idx), kind: 'reminder', prayer: p, mode, at: rat, minutesBefore: s.reminder, time: String(times[p]).slice(0, 5), date: dateKey(day) });
          }
        }
      });
    }
  }

  if (s.dailyAyah) {
    const start = zonedDate(deviceTz, now);
    for (let i = 0; i < s.days; i++) {
      const day = addDays(start, i);
      const at = zonedTimeToMs(day, s.dailyAyahTime, deviceTz);
      if (!(at > now + minLead)) continue;
      out.push({ id: planId(day, 10), kind: 'ayah', at, date: dateKey(day), payload: dailyAyahFor ? dailyAyahFor(day) : null });
    }
  }

  out.sort((a, b) => a.at - b.at || a.id - b.id);
  const max = Math.max(0, Math.min(limit || IOS_BUDGET, 500));
  return out.slice(0, max);
}

// Daily-ayah index for a calendar day — the same formula as getDailyIndex() in
// src/pages/DailyAyahPage.jsx (day of the year modulo the list length), but for any day.
export function dailyIndexFor({ y, mo, d }, listLength) {
  const today = new Date(y, mo - 1, d, 12);   // local noon: avoids DST hour shifts
  const dayOfYear = Math.floor((today - new Date(y, 0, 0)) / 86400000);
  return dayOfYear % listLength;
}
