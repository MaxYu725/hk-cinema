const CACHE_PREFIX = "hk-cinema-shell-";
const SHELL_MANIFEST = /* c6-shell-manifest:start */ Object.freeze({
  version: "development",
  assets: Object.freeze(["./", "./index.html", "./manifest.json"])
}) /* c6-shell-manifest:end */;
const CACHE_NAME = `${CACHE_PREFIX}${SHELL_MANIFEST.version}`;
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("./index.html", self.registration.scope).href;
const ROOT_URL = new URL("./", self.registration.scope).href;
const SHELL_ASSETS = Object.freeze(SHELL_MANIFEST.assets.map(asset =>
  new URL(asset, self.registration.scope).href
));
const SHELL_ASSET_URLS = new Set(SHELL_ASSETS);

function isDeclaredShellAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  url.hash = "";
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(SCOPE_URL.pathname)) return false;
  return SHELL_ASSET_URLS.has(url.href);
}

async function precacheShell() {
  const snapshots = await Promise.all(SHELL_ASSETS.map(async url => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`shell asset HTTP ${response.status}: ${url}`);
    return { url, response };
  }));

  await caches.delete(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  try {
    await Promise.all(snapshots.map(({ url, response }) => cache.put(url, response)));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    return await fetch(request, { cache: "no-store" });
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

  if (isDeclaredShellAsset(request)) event.respondWith(staleWhileRevalidate(request));
});
