const CACHE_PREFIX = "hk-cinema-shell-";
const CACHE_NAME = `${CACHE_PREFIX}9c3-1`;
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("./index.html", self.registration.scope).href;
const ROOT_URL = new URL("./", self.registration.scope).href;

function isSameOriginStatic(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(SCOPE_URL.pathname)) return false;
  return ["script", "style", "font", "image", "manifest"].includes(request.destination);
}

async function discoverShellAssets() {
  const response = await fetch(INDEX_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`index HTTP ${response.status}`);
  const html = await response.clone().text();
  const assets = new Set([ROOT_URL, INDEX_URL, new URL("./manifest.json", self.registration.scope).href]);
  const pattern = /(?:src|href)=["'](\.\/[^"'#]+)["']/g;
  for (const match of html.matchAll(pattern)) {
    const url = new URL(match[1], self.registration.scope);
    if (url.origin === self.location.origin && url.pathname.startsWith(SCOPE_URL.pathname)) assets.add(url.href);
  }
  return { response, assets: [...assets] };
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const { response, assets } = await discoverShellAssets();
  await cache.put(INDEX_URL, response.clone());
  await cache.put(ROOT_URL, response.clone());
  await Promise.allSettled(assets.map(async url => {
    if (url === INDEX_URL || url === ROOT_URL) return;
    const asset = await fetch(url, { cache: "no-store" });
    if (asset.ok) await cache.put(url, asset);
  }));
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(INDEX_URL)) ||
      (await cache.match(ROOT_URL)) ||
      Promise.reject(error);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  return network;
}

self.addEventListener("install", event => {
  // Precache the new shell, but do not interrupt an already-open app session.
  // pwa-runtime.js explicitly asks a waiting worker to activate after the user accepts the update.
  event.waitUntil(precacheShell());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) {
    // Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache.
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isSameOriginStatic(request)) event.respondWith(staleWhileRevalidate(request));
});
