const STATIC_CACHE = "dbz-static-v2";
const MODEL_CACHE = "dbz-models-v1";

self.addEventListener("install", (event) => {
  const base = self.registration.scope;
  const staticAssets = [
    `${base}sql-wasm.wasm`,
    `${base}rag-index.json`,
  ];
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(staticAssets)).catch(() => undefined)
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

  if (url.origin !== location.origin) {
    if (url.hostname.includes("huggingface")) {
      event.respondWith(networkFirstModel(event.request));
    }
    return;
  }

  // Always take fresh HTML so Vite asset hashes match the current deploy.
  const isDocument =
    event.request.mode === "navigate" ||
    url.pathname === scopePath ||
    url.pathname === `${scopePath}index.html` ||
    url.pathname.endsWith("/index.html");

  if (isDocument) {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith(`${scopePath}models/`)) {
    event.respondWith(networkFirstModel(event.request));
    return;
  }

  if (url.pathname.endsWith(".wasm")) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Hashed /assets/* can be cache-first; names change every build.
  event.respondWith(cacheFirst(event.request, STATIC_CACHE));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

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
