// WebViewer 1441 icon refresh; retain existing offline shell behavior.
const SHELL_CACHE = 'webviewer-shell-v1441';
const SHELL_FILES = [
  './mobile.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put('./mobile.html', fresh.clone());
        }
        return fresh;
      } catch (_) {
        return (await caches.match('./mobile.html')) || Response.error();
      }
    })());
    return;
  }
  if (/\.json$/i.test(url.pathname)) {
    if (url.pathname.endsWith('/version.json')) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch (_) {
          return (await caches.match(request)) || Response.error();
        }
      })());
    }
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  })());
});
