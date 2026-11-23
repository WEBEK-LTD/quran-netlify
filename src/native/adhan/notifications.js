// ─── Adhan, reminders and the daily ayah as local notifications ─────────────
// Plans with schedule.js, then (re)schedules with @capacitor/local-notifications.
// Re-planned on launch, on resume, when settings / city / language change and
// after a snooze. Works offline (local calculation when no aladhan month is cached).
//
// iOS: ≤ 64 pending → plan cut at IOS_BUDGET. Sound = public/nq_adhan_<id>.caf (≤ 30 s);
//      the full adhan plays in-app when the notification is opened / arrives in the foreground.
// Android: exact alarms when the user allowed them ("Alarms & reminders"); one
//      notification channel per muezzin whose sound is the full recording (channel
//      sounds can't change after creation); swiping the notification away or
//      «إيقاف الأذان» stops the sound. Do Not Disturb is respected unless the
//      visitor lets the channel override it in the system settings.
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { trNow, num, surahName } from '../../l10n';
import { getLang } from '../../i18n';
import { FEATURED_AYAHS } from '../../pages/DailyAyahPage';
import { isIOS, isAndroid } from '../platform';
import { navigate } from '../links';
import {
  buildPlan, isPlanId, dailyIndexFor, zonedDate, addDays, SNOOZE_ID, IOS_BUDGET, ANDROID_BUDGET, PRAYERS,
} from './schedule';
import { readSettings, readAlarms, readCity, onSettings } from './settings';
import { prefetchMonths, timesFor } from './times';
import {
  RECORDINGS, recordingFor, channelIdFor, androidRawSound, iosSound, recordingName,
} from './muezzins';
import { showAdhanMoment } from './moment';

const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
const SMALL_ICON = 'ic_stat_nq';
const ICON_COLOR = '#C9A84C';
const CH_NOTIFY = 'prayer_notify_v1';
const CH_REMINDER = 'prayer_reminder_v1';
const CH_AYAH = 'daily_ayah_v1';

export const prayerLabel = (p) => trNow(PRAYER_AR[p] || p);
const cityLabel = (name) => (name === 'موقعك' ? trNow('موقعك') : name || '');

// ── permissions ──────────────────────────────────────────────────────────────
export async function notificationPermission() {
  try { return (await LocalNotifications.checkPermissions()).display; } catch { return 'denied'; }
}
export async function requestNotificationPermission() {
  try { return (await LocalNotifications.requestPermissions()).display; } catch { return 'denied'; }
}
/** Android 12+: may we schedule exact alarms? ('granted' everywhere else) */
export async function exactAlarmStatus() {
  if (!isAndroid()) return 'granted';
  try { return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch { return 'granted'; }
}
export async function openExactAlarmSettings() {
  try { await LocalNotifications.changeExactNotificationSetting(); } catch {}
  reschedule('exact-alarm');
}

// ── channels (Android) and action types ─────────────────────────────────────
async function ensureChannels() {
  if (!isAndroid()) return;
  const lang = getLang();
  const jobs = RECORDINGS.map(r => LocalNotifications.createChannel({
    id: channelIdFor(r.id),
    name: trNow('الأذان — {name}', { name: recordingName(r, lang) }),
    description: trNow('صوت الأذان الكامل عند دخول وقت الصلاة'),
    importance: 5, visibility: 1, vibration: true, sound: androidRawSound(r.id),
  }));
  jobs.push(
    LocalNotifications.createChannel({ id: CH_NOTIFY, name: trNow('تنبيه الصلاة (بدون أذان)'), description: trNow('إشعار بصوت التنبيه المعتاد عند دخول وقت الصلاة'), importance: 4, visibility: 1, vibration: true }),
    LocalNotifications.createChannel({ id: CH_REMINDER, name: trNow('التذكير قبل الصلاة'), description: trNow('تذكير قبل الأذان بالمدة التي تختارها'), importance: 3, visibility: 1 }),
    LocalNotifications.createChannel({ id: CH_AYAH, name: trNow('آية اليوم'), description: trNow('آية من كتاب الله كل صباح'), importance: 3, visibility: 1 }),
  );
  await Promise.all(jobs.map(p => p.catch(() => {})));
}

async function registerActions() {
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        { id: 'NQ_ADHAN', actions: [
          { id: 'stop', title: trNow('إيقاف الأذان'), destructive: true },
          { id: 'snooze', title: trNow('تذكير بعد ٥ دقائق'), foreground: true },
        ] },
        { id: 'NQ_PRAYER', actions: [{ id: 'snooze', title: trNow('تذكير بعد ٥ دقائق'), foreground: true }] },
      ],
    });
  } catch {}
}

// ── daily ayah text (cached; the plan is built synchronously) ───────────────
const MEANING = { en: 'en.sahih', tr: 'tr.diyanet', fr: 'fr.hamidullah', ur: 'ur.jalandhry', id: 'id.indonesian' };
const ayahKey = (a, ed) => `nq_ayah_txt_${a.surah}_${a.ayah}_${ed}`;
const readTxt = (a, ed) => { try { return localStorage.getItem(ayahKey(a, ed)) || ''; } catch { return ''; } };

async function prefetchAyahTexts(list) {
  const lang = getLang();
  const eds = ['quran-uthmani', ...(MEANING[lang] ? [MEANING[lang]] : [])];
  for (const a of list) {
    for (const ed of eds) {
      if (readTxt(a, ed)) continue;
      try {
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${a.surah}:${a.ayah}/${ed}`);
        const json = await res.json();
        const txt = String(json && json.data && json.data.text || '').replace(/^﻿/, '').trim();
        if (txt) localStorage.setItem(ayahKey(a, ed), txt);
      } catch { return; }   // offline: try again next time
    }
  }
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function ayahContent(a) {
  const lang = getLang();
  const ar = readTxt(a, 'quran-uthmani');
  const meaning = MEANING[lang] ? readTxt(a, MEANING[lang]) : '';
  const ref = `${surahName(a.surah)} ${num(a.ayah)}`;
  const title = trNow('آية اليوم · {ref}', { ref });
  if (!ar) return { title, body: trNow(a.reason), large: trNow(a.reason) };
  const body = clip(`﴿${ar}﴾`, 170);
  const large = meaning ? `﴿${ar}﴾\n\n${meaning}` : `﴿${ar}﴾`;
  return { title, body, large: clip(large, 900) };
}

// ── plan → notifications ─────────────────────────────────────────────────────
function toNotification(e, ctx) {
  const { settings, city, exact } = ctx;
  const ios = isIOS();
  const base = {
    id: e.id,
    schedule: { at: new Date(e.at), allowWhileIdle: true },
    smallIcon: SMALL_ICON, iconColor: ICON_COLOR,
    autoCancel: true,
    isExactNotification: exact,
  };
  if (e.kind === 'prayer') {
    const p = prayerLabel(e.prayer);
    const where = cityLabel(city && city.name);
    const rec = recordingFor(settings, e.prayer);
    const adhan = e.mode === 'adhan' && rec;
    return {
      ...base,
      title: trNow('حان وقت صلاة {p}', { p }),
      body: where ? trNow('حان الآن موعد صلاة {p} في {city}', { p, city: where }) : trNow('حان الآن موعد صلاة {p}', { p }),
      actionTypeId: adhan ? 'NQ_ADHAN' : 'NQ_PRAYER',
      channelId: ios ? undefined : (adhan ? channelIdFor(rec.id) : CH_NOTIFY),
      sound: ios ? (adhan ? iosSound(rec.id) : 'default') : undefined,
      // iOS in the foreground: no system banner/sound — the app shows the adhan screen and plays the full adhan
      foreground: ios ? false : undefined,
      interruptionLevel: settings.breakthrough ? 'timeSensitive' : 'active',
      threadIdentifier: 'prayer', group: 'prayer',
      extra: { nq: 'prayer', prayer: e.prayer, mode: e.mode, rec: rec ? rec.id : '', time: e.time, date: e.date, city: where, at: e.at },
    };
  }
  if (e.kind === 'reminder') {
    const p = prayerLabel(e.prayer);
    return {
      ...base,
      title: trNow('صلاة {p} بعد {n} دقيقة', { p, n: num(e.minutesBefore) }),
      body: trNow('استعدّ للصلاة، يُرفع الأذان عند {t}', { t: num(e.time) }),
      channelId: ios ? undefined : CH_REMINDER,
      sound: ios ? 'default' : undefined,
      threadIdentifier: 'prayer', group: 'prayer',
      extra: { nq: 'reminder', prayer: e.prayer },
    };
  }
  const a = e.payload;
  const c = ayahContent(a);
  return {
    ...base,
    isExactNotification: false,                 // a morning ayah needn't wake the device exactly
    title: c.title, body: c.body, largeBody: c.large,
    channelId: ios ? undefined : CH_AYAH,
    sound: ios ? 'default' : undefined,
    threadIdentifier: 'ayah', group: 'ayah',
    extra: { nq: 'ayah', surah: a.surah, ayah: a.ayah },
  };
}

let running = null;
let again = false;

/** Re-plan everything (coalesced). Returns { scheduled, permission, exact } for the settings UI. */
export function reschedule(reason = '') {
  if (running) { again = true; return running; }
  running = (async () => {
    let result;
    try { result = await doReschedule(reason); }
    finally { running = null; }
    if (again) { again = false; return reschedule('queued'); }
    return result;
  })();
  return running;
}

async function doReschedule() {
  const settings = readSettings();
  const alarms = readAlarms();
  const city = readCity();
  const permission = await notificationPermission();
  const exactStatus = await exactAlarmStatus();

  // cancel what we scheduled before (never the snooze or other features' notifications)
  try {
    const pending = (await LocalNotifications.getPending()).notifications || [];
    const ours = pending.filter(n => isPlanId(Number(n.id))).map(n => ({ id: Number(n.id) }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  } catch {}
  if (permission !== 'granted') return { scheduled: 0, permission, exact: exactStatus };

  // data the plan needs: aladhan months (online) and the daily ayah texts
  const now = Date.now();
  if (city && settings.enabled) {
    const d0 = zonedDate(city.tz, now), d1 = addDays(d0, settings.days);
    const months = [{ y: d0.y, mo: d0.mo }];
    if (d1.mo !== d0.mo || d1.y !== d0.y) months.push({ y: d1.y, mo: d1.mo });
    if (navigator.onLine !== false) await prefetchMonths(city, months);
  }
  const ayahFor = day => FEATURED_AYAHS[dailyIndexFor(day, FEATURED_AYAHS.length)];
  if (settings.dailyAyah && navigator.onLine !== false) {
    const d0 = zonedDate('', now);
    const list = [];
    for (let i = 0; i < settings.days; i++) { const a = ayahFor(addDays(d0, i)); if (!list.includes(a)) list.push(a); }
    await prefetchAyahTexts(list);
  }

  const plan = buildPlan({
    now: Date.now(), settings, alarms, city,
    getTimes: day => timesFor(city, day),
    dailyAyahFor: ayahFor,
    limit: isIOS() ? IOS_BUDGET : ANDROID_BUDGET,
  });
  const ctx = { settings, city, exact: exactStatus === 'granted' };
  const notifications = plan.map(e => toNotification(e, ctx));
  if (notifications.length) {
    try { await LocalNotifications.schedule({ notifications }); }
    catch (err) { if (import.meta.env.DEV) console.warn('[adhan] schedule failed', err); }
  }
  try { localStorage.setItem('nq_adhan_last_plan', JSON.stringify({ at: Date.now(), count: notifications.length, first: plan[0] ? plan[0].at : null })); } catch {}
  return { scheduled: notifications.length, permission, exact: exactStatus, next: plan.find(e => e.kind === 'prayer') || null };
}

// ── snooze ───────────────────────────────────────────────────────────────────
export async function snooze(extra, minutes = 5) {
  const p = prayerLabel(extra.prayer);
  try {
    await LocalNotifications.cancel({ notifications: [{ id: SNOOZE_ID }] }).catch(() => {});
    await LocalNotifications.schedule({ notifications: [{
      id: SNOOZE_ID,
      title: trNow('تذكير: صلاة {p}', { p }),
      body: trNow('هذا تذكيرك بعد ٥ دقائق من الأذان'),
      schedule: { at: new Date(Date.now() + minutes * 60000), allowWhileIdle: true },
      channelId: isIOS() ? undefined : CH_NOTIFY, sound: isIOS() ? 'default' : undefined,
      smallIcon: SMALL_ICON, iconColor: ICON_COLOR, actionTypeId: 'NQ_PRAYER',
      isExactNotification: (await exactAlarmStatus()) === 'granted',
      extra: { nq: 'snooze', prayer: extra.prayer },
    }] });
  } catch {}
}

/** Stop the sound of a delivered adhan notification (Android: removing it stops the channel sound). */
export async function dismissDelivered(id) {
  try {
    if (id != null) await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: Number(id), title: '', body: '' }] });
  } catch {}
}

// ── taps, actions and foreground delivery ───────────────────────────────────
let lastActiveAt = Date.now();

function openMoment(n, { playInApp }) {
  const x = (n && n.extra) || {};
  const settings = readSettings();
  const rec = x.rec || (recordingFor(settings, x.prayer) || {}).id;
  const elapsed = x.at ? Math.max(0, (Date.now() - Number(x.at)) / 1000) : 0;
  if (elapsed > 15 * 60) { navigate('/prayer-times'); return; }   // an old notification: just open the times
  showAdhanMoment({
    id: n.id, prayer: x.prayer, time: x.time, city: x.city, recording: rec,
    play: playInApp && x.mode === 'adhan' && !!rec, offset: elapsed,
    onSnooze: () => snooze(x),
    onStop: () => dismissDelivered(n.id),
  });
}

function leaveIfLaunchedByAction() {
  // An action button brought the app up just for this: go back to what the visitor was doing.
  if (isAndroid() && Date.now() - lastActiveAt < 2500) App.minimizeApp().catch(() => {});
}

export async function initAdhan() {
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) { lastActiveAt = Date.now(); reschedule('resume'); }
  });
  LocalNotifications.addListener('localNotificationActionPerformed', async ({ actionId, notification }) => {
    const x = (notification && notification.extra) || {};
    if (x.nq === 'prayer') {
      if (actionId === 'stop') { await dismissDelivered(notification.id); leaveIfLaunchedByAction(); return; }
      if (actionId === 'snooze') { await dismissDelivered(notification.id); await snooze(x); leaveIfLaunchedByAction(); return; }
      openMoment(notification, { playInApp: true });     // tapped: iOS sound was ≤ 30 s, Android's stopped on tap
      return;
    }
    if (x.nq === 'snooze' && actionId === 'snooze') { await snooze(x); leaveIfLaunchedByAction(); return; }
    if (x.nq === 'ayah') { navigate('/daily-ayah'); return; }
    if (x.nq === 'reminder' || x.nq === 'snooze') navigate('/prayer-times');
  });
  LocalNotifications.addListener('localNotificationReceived', async (n) => {
    const x = (n && n.extra) || {};
    if (x.nq !== 'prayer') return;
    // iOS: only delivered here while the app is in the foreground (no banner/sound, see toNotification).
    // Android: also while in the background; the channel already plays the full adhan.
    let active = true;
    try { active = (await App.getState()).isActive; } catch {}
    if (!active) return;
    openMoment(n, { playInApp: isIOS() });
  });
  window.addEventListener('nq-lang-change', async () => { await ensureChannels(); await registerActions(); reschedule('lang'); });
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('nq_pray_')) reschedule('storage'); });
  onSettings(() => reschedule('settings'));
  await ensureChannels();
  await registerActions();
  reschedule('launch');
}

export { PRAYERS };
