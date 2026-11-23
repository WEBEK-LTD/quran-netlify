// نور القرآن — Service Worker
// Safe, minimal caching:
//  - Only same-origin GET requests are ever intercepted.
//  - Cross-origin (APIs, fonts, audio CDNs), Range requests and audio/video are
//    left to the browser (intercepting them breaks audio on iOS/Safari).
//  - Navigations: network-first, offline fallback to the cached /index.html.
//  - Hashed build assets (/assets/*): cache-first, cached only when the response
//    is OK and its content-type matches the file type.

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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
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
