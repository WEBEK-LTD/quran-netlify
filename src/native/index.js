// ─── Native app bootstrap (loaded only inside the Capacitor shell) ──────────
// main.jsx imports this lazily when window.Capacitor says we are native, so the
// website never downloads it. Order matters a little: links first (a launch URL
// may carry the sign-in token), then UI chrome, then background work.
import { SplashScreen } from '@capacitor/splash-screen';
import { isAndroid } from './platform';
import { initLinks } from './links';
import { initSystemBars } from './systemBars';
import { initTokenStore } from './tokenStore';
import { initMediaBridge } from './mediaBridge';
import { trackMedia } from './adhan/player';
import { initAdhan } from './adhan/notifications';
import { initPush } from './push';

let started = false;

async function unregisterServiceWorkers() {
  // A SW must never serve the app shell: the bundled build is already offline.
  try {
    if (!('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  } catch {}
}

export async function initNative() {
  if (started) return;
  started = true;
  document.documentElement.classList.add('nq-native', `nq-native-${isAndroid() ? 'android' : 'ios'}`);
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { if (import.meta.env.DEV) console.warn(`[native] ${name} failed`, e); }
  };
  await step('token', initTokenStore);
  await step('links', initLinks);
  await step('bars', initSystemBars);
  trackMedia();
  if (isAndroid()) await step('media', initMediaBridge);
  // the first frame is painted by now: drop the splash
  setTimeout(() => { SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {}); }, 60);
  step('sw', unregisterServiceWorkers);
  step('adhan', initAdhan);
  step('push', initPush);
}
