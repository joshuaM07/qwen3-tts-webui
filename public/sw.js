// Qwen3-TTS Devotionals — Service Worker
// Strategy: network-first for everything, fall back to cache when offline.

const CACHE_VERSION = "v1";
const CACHE_NAME = `qwen3-tts-devotionals-${CACHE_VERSION}`;

// Shell files to precache on install. Audio blobs are NOT cached — they're
// large and should be regenerated on demand.
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs.
  if (request.method !== "GET") return;

  // Don't intercept the Modal API call — let it go straight to the network
  // so synthesis results aren't cached weirdly.
  const url = new URL(request.url);
  if (url.hostname.endsWith(".modal.run")) return;

  // Skip non-http(s) schemes (chrome-extension://, etc.)
  if (!url.protocol.startsWith("http")) return;

  // Network-first, cache fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for next time.
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
