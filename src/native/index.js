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
import { initKeyboard } from './keyboard';

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
  step('keyboard', initKeyboard);
  // drop the splash onto the painted first screen (src/native/NativeShell.jsx), never onto a blank page
  await firstScreen(2500);
  SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
  // background work after the first screen is up, so it never competes with it
  afterIdle(() => {
    step('sw', unregisterServiceWorkers);
    step('adhan', initAdhan);
    step('push', initPush);
  });
}

function firstScreen(maxMs) {
  return new Promise((resolve) => {
    if (window.__nqFirstScreen) { resolve(); return; }
    const done = () => { clearTimeout(t); window.removeEventListener('nq-first-screen', done); resolve(); };
    const t = setTimeout(done, maxMs);
    window.addEventListener('nq-first-screen', done);
  });
}

function afterIdle(fn) {
  const go = () => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300));
  setTimeout(go, 600);
}
