// ─── Status/navigation bar colours follow the in-app appearance mode ────────
// The page is edge-to-edge (viewport-fit=cover; the header pads itself with
// env(safe-area-inset-top)), so the bars show the page's own background; we only
// switch the icon colour, and on Android paint the window behind the WebView
// (visible as a strip on WebViews older than Chromium 140, which get padded).
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isAndroid } from './platform';
import { NQNative } from './nqNative';

const DARK_BG = '#060D0A';
const LIGHT_BG = '#F4F5F0';
let last = '';

function apply() {
  const r = document.documentElement;
  const scheme = r.dataset.scheme === 'light' ? 'light' : 'dark';
  let bg = '';
  try { bg = getComputedStyle(r).getPropertyValue('--bg').trim(); } catch {}
  if (!/^#[0-9a-f]{6}$/i.test(bg)) bg = scheme === 'light' ? LIGHT_BG : DARK_BG;
  const key = scheme + bg;
  if (key === last) return;
  last = key;
  SystemBars.setStyle({ style: scheme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
  if (isAndroid()) NQNative.setBackgroundColor({ color: bg }).catch(() => {});
}

export function initSystemBars() {
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme', 'data-mode'] });
}
