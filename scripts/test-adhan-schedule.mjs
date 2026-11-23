// Unit tests for the adhan notification plan (src/native/adhan/schedule.js).
// Run: npm run test:native   (node --test, device zone forced to America/New_York
// so city-zone ≠ device-zone cases are exercised)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlan, normalizeSettings, effectiveMode, zonedTimeToMs, zonedDate, addDays, dateKey,
  planId, isPlanId, dailyIndexFor, IOS_BUDGET, IOS_PENDING_LIMIT, ANDROID_BUDGET, PRAYERS, SNOOZE_ID,
} from '../src/native/adhan/schedule.js';
import { localTimes, localMethodKey } from '../src/native/adhan/times.js';

const CAIRO = { lat: 30.0444, lon: 31.2357, tz: 'Africa/Cairo', method: '5', name: 'القاهرة' };
const RIYADH = { lat: 24.7136, lon: 46.6753, tz: 'Asia/Riyadh', method: '4', name: 'الرياض' };
const LONDON = { lat: 51.5072, lon: -0.1276, tz: 'Europe/London', method: '3', name: 'London' };
const ALL_ON = { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true };

const wall = (ms, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const plan = (over = {}) => buildPlan({
  now: Date.UTC(2026, 10, 23, 8, 0),          // 23 Nov 2026 10:00 Cairo
  settings: normalizeSettings({ enabled: true, ...over.settings }),
  alarms: over.alarms || ALL_ON,
  city: over.city === undefined ? CAIRO : over.city,
  getTimes: d => localTimes(over.city || CAIRO, d),
  dailyAyahFor: d => ({ idx: dailyIndexFor(d, 30) }),
  deviceTz: over.deviceTz ?? '',
  limit: over.limit || IOS_BUDGET,
  ...(over.now ? { now: over.now } : {}),
});

test('device zone is forced for these tests', () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/New_York');
});

test('iOS budget: everything on (5 adhans + 5 reminders + daily ayah) stays ≤ 60 < 64', () => {
  const p = plan({ settings: { reminder: 15, dailyAyah: true, days: 10 } });
  assert.ok(IOS_BUDGET < IOS_PENDING_LIMIT);
  assert.equal(p.length, IOS_BUDGET);
  // chronological, unique ids
  for (let i = 1; i < p.length; i++) assert.ok(p[i].at >= p[i - 1].at, 'sorted');
  assert.equal(new Set(p.map(x => x.id)).size, p.length, 'unique ids');
  // the nearest days are complete: the first ~5 days have every prayer (11/day → 60 covers 5 days + part of the 6th)
  const byDate = {};
  p.filter(x => x.kind === 'prayer').forEach(x => { byDate[x.date] = (byDate[x.date] || 0) + 1; });
  const dates = Object.keys(byDate).sort();
  dates.slice(1, -1).forEach(d => assert.equal(byDate[d], 5, `full day ${d}`));
});

test('without reminders 10 days fit exactly: 5 prayers + 1 ayah per day', () => {
  const p = plan({ settings: { reminder: 0, dailyAyah: true, days: 10 }, now: Date.UTC(2026, 10, 22, 23, 0) }); // 01:00 Cairo / 18:00 NY
  assert.ok(p.length <= IOS_BUDGET);
  assert.equal(p.filter(x => x.kind === 'prayer').length, 50);
});

test('Android budget allows the full 10-day window with reminders', () => {
  const p = plan({ settings: { reminder: 10, days: 10 }, limit: ANDROID_BUDGET });
  assert.ok(p.length > IOS_BUDGET && p.length <= ANDROID_BUDGET);
  assert.equal(p.filter(x => x.kind === 'prayer').length, 49);   // today's Fajr (06:0x Cairo) already passed at 10:00
});

test('day rollover: after Isha the next entry is tomorrow’s Fajr, in the city’s calendar', () => {
  const now = Date.UTC(2026, 10, 23, 21, 30);  // 23:30 Cairo (16:30 in New York, still the 23rd there)
  const p = plan({ now, settings: { dailyAyah: false } });
  assert.equal(p[0].prayer, 'Fajr');
  assert.equal(p[0].date, '2026-11-24');
  assert.equal(wall(p[0].at, 'Africa/Cairo').slice(0, 10), '24/11/2026');
});

test('city zone ≠ device zone: Riyadh times fire at Riyadh wall-clock time', () => {
  const p = plan({ city: RIYADH, settings: { dailyAyah: false } });
  for (const x of p) {
    const t = localTimes(RIYADH, { y: +x.date.slice(0, 4), mo: +x.date.slice(5, 7), d: +x.date.slice(8, 10) });
    assert.equal(wall(x.at, 'Asia/Riyadh').slice(-5), t[x.prayer], `${x.date} ${x.prayer}`);
  }
});

test('DST: London around 29 Mar 2026 keeps local prayer times on both sides', () => {
  const now = Date.UTC(2026, 2, 27, 12, 0);
  const p = plan({ now, city: LONDON, settings: { dailyAyah: false, days: 4 } });
  const days = new Set(p.map(x => x.date));
  assert.ok(days.has('2026-03-28') && days.has('2026-03-30'));
  for (const x of p) {
    const t = localTimes(LONDON, { y: 2026, mo: +x.date.slice(5, 7), d: +x.date.slice(8, 10) });
    assert.equal(wall(x.at, 'Europe/London').slice(-5), t[x.prayer], `${x.date} ${x.prayer}`);
  }
  // Solar noon stays ≈12:0x UTC; the wall clock moves from 12:0x GMT to 13:0x BST
  const dh = d => p.find(x => x.date === d && x.prayer === 'Dhuhr');
  const utcH = x => new Date(x.at).getUTCHours();
  assert.equal(utcH(dh('2026-03-28')), 12);
  assert.equal(utcH(dh('2026-03-30')), 12);
  assert.equal(wall(dh('2026-03-28').at, 'Europe/London').slice(-5, -3), '12');
  assert.equal(wall(dh('2026-03-30').at, 'Europe/London').slice(-5, -3), '13');
});

test('daily ayah fires at 07:00 on the device clock (New York), not the city clock', () => {
  const p = plan({ settings: { dailyAyah: true, dailyAyahTime: '07:00' } });
  const ayahs = p.filter(x => x.kind === 'ayah');
  assert.ok(ayahs.length >= 5);
  ayahs.forEach(x => assert.equal(wall(x.at, 'America/New_York').slice(-5), '07:00'));
  assert.ok(ayahs.every(x => Number.isInteger(x.payload.idx)));
});

test('modes: silent prayers and the page toggles are respected; master switch off → nothing', () => {
  const p = plan({ settings: { dailyAyah: false, modes: { Asr: 'silent', Isha: 'notify' } }, alarms: { ...ALL_ON, Maghrib: false } });
  assert.ok(!p.some(x => x.prayer === 'Asr' || x.prayer === 'Maghrib'));
  assert.ok(p.filter(x => x.prayer === 'Isha').every(x => x.mode === 'notify'));
  assert.ok(p.filter(x => x.prayer === 'Fajr').every(x => x.mode === 'adhan'));
  assert.equal(plan({ settings: { enabled: false, dailyAyah: false } }).length, 0);
  assert.equal(effectiveMode(normalizeSettings({ enabled: true }), {}, 'Fajr'), 'silent');
});

test('no city → only the daily ayah', () => {
  const p = plan({ city: null, settings: { dailyAyah: true } });
  assert.ok(p.length > 0 && p.every(x => x.kind === 'ayah'));
});

test('reminders precede their adhan by the chosen minutes', () => {
  const p = plan({ settings: { reminder: 30, dailyAyah: false }, limit: ANDROID_BUDGET });
  const r = p.find(x => x.kind === 'reminder');
  const a = p.find(x => x.kind === 'prayer' && x.prayer === r.prayer && x.date === r.date);
  assert.equal(a.at - r.at, 30 * 60000);
});

test('ids: stable per day/slot, inside the plan range, never the snooze id', () => {
  const d = { y: 2026, mo: 11, d: 23 };
  assert.equal(planId(d, 0), planId({ ...d }, 0));
  assert.notEqual(planId(d, 0), planId(addDays(d, 1), 0));
  assert.ok(isPlanId(planId(d, 10)) && !isPlanId(SNOOZE_ID));
  assert.ok(planId({ y: 2099, mo: 12, d: 31 }, 10) < 2 ** 31);
});

test('zoned helpers', () => {
  assert.equal(dateKey(zonedDate('Asia/Tokyo', Date.UTC(2026, 0, 1, 16, 0))), '2026-01-02');
  assert.equal(wall(zonedTimeToMs({ y: 2026, mo: 7, d: 1 }, '04:05', 'Africa/Cairo'), 'Africa/Cairo').slice(-5), '04:05');
  assert.ok(Number.isNaN(zonedTimeToMs({ y: 2026, mo: 7, d: 1 }, '--:--', 'Africa/Cairo')));
});

test('daily ayah index matches DailyAyahPage.getDailyIndex for today', () => {
  const now = new Date();
  const original = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000) % 30;
  assert.equal(dailyIndexFor({ y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() }, 30), original);
});

test('method mapping covers every method the prayer page offers', () => {
  ['5', '4', '3', '9', '10', '16', '8', '13', '2', '12', '21', '18', '19', '23', '1'].forEach(id => assert.ok(localMethodKey(id)));
  assert.ok(PRAYERS.length === 5);
});
