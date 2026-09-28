const CACHE_VERSION = 'v6';
const CACHE_PREFIX = 'smart-aula';
const PRECACHE = `${CACHE_PREFIX}-precache-${CACHE_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/saved.html',
  '/offline.html',
  '/manifest.json',
  '/css/style.css',
  '/css/pwa.css',
  '/js/saved.js',
  '/js/pwa.js',
  '/assets/icons/logo-smart-aula.svg',
  '/assets/icons/favicon.svg',
  '/assets/icons/pwa-192.png',
  '/assets/icons/pwa-512.png',
  '/assets/icons/pwa-maskable-512.png',
  '/assets/icons/apple-touch-icon.png'
];

const CACHEABLE_PAGES = new Set([
  '/',
  '/index.html',
  '/categories.html',
  '/dashboard.html',
  '/collections.html',
  '/saved.html'
]);

const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font']);

function isCacheableResponse(response) {
  return response && response.ok && response.type === 'basic';
}

function isSensitiveRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return true;
  if (request.headers.has('authorization') || request.headers.has('apikey')) return true;

  return url.pathname === '/sw.js'
    || url.pathname === '/js/config.js'
    || url.pathname.startsWith('/.netlify/')
    || url.pathname.startsWith('/api/');
}

async function handleNavigation(event) {
  const request = event.request;
  const url = new URL(request.url);

  try {
    const preload = await event.preloadResponse;
    const response = preload || await fetch(request);

    if (isCacheableResponse(response) && CACHEABLE_PAGES.has(url.pathname)) {
      const cache = await caches.open(RUNTIME);
      await cache.put(url.pathname, response.clone());
    }

    return response;
  } catch (error) {
    const cache = await caches.open(RUNTIME);
    const cachedPage = await cache.match(url.pathname)
      || await caches.match(url.pathname)
      || await caches.match('/offline.html');

    return cachedPage || Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);

  const networkUpdate = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkUpdate);
    return cached;
  }

  return await networkUpdate || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && ![PRECACHE, RUNTIME].includes(name))
        .map((name) => caches.delete(name))
    );

    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isSensitiveRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_PWA_CACHES') {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(`${CACHE_PREFIX}-`))
          .map((name) => caches.delete(name))
      ))
    );
  }
});
