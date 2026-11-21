// Service worker. BUILD_ID and PRECACHE are injected at build time by the
// jxl-pwa-precache plugin in vite.config.js (hash of every emitted file), so
// every deploy gets its own cache and no manual version bump is needed.
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = /*__PRECACHE__*/ [];
const CACHE_PREFIX = 'jxl-optimizer-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const SCOPE = self.registration.scope;
const abs = (path) => new URL(path, SCOPE).href;

self.addEventListener('install', (event) => {
  // No skipWaiting() here: the page offers the update and the user applies it
  // when no conversion is running.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE.map(async (path) => {
          // cache:'reload' bypasses the HTTP cache so a new build never
          // precaches stale files.
          const response = await fetch(new Request(abs(path), { cache: 'reload' }));
          if (!response.ok) throw new Error(`Precache failed: ${path} (${response.status})`);
          await cache.put(abs(path), response);
        }),
      );
      const index = await cache.match(abs('index.html'));
      if (index) await cache.put(SCOPE, index.clone());
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', buildId: BUILD_ID });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  if (request.mode === 'navigate') {
    // Network first so index.html can change after a deploy; the cached copy
    // is only the offline fallback. It is deliberately NOT refreshed from the
    // network: a newer index would reference assets missing from this cache.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(abs('index.html'), { cacheName: CACHE_NAME })) ?? Response.error()),
    );
    return;
  }

  // Everything else is cache-first from this build's own cache (hashed assets,
  // WASM and the app shell are all precached). `?v=` query strings are ignored.
  event.respondWith(
    caches
      .match(request, { cacheName: CACHE_NAME, ignoreSearch: true })
      .then((hit) => hit ?? fetch(request)),
  );
});
