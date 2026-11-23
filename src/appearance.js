// ─── Appearance: viewing mode, colour-blind palette, text size, motion ──────
// Stored in localStorage 'nq_appearance' = { mode, cb, size, reduce }.
// Applied as attributes on <html> (see styles/theme.css). index.html runs the
// same logic inline before first paint so the page never flashes.
import { useSyncExternalStore } from 'react';

export const MODES = [
  { id: 'auto',     label: 'تلقائي',       hint: 'يتبع وضع جهازك' },
  { id: 'dark',     label: 'ليلي',         hint: 'خلفية داكنة مريحة' },
  { id: 'light',    label: 'نهاري',        hint: 'خلفية فاتحة' },
  { id: 'sepia',    label: 'ورق المصحف',   hint: 'لون الورق القديم، مريح للقراءة الطويلة' },
  { id: 'contrast', label: 'تباين عالٍ',   hint: 'لضعاف البصر: ألوان واضحة وخط أكبر' },
];
const MODE_IDS = MODES.map(m => m.id);
const KEY = 'nq_appearance';
const DEFAULTS = { mode: 'auto', cb: false, size: 100, reduce: false };

function read() {
  let a = {};
  try { a = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  if (!a.mode) {
    // migrate the old light/dark switch
    try { if (localStorage.getItem('nq_theme') === 'light') a.mode = 'light'; } catch {}
  }
  const out = { ...DEFAULTS, ...a };
  if (!MODE_IDS.includes(out.mode)) out.mode = 'auto';
  out.size = Math.min(140, Math.max(90, Number(out.size) || 100));
  out.cb = !!out.cb; out.reduce = !!out.reduce;
  return out;
}

let state = read();
const listeners = new Set();
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function resolvedScheme(s = state) {
  if (s.mode === 'dark' || s.mode === 'contrast') return 'dark';
  if (s.mode === 'light' || s.mode === 'sepia') return 'light';
  return mq && mq.matches ? 'light' : 'dark';
}

function apply() {
  const r = document.documentElement;
  const scheme = resolvedScheme();
  r.dataset.mode = state.mode;
  r.dataset.scheme = scheme;
  r.dataset.cb = state.cb ? 'on' : 'off';
  r.dataset.reduce = state.reduce ? 'on' : 'off';
  const base = 16 * state.size / 100 * (state.mode === 'contrast' ? 1.12 : 1);
  r.style.fontSize = base === 16 ? '' : base + 'px';
  // keep the browser UI colour in step
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#060D0A');
  // legacy: some older components still read body.light
  document.body && document.body.classList.toggle('light', scheme === 'light');
}

function emit() { listeners.forEach(fn => fn()); }

export function initAppearance() {
  apply();
  if (mq) {
    const onChange = () => { if (state.mode === 'auto') { state = { ...state }; apply(); emit(); } };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
  }
}

export function getAppearance() { return state; }

export function setAppearance(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem('nq_theme', resolvedScheme() === 'light' ? 'light' : 'dark');
  } catch {}
  apply();
  emit();
}

// Quick toggle in the header: flips between night and day.
export function toggleScheme() {
  setAppearance({ mode: resolvedScheme() === 'dark' ? 'light' : 'dark' });
}

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function useAppearance() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return { ...s, scheme: resolvedScheme(s) };
}
