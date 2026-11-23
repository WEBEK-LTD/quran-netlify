import { useEffect, useRef, useState, useCallback } from 'react';
import { capi } from './api';
import { unread } from './store';

/** Runs fn now and every `ms` while the page is visible (and again when it becomes visible). */
export function usePoll(fn, ms, deps = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let alive = true;
    let timer = null;
    const tick = async () => {
      clearTimeout(timer);
      if (!alive) return;
      if (!document.hidden) { try { await ref.current(); } catch {} }
      if (alive && ms) timer = setTimeout(tick, ms);
    };
    const onVis = () => { if (!document.hidden) tick(); };
    tick();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Simple loader: { data, error, loading, reload, setData } */
export function useLoad(fn, deps = []) {
  const [st, setSt] = useState({ data: null, error: null, loading: true });
  const ref = useRef(fn);
  ref.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async (quiet) => {
    const id = ++seq.current;
    if (!quiet) setSt(v => ({ ...v, loading: true, error: null }));
    try {
      const data = await ref.current();
      if (id === seq.current) setSt({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === seq.current) setSt(v => ({ data: quiet ? v.data : null, error, loading: false }));
      return null;
    }
  }, []);
  useEffect(() => { reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const setData = useCallback((f) => setSt(v => ({ ...v, data: typeof f === 'function' ? f(v.data) : f })), []);
  return { ...st, reload, setData };
}

// unread badges (notifications + messages), cheap with ETag/304
let nTag = '', cTag = '';
export async function refreshUnread(minor) {
  try {
    const r = await capi.poll('/me/notifications?limit=1', nTag);
    if (!r.notModified) { nTag = r.etag || ''; unread.set(v => ({ ...v, notifications: (r.data && r.data.unread) || 0 })); }
  } catch {}
  if (minor) return;
  try {
    const r = await capi.poll('/me/conversations', cTag);
    if (!r.notModified) {
      cTag = r.etag || '';
      const items = (r.data && r.data.items) || [];
      unread.set(v => ({ ...v, messages: items.reduce((a, c) => a + (c.unread || 0), 0) }));
    }
  } catch {}
}
export function useUnread(minor) {
  usePoll(() => refreshUnread(minor), 45000, [minor]);
  return unread.use();
}
