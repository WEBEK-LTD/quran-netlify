// ─── Talking to the service worker's audio cache (public/sw.js) ─────────────
//   prefetchAudio(urls)            warm the cache for the next few ayahs (fire and forget)
//   downloadSurahAudio(...)        keep a whole surah for offline listening, with progress
//   surahOfflineStatus(...)        how many of a surah's files are kept
//   offlineSummary()               all kept files (count, bytes)
//   removeOfflineAudio(urls?)      remove some kept files, or every cached recitation
// Everything degrades to a no-op / rejected promise when no service worker
// controls the page (first visit, private mode, unsupported browser).
import { getSurahAudioUrls } from '../api';
import { ayahCount } from './queue';

const sw = () => (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) || null;

export function offlineSupported() { return !!sw(); }

// The SW may take control after the first load — let the UI re-check.
export function onControllerChange(fn) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return () => {};
  navigator.serviceWorker.addEventListener('controllerchange', fn);
  return () => navigator.serviceWorker.removeEventListener('controllerchange', fn);
}

let lastPrefetch = '';
export function prefetchAudio(urls) {
  const c = sw();
  if (!c || !urls || !urls.length) return;
  const key = urls.join('|');
  if (key === lastPrefetch) return;
  lastPrefetch = key;
  try { c.postMessage({ type: 'nq-audio-prefetch', urls }); } catch {}
}

function ask(msg, { onProgress, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const c = sw();
    if (!c) { reject(new Error('no-sw')); return; }
    const ch = new MessageChannel();
    let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { ch.port1.close(); reject(new Error('timeout')); }, timeout); };
    ch.port1.onmessage = e => {
      const d = e.data || {};
      if (d.progress) { arm(); if (onProgress) onProgress(d); return; }
      clearTimeout(timer);
      ch.port1.close();
      if (d.error) reject(new Error(d.error)); else resolve(d);
    };
    arm();
    try { c.postMessage(msg, [ch.port2]); } catch (err) { clearTimeout(timer); reject(err); }
  });
}

export const surahUrls = (reader, surah) => getSurahAudioUrls(reader, surah, ayahCount(surah));

/** → { promise: Promise<{done, failed, total, cancelled}>, cancel() } */
export function downloadSurahAudio(reader, surah, onProgress) {
  const id = `${reader}:${surah}:${Date.now()}`;
  const promise = ask({ type: 'nq-audio-download', id, urls: surahUrls(reader, surah) }, { onProgress, timeout: 60000 });
  return {
    promise,
    cancel() { const c = sw(); if (c) c.postMessage({ type: 'nq-audio-cancel', id }); },
  };
}

/** → { have, total } */
export function surahOfflineStatus(reader, surah) {
  return ask({ type: 'nq-audio-status', urls: surahUrls(reader, surah) });
}

/** → { files, bytes } */
export function offlineSummary() {
  return ask({ type: 'nq-audio-summary' });
}

/** urls omitted → remove every cached recitation (downloads and the recent cache). */
export function removeOfflineAudio(urls) {
  return ask({ type: 'nq-audio-remove', urls: urls || null }, { timeout: 30000 });
}

// Open the connection to the recitation host ahead of the first tap, so starting an
// ayah does not also wait for DNS + TLS. Audio elements fetch without CORS, so the
// hint carries no `crossorigin`.
let preconnected = false;
export function preconnectAudio() {
  if (preconnected || typeof document === 'undefined') return;
  preconnected = true;
  try {
    ['preconnect', 'dns-prefetch'].forEach(rel => {
      const l = document.createElement('link');
      l.rel = rel;
      l.href = 'https://everyayah.com';
      document.head.appendChild(l);
    });
  } catch {}
}
