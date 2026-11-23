// ─── Deep links, sign-in return and the Android back button ─────────────────
//   https://nuralquran.net/<path>   universal link / Android App Link → same route in the app
//   nuralquran://auth?token=…       Google sign-in finished (API GoogleController, client=app)
//   nuralquran://auth?status=error&reason=…
//   nuralquran://<route>?…          e.g. nuralquran://reader?surah=2 (fallback scheme)
import { App } from '@capacitor/app';
import { setToken } from '../apiClient';
import { closeBrowser } from './browser';

const SITE_HOSTS = ['nuralquran.net', 'www.nuralquran.net'];
const LANGS = ['ar', 'en', 'tr', 'fr', 'ur', 'id'];

/** Client-side navigation from outside React (BrowserRouter listens to popstate). */
export function navigate(path, { replace = false } = {}) {
  if (!path || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return;
  const cur = window.location.pathname + window.location.search;
  if (cur === path) return;
  try {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  } catch {}
}

/** Website URL path → app route (the static SEO pages have app equivalents). */
export function webPathToRoute(pathname, search = '', hash = '') {
  let p = pathname || '/';
  const surah = /^\/([a-z]{2})\/surah\/(\d{1,3})(?:\/|\.md)?$/.exec(p);
  if (surah && LANGS.includes(surah[1])) {
    const n = +surah[2];
    return n >= 1 && n <= 114 ? `/reader?surah=${n}` : '/reader';
  }
  if (/^\/([a-z]{2})\/?$/.test(p) && LANGS.includes(p.slice(1, 3))) return '/';
  const app = /^\/seo\/app\/([a-z-]+)\.html$/.exec(p);
  if (app) p = '/' + app[1];
  if (/\.(xml|txt|md|json|png|jpg|svg|ico|js|css)$/i.test(p)) return null;
  return p + (search || '') + (hash || '');
}

let lastUrl = '', lastAt = 0;

export function handleUrl(raw) {
  if (!raw) return false;
  const now = Date.now();
  if (raw === lastUrl && now - lastAt < 3000) return true;   // launch URL + appUrlOpen for the same open
  lastUrl = raw; lastAt = now;
  let u;
  try { u = new URL(raw); } catch { return false; }

  if (u.protocol === 'nuralquran:') {
    const host = (u.hostname || '').toLowerCase();
    if (host === 'auth') {
      const token = u.searchParams.get('token');
      const status = u.searchParams.get('status');
      closeBrowser();
      if (token) {
        setToken(token);
        navigate('/auth/callback?status=ok', { replace: true });
      } else if (status === 'error') {
        const reason = u.searchParams.get('reason') || '';
        navigate(`/auth/callback?status=error&reason=${encodeURIComponent(reason)}`, { replace: true });
      }
      return true;
    }
    const path = '/' + [host, u.pathname.replace(/^\/+/, '')].filter(Boolean).join('/');
    navigate(webPathToRoute(path.replace(/\/$/, '') || '/', u.search, u.hash) || '/');
    return true;
  }

  if ((u.protocol === 'https:' || u.protocol === 'http:') && SITE_HOSTS.includes(u.hostname)) {
    // email links that finish in the browser normally (verify / reset) work in the app too
    const route = webPathToRoute(u.pathname, u.search, u.hash);
    if (route) navigate(route);
    return true;
  }
  return false;
}

export async function initLinks() {
  App.addListener('appUrlOpen', (e) => handleUrl(e && e.url));
  try {
    const launch = await App.getLaunchUrl();
    if (launch && launch.url) handleUrl(launch.url);
  } catch {}

  // Android hardware/gesture back: close the adhan screen first, then history, then leave.
  App.addListener('backButton', ({ canGoBack }) => {
    const ev = new CustomEvent('nq-native-back', { cancelable: true });
    if (!window.dispatchEvent(ev)) return;           // someone (an overlay) handled it
    if (canGoBack && window.location.pathname !== '/') window.history.back();
    else App.minimizeApp().catch(() => {});
  });
}
