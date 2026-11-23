// Uthmani text for single ayahs (favourites, notes), fetched lazily with a
// small concurrency limit and cached for the session.
import { useEffect, useState } from 'react';

const CACHE_KEY = 'nq_ayah_text_cache';
const mem = new Map();
try {
  const raw = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
  for (const k of Object.keys(raw)) mem.set(k, raw[k]);
} catch {}
let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries([...mem].slice(-400)))); } catch {}
  }, 400);
}

const inflight = new Map();
const queue = [];
let active = 0;
const LIMIT = 4;
function pump() {
  while (active < LIMIT && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => { active--; pump(); });
  }
}

export function getAyahText(surah, ayah) {
  const key = `${surah}:${ayah}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = new Promise((resolve, reject) => {
    queue.push(() => fetch(`https://api.alquran.cloud/v1/ayah/${key}/quran-uthmani`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        const t = String(d?.data?.text || '').replace(/^﻿/, '');
        if (!t) throw new Error('empty');
        mem.set(key, t); persist(); resolve(t);
      })
      .catch(reject)
      .finally(() => inflight.delete(key)));
    pump();
  });
  inflight.set(key, p);
  return p;
}

export function cachedAyahText(surah, ayah) { return mem.get(`${surah}:${ayah}`) || ''; }

// { text, failed } for one ayah; re-renders when it arrives.
export function useAyahText(surah, ayah) {
  const [st, setSt] = useState(() => ({ text: cachedAyahText(surah, ayah), failed: false }));
  useEffect(() => {
    let alive = true;
    const have = cachedAyahText(surah, ayah);
    if (have) { setSt({ text: have, failed: false }); return; }
    setSt({ text: '', failed: false });
    getAyahText(surah, ayah)
      .then(t => { if (alive) setSt({ text: t, failed: false }); })
      .catch(() => { if (alive) setSt({ text: '', failed: true }); });
    return () => { alive = false; };
  }, [surah, ayah]);
  return st;
}
