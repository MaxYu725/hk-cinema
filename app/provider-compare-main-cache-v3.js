(() => {
  const DEFAULT_TTL_MS = 60 * 1000;
  const PROVIDER_TTL_OVERRIDES = Object.freeze({ mcl: 90 * 1000 });
  const MAX_ENTRIES = 48;
  const WORKER_ORIGIN = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const sharedCore = window.HKCinemaProviderSharedCore || null;

  function providerIds() {
    const shared = sharedCore?.providerIds?.();
    if (Array.isArray(shared)) return shared;
    return (window.HKCinemaProviderRegistry?.providers || [])
      .map(provider => String(provider?.id || "").trim().toLowerCase())
      .filter(Boolean);
  }

  const PROVIDERS = Object.freeze(providerIds());
  const nativeFetch = window.fetch.bind(window);
  const caches = Object.fromEntries(PROVIDERS.map(provider => [provider, new Map()]));

  function registeredProvider(provider) {
    const key = String(provider || "").trim().toLowerCase();
    if (!key) return null;
    return sharedCore?.registeredProviderId?.(key) || (PROVIDERS.includes(key) ? key : null);
  }

  function ttlForProvider(provider) {
    return PROVIDER_TTL_OVERRIDES[provider] || DEFAULT_TTL_MS;
  }

  function cacheForProvider(provider) {
    const key = registeredProvider(provider);
    return key ? caches[key] || null : null;
  }

  function abortError() {
    const error = new Error("Comparison request cancelled");
    error.name = "AbortError";
    return error;
  }

  function normalizedDate(value) {
    const text = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function prune(cache) {
    if (!cache) return;
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (!entry || entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  function read(cache, key) {
    if (!cache) return null;
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  function write(cache, key, value, ttlMs) {
    if (!cache) return false;
    cache.delete(key);
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    prune(cache);
    return true;
  }

  function deleteIfCurrent(cache, key, value) {
    if (!cache) return;
    const current = cache.get(key);
    if (current?.value === value) cache.delete(key);
  }

  function clear() {
    Object.values(caches).forEach(cache => cache.clear());
  }

  function clearProvider(provider) {
    const cache = cacheForProvider(provider);
    if (!cache) return false;
    cache.clear();
    return true;
  }

  function requestDetails(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const rawUrl = request?.url || String(input || "");
    let url = null;
    try {
      url = new URL(rawUrl, window.location.href);
    } catch {
      return null;
    }
    return {
      url,
      method: String(init.method || request?.method || "GET").toUpperCase(),
      signal: init.signal || request?.signal || null
    };
  }

  const CACHE_ADAPTERS = Object.freeze({
    mcl: Object.freeze({
      workerShows: false,
      install: installMCLCache,
      prefetch(provider, movieId, selectedDate, signal) {
        return prefetchMCL(movieId, selectedDate, signal);
      }
    })
  });

  function cacheAdapter(provider) {
    const runtime = window.HKCinemaProviders?.[provider]?.comparisonCache || null;
    const builtIn = CACHE_ADAPTERS[provider] || null;
    return builtIn || runtime
      ? { ...(builtIn || {}), ...(runtime || {}) }
      : null;
  }

  function workerShowsProvider(details) {
    if (!details || details.method !== "GET" || details.url.origin !== WORKER_ORIGIN) return null;
    const match = details.url.pathname.match(/^\/api\/([^/]+)\/movies\/[^/]+\/shows$/);
    if (!match) return null;
    const provider = registeredProvider(decodeURIComponent(match[1]));
    if (!provider || cacheAdapter(provider)?.workerShows === false) return null;
    return cacheForProvider(provider) ? provider : null;
  }

  function responseFromSnapshot(snapshot) {
    return new Response(snapshot.body, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers
    });
  }

  function workerSnapshotPayload(snapshot) {
    try {
      return JSON.parse(snapshot.body);
    } catch {
      return null;
    }
  }

  function isCacheableWorkerSnapshot(snapshot) {
    const payload = workerSnapshotPayload(snapshot);
    return Boolean(payload?.ok === true && payload?.data && typeof payload.data === "object");
  }

  function aliasWorkerSelectedDate(provider, details, snapshotPromise) {
    if (details.url.searchParams.has("date")) return;
    snapshotPromise.then(snapshot => {
      if (!isCacheableWorkerSnapshot(snapshot)) return;
      const payload = workerSnapshotPayload(snapshot);
      const selectedDate = normalizedDate(payload?.data?.selectedDate);
      if (!selectedDate) return;
      const aliasUrl = new URL(details.url.toString());
      aliasUrl.searchParams.set("date", selectedDate);
      write(cacheForProvider(provider), aliasUrl.toString(), snapshotPromise, ttlForProvider(provider));
    }).catch(() => {});
  }

  window.fetch = async function cachedComparisonFetch(input, init = {}) {
    const details = requestDetails(input, init);
    const provider = workerShowsProvider(details);
    if (!provider) return nativeFetch(input, init);
    if (details.signal?.aborted) throw abortError();

    const cache = cacheForProvider(provider);
    const key = details.url.toString();
    const cached = read(cache, key);
    if (cached) {
      const snapshot = await cached;
      if (details.signal?.aborted) throw abortError();
      return responseFromSnapshot(snapshot);
    }

    const response = await nativeFetch(input, init);
    if (response.ok) {
      const snapshotPromise = response.clone().text().then(body => ({
        body,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries())
      }));
      write(cache, key, snapshotPromise, ttlForProvider(provider));
      aliasWorkerSelectedDate(provider, details, snapshotPromise);
      snapshotPromise.then(snapshot => {
        if (!isCacheableWorkerSnapshot(snapshot)) deleteIfCurrent(cache, key, snapshotPromise);
      }).catch(() => {
        deleteIfCurrent(cache, key, snapshotPromise);
      });
    }
    return response;
  };

  function mclKey(movieSetId, selectedDate) {
    const id = String(movieSetId || "").replace(/^mcl:/, "");
    return `${id}:${selectedDate || "initial"}`;
  }

  function rememberMCL(movieSetId, selectedDate, data) {
    if (!data || typeof data !== "object") return false;
    const cache = cacheForProvider("mcl");
    if (!cache) return false;
    write(cache, mclKey(movieSetId, selectedDate), data, ttlForProvider("mcl"));
    if (!selectedDate && data.metadataComplete === true) {
      const resolvedDate = normalizedDate(data.selectedDate);
      if (resolvedDate) write(cache, mclKey(movieSetId, resolvedDate), data, ttlForProvider("mcl"));
    }
    return true;
  }

  function workerUrl(provider, movieId, selectedDate) {
    const key = registeredProvider(provider);
    if (!key || cacheAdapter(key)?.workerShows === false) return null;
    const id = String(movieId || "").replace(new RegExp(`^${key}:`), "");
    if (!id) return null;
    const url = new URL(`/api/${key}/movies/${encodeURIComponent(id)}/shows`, WORKER_ORIGIN);
    if (selectedDate) url.searchParams.set("date", selectedDate);
    return url.toString();
  }

  function installMCLCache() {
    if (!cacheForProvider("mcl")) return false;
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    if (provider.mainRequestCacheInstalledV3) return true;

    const originalGetTicketing = provider.getTicketing.bind(provider);
    provider.getTicketing = async (movieSetId, selectedDate = null, options = {}) => {
      const signal = options?.signal || null;
      if (signal?.aborted) throw abortError();

      const key = mclKey(movieSetId, selectedDate);
      const cached = read(cacheForProvider("mcl"), key);
      if (cached) {
        if (signal?.aborted) throw abortError();
        return cached;
      }

      const data = await originalGetTicketing(movieSetId, selectedDate, options);
      if (signal?.aborted) throw abortError();
      rememberMCL(movieSetId, selectedDate, data);
      return data;
    };
    provider.mainRequestCacheInstalledV3 = true;
    provider.mainRequestCacheTtlMs = ttlForProvider("mcl");
    return true;
  }

  async function prefetchWorker(provider, movieId, selectedDate, signal = null) {
    const key = registeredProvider(provider);
    const cache = cacheForProvider(key);
    const url = workerUrl(key, movieId, selectedDate);
    if (!key || !cache || !url) return false;
    if (signal?.aborted) throw abortError();
    if (read(cache, url)) return true;
    const response = await window.fetch(url, { cache: "no-store", signal });
    if (!response.ok) return false;
    await response.text();
    return Boolean(read(cache, url));
  }

  async function prefetchMCL(movieSetId, selectedDate, signal = null) {
    if (!installMCLCache()) return false;
    if (signal?.aborted) throw abortError();
    const cache = cacheForProvider("mcl");
    const key = mclKey(movieSetId, selectedDate);
    if (read(cache, key)) return true;
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    const data = await provider.getTicketing(movieSetId, selectedDate, { signal });
    return Boolean(data && read(cache, key));
  }

  function prefetchProvider(provider, movieId, selectedDate, signal = null) {
    const key = registeredProvider(provider);
    if (!key) return Promise.resolve(false);
    const handler = cacheAdapter(key)?.prefetch || prefetchWorker;
    return handler(key, movieId, selectedDate, signal);
  }

  for (const provider of PROVIDERS) {
    const install = cacheAdapter(provider)?.install;
    if (typeof install !== "function" || install()) continue;
    window.addEventListener("DOMContentLoaded", install, { once: true });
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("[data-provider-compare-retry]") || event.target.closest?.("#refreshButton")) {
      clear();
    }
  }, true);

  window.HKCinemaProviderCompareMainCache = {
    version: "m7r7-1",
    clear,
    clearProvider,
    prefetchProvider,
    getStats() {
      Object.values(caches).forEach(prune);
      return {
        providers: Object.fromEntries(PROVIDERS.map(provider => [provider, {
          entries: caches[provider]?.size || 0,
          ttlMs: ttlForProvider(provider)
        }]))
      };
    }
  };
})();