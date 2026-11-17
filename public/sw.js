// نور القرآن — Service Worker
// Caches shell + fonts, falls back gracefully for API calls

const CACHE_NAME = 'noor-quran-v1';
const FONT_CACHE = 'noor-fonts-v1';

// App shell files to cache immediately
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Fonts/icons → Cache first
// - API calls (alquran.cloud, anthropic, supabase, netlify/functions) → Network only
// - App shell → Stale while revalidate
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== 'GET') return;

  // Fonts → cache first, long-lived
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(e.request).then(cached =>
          cached || fetch(e.request).then(res => {
            cache.put(e.request, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  // External APIs → network only, never cache
  if (
    url.hostname.includes('alquran.cloud') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.pathname.startsWith('/.netlify/')
  ) {
    return; // browser default
  }

  // App shell → stale while revalidate
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached); // offline fallback
        return cached || fetchPromise;
      })
    )
  );
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
