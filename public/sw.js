// Offline play: keeps the game and every neighborhood you've visited, so it still works with no signal
// (on the train, say). Built files and textures are cached as they load; map and city data are fetched fresh
// when there's a connection and served from the cache when there isn't. Live data (/api) is never cached.
const CACHE = 'night-walker-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const fresh = async (req) => {
  // network first, falling back to the last copy
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
    return r;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    throw new Error('offline');
  }
};
const kept = async (req) => {
  // cache first: these files never change under the same name
  const hit = await caches.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
  return r;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') return e.respondWith(fresh(req));
  if (/\/assets\/|\/basis\/|\/models\/|\/voices\//.test(url.pathname)) return e.respondWith(kept(req));
  if (/\/(osm|nyc|wiki|textures)\//.test(url.pathname) || url.pathname.endsWith('.webmanifest')) return e.respondWith(fresh(req));
});
