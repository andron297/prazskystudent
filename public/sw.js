/* Stihnu – service worker: offline app shell + cache hashovaných assetů. API se nikdy necachuje. */
const VERSION = 'stihnu-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        // Předem uloží i líně načítané sekce a fonty (seznam generuje build).
        try {
          const response = await fetch('/precache-manifest.json', { cache: 'no-store' });
          if (response.ok) {
            const { files } = await response.json();
            await cache.addAll(files);
          }
        } catch (error) {
          // Offline instalace bez manifestu – soubory se uloží při prvním použití.
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navigace: síť první (aktuální verze), offline záloha z cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true }).then((cached) => cached || caches.match('/', { ignoreVary: true }))),
    );
    return;
  }

  // Hashované assety a ikony: cache první.
  if (url.pathname.startsWith('/assets/') || /\.(?:png|svg|woff2?|webmanifest|ico)$/.test(url.pathname)) {
    event.respondWith(
      // ignoreVary: moduly se načítají v CORS režimu (hlavička Origin), odpověď může mít „Vary: Origin“.
      caches.match(request, { ignoreVary: true }).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
