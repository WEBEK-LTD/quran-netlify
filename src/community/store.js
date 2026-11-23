// Shared state for the community screens: my community profile, a toast, the
// unread-notification count. Tiny external stores (useSyncExternalStore).
import { useSyncExternalStore } from 'react';
import { capi } from './api';

function makeStore(initial) {
  let v = initial;
  const subs = new Set();
  return {
    get: () => v,
    set: (nv) => { v = typeof nv === 'function' ? nv(v) : nv; subs.forEach(f => f()); },
    use: () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => v),
  };
}

// ── my community profile (GET /me/community-profile) ────────────────────────
export const me = makeStore({ status: 'idle', data: null, error: null });
let inflight = null;
export function loadMe(force = false) {
  const cur = me.get();
  if (!force && (cur.status === 'ready' || inflight)) return inflight || Promise.resolve(cur.data);
  if (cur.status !== 'ready') me.set({ ...cur, status: 'loading' });
  inflight = capi.get('/me/community-profile')
    .then(data => { me.set({ status: 'ready', data, error: null }); return data; })
    .catch(error => { me.set({ status: 'error', data: cur.data, error }); return null; })
    .finally(() => { inflight = null; });
  return inflight;
}
export function setMe(data) { me.set({ status: 'ready', data, error: null }); }
export const useMe = () => me.use();
export function resetMe() { me.set({ status: 'idle', data: null, error: null }); }

// ── toast (one at a time, announced politely) ───────────────────────────────
export const toastStore = makeStore(null);
let toastTimer = null;
export function toast(text, tone = 'info') {
  clearTimeout(toastTimer);
  toastStore.set({ text, tone, id: Date.now() });
  toastTimer = setTimeout(() => toastStore.set(null), tone === 'error' ? 4200 : 2800);
}

// ── unread notifications (polled by the hub / notifications page) ──────────
export const unread = makeStore({ notifications: 0, messages: 0 });
