const SHELL_CACHE = 'webviewer-shell-v803';

const APP_PAGE = './index.html';

const SHELL_FILES = [
  APP_PAGE,
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
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== SHELL_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // 페이지 이동:
  // 온라인이면 항상 최신 HTML 사용.
  // 네트워크 실패 시 마지막으로 저장한 index.html 사용.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, {
          cache: 'no-store'
        });

        if (fresh && fresh.ok) {
          const cache = await caches.open(SHELL_CACHE);

          await cache.put(
            APP_PAGE,
            fresh.clone()
          );

          return fresh;
        }

        return (
          await caches.match(APP_PAGE)
        ) || fresh;

      } catch (_) {
        return (
          await caches.match(APP_PAGE)
        ) || Response.error();
      }
    })());

    return;
  }

  // 대용량 JSON은 SW Cache에 중복 저장하지 않음.
  // IndexedDB가 담당.
  if (/\.json$/i.test(url.pathname)) {

    // version.json만 최신 확인을 위해 network-first
    if (url.pathname.endsWith('/version.json')) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(request, {
            cache: 'no-store'
          });

          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(request, fresh.clone());
            return fresh;
          }

          return (
            await caches.match(request)
          ) || fresh;

        } catch (_) {
          return (
            await caches.match(request)
          ) || Response.error();
        }
      })());
    }

    return;
  }

  // manifest / icon 등은 캐시 우선.
  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) return cached;

    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, fresh.clone());
    }

    return fresh;
  })());
});
