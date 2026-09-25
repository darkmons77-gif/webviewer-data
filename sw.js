const SHELL_CACHE = 'webviewer-shell-v1';
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

  // 페이지 이동: 온라인이면 최신 mobile.html을 받고, 실패하면 설치된 앱 셸 사용.
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

  // DB 대용량 JSON은 Service Worker에 중복 저장하지 않는다.
  // 배우/작품 데이터의 영구 캐시는 mobile.html의 IndexedDB가 담당한다.
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

  // manifest/icon/app shell: 캐시 우선, 없으면 네트워크.
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
