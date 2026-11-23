// ─── Push notifications (groundwork for voice rooms / community) ────────────
// FCM on Android (needs android/app/google-services.json), APNs on iOS (needs
// the Push Notifications capability + an APNs key on the backend). Off unless the
// build sets VITE_NQ_PUSH=1 — calling register() without Firebase configured
// crashes on Android, so the flag must only be set when google-services.json is
// present (the CI workflow does this automatically).
//
// Flow: askForPush() explains in Arabic why, then asks the OS → register() →
// 'registration' token → POST /me/devices {platform, token, app_version, lang}
// (rooms backend; a 404 is ignored and retried on the next launch); on sign-out
// DELETE /me/devices {token} (useAuth.signOutAuth calls unregisterDevice() first).
// A tap opens the screen for the payload's type (room / conversation / profile / group),
// else data.path / data.url inside the app.
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { api, getToken } from '../apiClient';
import { getLang } from '../i18n';
import { trNow } from '../l10n';
import { setGlobal } from '../store';
import { platform } from './platform';
import { navigate, webPathToRoute } from './links';
import { confirmDialog } from './ui';
import { flattenPushData, routeForPush } from './pushRoutes';

export const PUSH_ENABLED = import.meta.env.VITE_NQ_PUSH === '1';
const SENT_KEY = 'nq_push_sent';   // `${token}|${sessionTokenTail}|${lang}` last sent to the API

let deviceToken = null;
let started = false;

async function sendToken() {
  if (!deviceToken || !getToken()) return;      // only signed-in users have device rows
  const lang = getLang();
  const sig = `${deviceToken}|${(getToken() || '').slice(-8)}|${lang}`;
  try { if (localStorage.getItem(SENT_KEY) === sig) return; } catch {}
  let appVersion = '';
  try { const info = await App.getInfo(); appVersion = `${info.version} (${info.build})`; } catch {}
  try {
    // contract: docs/API.md → POST /me/devices {provider: fcm|apns, token, platform, app_version}
    // (iOS hands us the raw APNs token; Android the FCM registration token). `lang` is extra context.
    const p = platform();
    await api.post('/me/devices', { provider: p === 'ios' ? 'apns' : 'fcm', token: deviceToken, platform: p, app_version: appVersion.slice(0, 32), lang });
    try { localStorage.setItem(SENT_KEY, sig); } catch {}
  } catch (e) {
    // 404 until the rooms backend ships /me/devices; 401 when signed out — both fine.
    if (import.meta.env.DEV) console.info('[push] /me/devices not stored:', e && e.status);
  }
}

function openFromData(data) {
  if (!data) return;
  let path = routeForPush(data);
  const d = flattenPushData(data);
  if (!path && typeof d.path === 'string') path = d.path;
  if (!path && typeof d.url === 'string') {
    try { const u = new URL(d.url); if (/(^|\.)nuralquran\.net$/.test(u.hostname)) path = webPathToRoute(u.pathname, u.search, u.hash); } catch {}
  }
  if (path) navigate(path);
}

/** 'granted' | 'denied' | 'prompt' | 'off' (push not built into this app) */
export async function pushPermission() {
  if (!PUSH_ENABLED) return 'off';
  try {
    const p = await PushNotifications.checkPermissions();
    return p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'prompt';
  } catch { return 'off'; }
}

export async function initPush() {
  if (!PUSH_ENABLED || started) return;
  started = true;
  PushNotifications.addListener('registration', (t) => { deviceToken = t && t.value; sendToken(); });
  PushNotifications.addListener('registrationError', (e) => { if (import.meta.env.DEV) console.warn('[push] registration error', e); });
  PushNotifications.addListener('pushNotificationReceived', (n) => {
    // in the foreground: a short toast (not inside the room the push is about), and the
    // community screens refresh their badges
    const d = flattenPushData(n && n.data);
    try { window.dispatchEvent(new CustomEvent('nq-community-push', { detail: d })); } catch {}
    const here = window.location.pathname;
    const route = routeForPush(n && n.data);
    if (route && route === here) return;
    if (n && (n.title || n.body)) setGlobal({ toast: [n.title, n.body].filter(Boolean).join(' — ') });
  });
  PushNotifications.addListener('pushNotificationActionPerformed', (a) => openFromData(a && a.notification && a.notification.data));
  window.addEventListener('nq-token-change', () => sendToken());
  window.addEventListener('nq-lang-change', () => sendToken());
  if (platform() === 'android') {
    PushNotifications.createChannel({
      id: 'community', name: trNow('الغرف والمجتمع'), description: trNow('تنبيهات الغرف الصوتية والجروبات التي تتابعها'),
      importance: 4, visibility: 1, vibration: true,
    }).catch(() => {});
  }
  try {
    const p = await PushNotifications.checkPermissions();
    if (p.receive === 'granted') await PushNotifications.register();
  } catch {}
}

/** Ask for push permission with a clear explanation first. Returns true when granted. */
export async function askForPush() {
  if (!PUSH_ENABLED) return false;
  await initPush();
  try {
    const p = await PushNotifications.checkPermissions();
    if (p.receive === 'granted') { await PushNotifications.register(); return true; }
    if (p.receive === 'denied') return false;
    const ok = await confirmDialog({
      title: trNow('تنبيهات الغرف والمجتمع'),
      body: trNow('نرسل لك تنبيهاً عندما تبدأ غرفة صوتية في جروب تتابعه، أو عندما يصلك ردّ أو دعوة. لا نرسل إعلانات، ويمكنك إيقافها في أي وقت من إعدادات الجهاز.'),
      confirm: trNow('السماح بالتنبيهات'), cancel: trNow('ليس الآن'),
    });
    if (!ok) return false;
    const r = await PushNotifications.requestPermissions();
    if (r.receive !== 'granted') return false;
    await PushNotifications.register();
    return true;
  } catch { return false; }
}

/** Before signing out: detach this device from the account so its pushes stop. */
export async function unregisterDevice() {
  if (!PUSH_ENABLED || !deviceToken || !getToken()) return;
  try { await api.del('/me/devices', { token: deviceToken }); } catch {}
  try { localStorage.removeItem(SENT_KEY); } catch {}
}
