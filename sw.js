const SHELL_CACHE = 'webviewer-shell-v806';
const APP_PAGE = './index.html';
const LEGACY_PAGE = './mobile.html';
const SHELL_FILES = [
  APP_PAGE,
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 한 파일의 일시적 실패 때문에 새 SW 설치 전체가 취소되지 않게 한다.
    await Promise.allSettled(
      SHELL_FILES.map(file => cache.add(new Request(file, { cache: 'reload' })))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchFreshAppPage() {
  const appUrl = new URL(APP_PAGE, self.registration.scope).href;
  const request = new Request(appUrl, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow'
  });
  const fresh = await fetch(request);
  if (!fresh || !fresh.ok) throw new Error('index.html HTTP ' + (fresh?.status || 0));
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(APP_PAGE, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 기존 설치앱이 아직 ./mobile.html을 시작 URL로 기억하고 있어도
  // 모든 앱 페이지 이동은 최신 ./index.html로 통일한다.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetchFreshAppPage();
      } catch (_) {
        return (await caches.match(APP_PAGE)) ||
               (await caches.match(LEGACY_PAGE)) ||
               Response.error();
      }
    })());
    return;
  }

  // 대용량 JSON은 SW Cache에 중복 저장하지 않는다.
  if (/\.json$/i.test(url.pathname)) {
    if (url.pathname.endsWith('/version.json')) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(new Request(request, { cache: 'no-store' }));
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(request, fresh.clone());
          }
          return fresh;
        } catch (_) {
          return (await caches.match(request)) || Response.error();
        }
      })());
    }
    return;
  }

  // manifest/icon 등 작은 앱 셸은 캐시 우선.
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
