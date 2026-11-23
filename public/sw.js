// نور القرآن — Service Worker
// Safe, minimal caching:
//  - Only same-origin GET requests are ever intercepted.
//  - Cross-origin (APIs, fonts, audio CDNs), Range requests and audio/video are
//    left to the browser (intercepting them breaks audio on iOS/Safari).
//  - Navigations: network-first, offline fallback to the cached /index.html.
//  - Hashed build assets (/assets/*): cache-first, cached only when the response
//    is OK and its content-type matches the file type.
//  - The one cross-origin exception: recitation files from everyayah.com, served
//    from a dedicated audio cache (see "Recitation audio" below) — prefetched
//    ahead of playback and kept for offline listening on request.

const CACHE_NAME = 'noor-quran-v2';
const SHELL_URL  = '/index.html';

// Install: pre-cache the app shell (best effort — never fail the install)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll([SHELL_URL, '/manifest.json']))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

// Activate: remove every cache from older versions (incl. noor-fonts-v1)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && !AUDIO_CACHES.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function contentTypeMatches(pathname, res) {
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) return type.includes('javascript');
  if (pathname.endsWith('.css')) return type.includes('text/css');
  if (type.includes('text/html')) return false; // never cache an HTML fallback for an asset
  return true; // images / fonts / other static files under /assets/
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Recitation audio → cache-first from the audio caches, else the network
  if (isAudioUrl(url)) {
    // Safari plays media from a SW only as proper range responses: leave it the
    // network unless we hold a readable (non-opaque) copy of this file.
    if (IS_SAFARI && !audioPlayable.has(url.href)) return;
    e.respondWith(audioResponse(req, url.href));
    return;
  }

  // Same-origin only — everything else goes straight to the network
  if (url.origin !== self.location.origin) return;
  // Media / partial-content requests must never be intercepted
  if (req.headers.has('range')) return;
  if (req.destination === 'audio' || req.destination === 'video') return;
  // Netlify functions / APIs → browser default
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return;

  // Navigations → network-first, offline fallback to cached shell
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const type = (res.headers.get('content-type') || '').toLowerCase();
          if (res.ok && type.includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(SHELL_URL, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(SHELL_URL).then(cached => cached || Response.error())
        )
    );
    return;
  }

  // Hashed build assets → cache-first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res.ok && contentTypeMatches(url.pathname, res)) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // Anything else (icons, manifest, …) → browser default
});

// ── Recitation audio (everyayah.com) ───────────────────────────────────────
// Two caches, versioned separately from the app shell:
//   AUDIO_CACHE    recently played / prefetched files, LRU-capped
//   AUDIO_OFFLINE  surahs the visitor downloaded for offline listening (never evicted)
// Files are fetched with CORS when the host allows it (readable → served as
// proper 200/206 range responses); otherwise as opaque no-cors responses, which
// Chromium/Firefox accept for <audio> but whose size is unknown.
// The page talks to this part with postMessage (src/audio/offline.js).
const AUDIO_CACHE   = 'nq-audio-v1';
const AUDIO_OFFLINE = 'nq-audio-offline-v1';
const AUDIO_META    = 'nq-audio-meta-v1';
const AUDIO_CACHES  = [AUDIO_CACHE, AUDIO_OFFLINE, AUDIO_META];
const AUDIO_MAX_FILES = 300;
const AUDIO_MAX_BYTES = 150 * 1024 * 1024;
const AUDIO_OPAQUE_GUESS = 300 * 1024;   // size used for opaque files in the byte cap
const AUDIO_INDEX_URL = '/__nq-audio-index__';
const IS_SAFARI = /safari/i.test(self.navigator.userAgent) && !/chrome|chromium|crios|fxios|android|edg/i.test(self.navigator.userAgent);

function isAudioUrl(url) {
  return url.hostname === 'everyayah.com' && url.pathname.startsWith('/data/') && url.pathname.endsWith('.mp3');
}

// Index: href → { t: last used, s: bytes, o: opaque, off: kept offline }
let audioIndex = null;
let audioIndexLoading = null;
const audioPlayable = new Set(); // hrefs with a readable copy (Safari may use these)
let corsWorks = null;            // does the audio host answer CORS? (learned once)

function loadAudioIndex() {
  if (audioIndex) return Promise.resolve(audioIndex);
  if (audioIndexLoading) return audioIndexLoading;
  audioIndexLoading = caches.open(AUDIO_META)
    .then(c => c.match(AUDIO_INDEX_URL))
    .then(r => (r ? r.json() : {}))
    .catch(() => ({}))
    .then(async idx => {
      audioIndex = idx && typeof idx === 'object' ? idx : {};
      // reconcile with what the caches really hold
      for (const [name, off] of [[AUDIO_CACHE, false], [AUDIO_OFFLINE, true]]) {
        try {
          const c = await caches.open(name);
          const keys = await c.keys();
          const present = new Set(keys.map(k => k.url));
          present.forEach(h => {
            const m = audioIndex[h] || (audioIndex[h] = { t: 0, s: AUDIO_OPAQUE_GUESS, o: true });
            if (off) m.off = true;
          });
          Object.keys(audioIndex).forEach(h => {
            const m = audioIndex[h];
            if (!!m.off === off && !present.has(h)) delete audioIndex[h];
          });
        } catch {}
      }
      Object.keys(audioIndex).forEach(h => { if (!audioIndex[h].o) audioPlayable.add(h); });
      audioIndexLoading = null;
      return audioIndex;
    });
  return audioIndexLoading;
}

let saveTimer = null;
function saveAudioIndex() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!audioIndex) return;
    caches.open(AUDIO_META)
      .then(c => c.put(AUDIO_INDEX_URL, new Response(JSON.stringify(audioIndex), { headers: { 'Content-Type': 'application/json' } })))
      .catch(() => {});
  }, 400);
}

function touchAudio(href) {
  if (audioIndex && audioIndex[href]) { audioIndex[href].t = Date.now(); saveAudioIndex(); }
}

async function audioLookup(href) {
  for (const name of [AUDIO_OFFLINE, AUDIO_CACHE]) {
    try {
      const c = await caches.open(name);
      const r = await c.match(href);
      if (r) return r;
    } catch {}
  }
  return null;
}

// A readable cached file as a 200, or a 206 slice for a Range request.
async function rangeResponse(res, range) {
  const blob = await res.blob();
  const total = blob.size;
  const type = res.headers.get('content-type') || 'audio/mpeg';
  if (!range) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' } });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0, end = total - 1;
  if (m) {
    if (m[1] === '' && m[2] !== '') { start = Math.max(0, total - Number(m[2])); }
    else { start = Number(m[1] || 0); if (m[2] !== '') end = Math.min(total - 1, Number(m[2])); }
  }
  if (start >= total || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function audioResponse(req, href) {
  await loadAudioIndex().catch(() => {});
  const hit = await audioLookup(href);
  if (hit && hit.type !== 'opaque') {
    touchAudio(href);
    try { return await rangeResponse(hit, req.headers.get('range')); } catch {}
  }
  if (hit) {
    // An opaque copy cannot be sliced, and a whole-file answer would make the
    // file unseekable: network first (the prefetch warmed the HTTP cache too),
    // the opaque copy only when offline.
    touchAudio(href);
    return fetch(req).catch(() => hit);
  }
  return fetch(req);
}

// Fetch a whole file for the cache: CORS when possible (readable), else opaque.
async function fetchAudioFile(href) {
  if (corsWorks !== false) {
    try {
      const r = await fetch(href, { mode: 'cors', credentials: 'omit' });
      if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) {
        corsWorks = true;
        const blob = await r.blob();
        const type = r.headers.get('content-type') || 'audio/mpeg';
        return { make: () => new Response(blob, { headers: { 'Content-Type': type, 'Content-Length': String(blob.size) } }), size: blob.size, opaque: false };
      }
      if (!r.ok) return null; // 404 etc. — nothing to keep
    } catch {
      // a CORS refusal or no network: try no-cors once to tell them apart
    }
  }
  try {
    const r = await fetch(href, { mode: 'no-cors', credentials: 'omit' });
    if (r.type === 'opaque' || r.ok) {
      if (corsWorks === null) corsWorks = false;
      return { make: once(r), size: AUDIO_OPAQUE_GUESS, opaque: r.type === 'opaque' };
    }
  } catch {}
  return null;
}

// A response that can be handed out once (opaque bodies cannot be rebuilt).
const once = r => { let used = false; return () => (used ? null : (used = true, r)); };

async function putAudio(cacheName, href, got, off) {
  const c = await caches.open(cacheName);
  try {
    await c.put(href, got.make());
  } catch (err) {
    // over quota: free the oldest recent files and try once more
    await evictAudio(40);
    const again = got.make();
    if (!again) throw err;
    await c.put(href, again);
  }
  await loadAudioIndex();
  const prev = audioIndex[href];
  audioIndex[href] = { t: Date.now(), s: got.size, o: got.opaque, off: off || (prev && prev.off) || false };
  if (!got.opaque) audioPlayable.add(href);
  saveAudioIndex();
}

// LRU eviction of the recent cache (offline downloads are never evicted).
async function evictAudio(extra = 0) {
  await loadAudioIndex();
  const recent = Object.entries(audioIndex).filter(([, m]) => !m.off).sort((a, b) => a[1].t - b[1].t);
  let files = recent.length;
  let bytes = recent.reduce((n, [, m]) => n + (m.s || 0), 0);
  const c = await caches.open(AUDIO_CACHE);
  let i = 0;
  let drop = extra;
  while (i < recent.length && (files > AUDIO_MAX_FILES || bytes > AUDIO_MAX_BYTES || drop > 0)) {
    const [href, m] = recent[i++];
    await c.delete(href).catch(() => {});
    delete audioIndex[href];
    audioPlayable.delete(href);
    files -= 1; bytes -= m.s || 0; drop -= 1;
  }
  if (i) saveAudioIndex();
}

const audioInflight = new Map();
function cacheAudio(href, { offline = false } = {}) {
  const key = (offline ? 'off:' : 'lru:') + href;
  if (audioInflight.has(key)) return audioInflight.get(key);
  const p = (async () => {
    await loadAudioIndex();
    const m = audioIndex[href];
    if (m && (m.off || !offline)) { touchAudio(href); return true; }
    if (m && offline) {
      // already in the recent cache: copy it into the offline cache
      const r = await (await caches.open(AUDIO_CACHE)).match(href);
      if (r) {
        await putAudio(AUDIO_OFFLINE, href, { make: once(r), size: m.s, opaque: r.type === 'opaque' }, true);
        await (await caches.open(AUDIO_CACHE)).delete(href).catch(() => {});
        return true;
      }
    }
    const got = await fetchAudioFile(href);
    if (!got) return false;
    await putAudio(offline ? AUDIO_OFFLINE : AUDIO_CACHE, href, got, offline);
    if (!offline) await evictAudio();
    return true;
  })().catch(() => false).finally(() => audioInflight.delete(key));
  audioInflight.set(key, p);
  return p;
}

const audioCancelled = new Set();
loadAudioIndex().catch(() => {}); // early, so Safari's synchronous check has the list

async function downloadAudio(id, urls, port) {
  const total = urls.length;
  let done = 0, failed = 0, next = 0;
  const post = msg => { try { port && port.postMessage(msg); } catch {} };
  async function worker() {
    while (next < urls.length && !audioCancelled.has(id)) {
      const href = urls[next++];
      const ok = await cacheAudio(href, { offline: true });
      if (ok) done += 1; else failed += 1;
      post({ progress: true, done, failed, total });
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const cancelled = audioCancelled.delete(id);
  post({ ok: true, done, failed, total, cancelled });
}

self.addEventListener('message', e => {
  const d = e.data || {};
  const port = e.ports && e.ports[0];
  const reply = msg => { try { port && port.postMessage(msg); } catch {} };
  const urls = Array.isArray(d.urls) ? d.urls.filter(u => { try { return isAudioUrl(new URL(u)); } catch { return false; } }) : null;

  switch (d.type) {
    case 'nq-audio-prefetch':
      e.waitUntil((async () => {
        for (const href of (urls || []).slice(0, 8)) await cacheAudio(href);
      })());
      break;
    case 'nq-audio-download':
      e.waitUntil(downloadAudio(d.id, urls || [], port));
      break;
    case 'nq-audio-cancel':
      audioCancelled.add(d.id);
      break;
    case 'nq-audio-status':
      e.waitUntil(loadAudioIndex().then(idx => {
        const list = urls || [];
        reply({ have: list.filter(h => idx[h] && idx[h].off).length, total: list.length });
      }).catch(err => reply({ error: String(err) })));
      break;
    case 'nq-audio-summary':
      e.waitUntil(loadAudioIndex().then(idx => {
        const off = Object.values(idx).filter(m => m.off);
        reply({ files: off.length, bytes: off.reduce((n, m) => n + (m.s || 0), 0) });
      }).catch(err => reply({ error: String(err) })));
      break;
    case 'nq-audio-remove':
      e.waitUntil((async () => {
        await loadAudioIndex();
        if (urls) {
          const c = await caches.open(AUDIO_OFFLINE);
          for (const h of urls) {
            await c.delete(h).catch(() => {});
            if (audioIndex[h] && audioIndex[h].off) { delete audioIndex[h]; audioPlayable.delete(h); }
          }
        } else {
          await Promise.all(AUDIO_CACHES.map(n => caches.delete(n).catch(() => {})));
          audioIndex = {};
          audioPlayable.clear();
        }
        saveAudioIndex();
        reply({ ok: true });
      })().catch(err => reply({ error: String(err) })));
      break;
    default:
  }
});

// Push notification handler (for ward reminders)
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'نور القرآن 🌙', {
      body: data.body || 'حان وقت وردك اليومي',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      dir: 'rtl',
      lang: 'ar',
      tag: 'ward-reminder',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wcs => {
      if (wcs.length) return wcs[0].focus();
      return clients.openWindow('/hifz');
    })
  );
});
