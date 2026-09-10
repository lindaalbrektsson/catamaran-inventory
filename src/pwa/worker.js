/* Built into public/sw.js. Cache only the explicit, public allowlist below. */
const CACHE = 'coral-public-__VERSION__';
// Activated only after the user explicitly chooses Update; never during a form.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
const STATIC_PATHS = new Set([
  '/offline.html',
  '/offline.js',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-icon.png',
  '/favicon.png',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Omit cookies even when preloading public files from a signed-in browser.
      for (const path of STATIC_PATHS) {
        const response = await fetch(new Request(path, { credentials: 'omit', cache: 'reload' }));
        if (!response.ok || response.redirected) throw new Error('STATIC_PRECACHE_FAILED');
        await cache.put(path, response);
      }
    })(),
  );
  // Do not skipWaiting: never replace a worker/reload midway through a stock form.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('coral-public-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function navigate(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    // HTML is NEVER cached, including login, errors and redirects.
    return await fetch(request, { cache: 'no-store', signal: controller.signal });
  } catch {
    const response = await (await caches.open(CACHE)).match('/offline.html');
    if (!response) return Response.error();
    return new Response(await response.text(), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never intercept cross-origin Supabase traffic or any mutation method.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // RSC payloads can contain private records, even when requested via GET.
  if (
    request.headers.has('RSC') ||
    request.headers.has('Next-Action') ||
    request.headers.get('Accept')?.includes('text/x-component') ||
    url.searchParams.has('_rsc')
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (STATIC_PATHS.has(url.pathname) && !url.search) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(url.pathname)) ?? fetch(request, { credentials: 'omit' });
      })(),
    );
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  // Compiled JS/CSS/fonts use normal content-hashed HTTP caching, not Cache Storage.
  // All other same-origin GETs (including APIs/prefetches) remain network-only.
  event.respondWith(
    fetch(request, url.pathname.startsWith('/_next/static/') ? {} : { cache: 'no-store' }),
  );
});
