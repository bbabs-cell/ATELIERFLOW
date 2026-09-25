/*
 * atelierflow — service worker (Prompt 12, PWA fiabilisée).
 *
 * Stratégies (spécification testée dans src/domain/pwa/cachePolicy.ts) :
 *   - navigation GET même-origine  -> precache (network-first, fallback /offline)
 *   - assets statiques              -> stale-while-revalidate
 *   - API / auth / sync / fichiers  -> network-only, JAMAIS mis en cache
 *
 * Mise à jour contrôlée : le nouveau worker reste en attente ; le passage à
 * l'activation ne se fait qu'après validation utilisateur via le message
 * "SKIP_WAITING" envoyé par le client.
 */
self.addEventListener("install", (event) => {
  const SW_VERSION = "v1";
  const SHELL_URLS = [
    "/",
    "/offline",
    "/pwa/manifest.webmanifest",
    "/pwa/icon.svg",
    "/pwa/maskable.svg",
  ];
  event.waitUntil(
    caches
      .open(`atelierflow-shell-${SW_VERSION}`)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                !name.startsWith("atelierflow-shell-v1") &&
                !name.startsWith("atelierflow-runtime-v1"),
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const PRIVATE_PREFIXES = ["/api/", "/auth/", "/sync", "/invitation", "/reset-password"];
const ASSET_PATTERN = /\.(?:js|mjs|css|woff2?|ttf|eot|svg|png|jpe?g|webp|avif|gif|ico|json|webmanifest)$/i;
const NEXT_STATIC_PREFIX = "/_next/static/";

function isSameOrigin(url) {
  try {
    const current = new URL(self.location.origin);
    const target = new URL(url, self.location.origin);
    return target.origin === current.origin;
  } catch {
    return false;
  }
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith(NEXT_STATIC_PREFIX) || ASSET_PATTERN.test(pathname)
  );
}

function isPrivate(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function precacheStrategy(request) {
  const cache = await caches.open("atelierflow-shell-v1");
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("/offline");
    if (fallback) return fallback;
    return new Response("Hors ligne", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open("atelierflow-runtime-v1");
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (cached) return cached;
    throw new Error("NETWORK_UNAVAILABLE");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (!isSameOrigin(request.url)) return;

  const pathname = new URL(request.url, self.location.origin).pathname;
  const isNavigate = request.mode === "navigate";

  if (isNavigate || isStaticAsset(pathname)) {
    event.respondWith(
      isNavigate ? precacheStrategy(request) : staleWhileRevalidate(request),
    );
    return;
  }

  if (isPrivate(pathname)) {
    return;
  }

  event.respondWith(fetch(request));
});