const SHELL_CACHE = 'webviewer-shell-v875';
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

    // 한 파일 실패 때문에 SW 설치 전체가 실패하지 않도록 한다.
    await Promise.allSettled(
      SHELL_FILES.map(file =>
        cache.add(new Request(file, { cache: 'reload' }))
      )
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== SHELL_CACHE)
        .map(key => caches.delete(key))
    );

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

  if (!fresh || !fresh.ok) {
    throw new Error(
      'index.html HTTP ' + (fresh?.status || 0)
    );
  }

  const cache = await caches.open(SHELL_CACHE);
  await cache.put(APP_PAGE, fresh.clone());

  return fresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 사이트 요청은 SW가 건드리지 않는다.
  if (url.origin !== self.location.origin) return;

  const appUrl =
    new URL(APP_PAGE, self.registration.scope);

  const legacyUrl =
    new URL(LEGACY_PAGE, self.registration.scope);

  /*
   * 페이지 이동
   *
   * index.html:
   *   항상 최신 네트워크 우선
   *
   * mobile.html:
   *   예전 PWA 호환을 위해 index.html로 연결
   *
   * indextest.html 등:
   *   요청한 HTML 자체를 그대로 연다.
   */
  if (request.mode === 'navigate') {

    // index.html
    if (url.pathname === appUrl.pathname) {
      event.respondWith((async () => {
        try {
          return await fetchFreshAppPage();
        } catch (_) {
          return (
            (await caches.match(APP_PAGE)) ||
            Response.error()
          );
        }
      })());

      return;
    }

    // 예전 mobile.html → index.html
    if (url.pathname === legacyUrl.pathname) {
      event.respondWith((async () => {
        try {
          return await fetchFreshAppPage();
        } catch (_) {
          return (
            (await caches.match(APP_PAGE)) ||
            (await caches.match(LEGACY_PAGE)) ||
            Response.error()
          );
        }
      })());

      return;
    }

    // indextest.html 등 다른 HTML
    // 반드시 요청한 페이지 자체를 불러온다.
    event.respondWith((async () => {
      try {
        return await fetch(
          new Request(request, {
            cache: 'no-store'
          })
        );
      } catch (_) {
        return (
          (await caches.match(request)) ||
          Response.error()
        );
      }
    })());

    return;
  }

  // 대용량 JSON은 SW Cache에 중복 저장하지 않는다.
  if (/\.json$/i.test(url.pathname)) {

    // version.json만 네트워크 우선 + 캐시 fallback
    if (url.pathname.endsWith('/version.json')) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(
            new Request(request, {
              cache: 'no-store'
            })
          );

          if (fresh && fresh.ok) {
            const cache =
              await caches.open(SHELL_CACHE);

            await cache.put(
              request,
              fresh.clone()
            );
          }

          return fresh;

        } catch (_) {
          return (
            (await caches.match(request)) ||
            Response.error()
          );
        }
      })());
    }

    // 나머지 JSON은 브라우저가 직접 요청
    return;
  }

  // manifest/icon 등 작은 앱 셸은 캐시 우선.
  event.respondWith((async () => {
    const cached =
      await caches.match(request);

    if (cached) return cached;

    try {
      const fresh =
        await fetch(request);

      if (fresh && fresh.ok) {
        const cache =
          await caches.open(SHELL_CACHE);

        await cache.put(
          request,
          fresh.clone()
        );
      }

      return fresh;

    } catch (err) {
      console.warn(
        '[SW] fetch failed:',
        request.url
      );

      return new Response('', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  })());
});