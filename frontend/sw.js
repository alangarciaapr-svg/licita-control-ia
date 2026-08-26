const CACHE_NAME = "licita-control-v10";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./operations.js", "./view-utils.js", "./manifest.webmanifest", "./og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("licita-control-") && key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only cache the app shell, never health/API responses or third-party requests.
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.search || !APP_SHELL.some((path) => new URL(path, self.registration.scope).href === url.href)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || new Response("Recurso no disponible sin conexión.", { status: 503 })),
  );
});
