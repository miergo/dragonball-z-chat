const STATIC_CACHE = "dbz-static-v1";
const MODEL_CACHE = "dbz-models-v1";

self.addEventListener("install", (event) => {
  const base = self.registration.scope;
  const staticAssets = [
    base,
    `${base}index.html`,
    `${base}sql-wasm.wasm`,
    `${base}rag-index.json`,
  ];
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(staticAssets))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== MODEL_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const scopePath = new URL(self.registration.scope).pathname;

  if (url.origin === location.origin) {
    if (
      url.pathname.startsWith(`${scopePath}models/`) ||
      url.hostname.includes("huggingface")
    ) {
      event.respondWith(networkFirstModel(event.request));
      return;
    }
    if (url.pathname.endsWith(".wasm")) {
      event.respondWith(cacheFirst(event.request, STATIC_CACHE));
      return;
    }
  }

  event.respondWith(cacheFirst(event.request, STATIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirstModel(request) {
  const cache = await caches.open(MODEL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("Model unavailable offline", { status: 503 });
  }
}
