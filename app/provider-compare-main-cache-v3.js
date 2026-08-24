(() => {
  const DEFAULT_TTL_MS = 60 * 1000;
  const PROVIDER_TTL_OVERRIDES = Object.freeze({ mcl: 90 * 1000 });
  const MAX_ENTRIES = 48;
  const sharedCore = window.HKCinemaProviderSharedCore || null;

  function providerIds() {
    const shared = sharedCore?.providerIds?.();
    if (Array.isArray(shared)) return shared;
    return (window.HKCinemaProviderRegistry?.providers || [])
      .map(provider => String(provider?.id || "").trim().toLowerCase())
      .filter(Boolean);
  }

  const PROVIDERS = Object.freeze(providerIds());
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

  function clear() {
    Object.values(caches).forEach(cache => cache.clear());
  }

  function clearProvider(provider) {
    const cache = cacheForProvider(provider);
    if (!cache) return false;
    cache.clear();
    return true;
  }

  function cacheKey(provider, movieId, selectedDate) {
    const value = String(movieId || "");
    const prefix = `${provider}:`;
    const id = value.startsWith(prefix) ? value.slice(prefix.length) : value;
    return `${provider}:${id}:${selectedDate || "initial"}`;
  }

  function rememberWorkerShows(provider, movieId, requestedDate, payload) {
    const cache = cacheForProvider(provider);
    if (!cache || payload?.ok !== true || !payload?.data || typeof payload.data !== "object") return false;
    write(cache, cacheKey(provider, movieId, requestedDate), payload, ttlForProvider(provider));
    if (!requestedDate) {
      const selectedDate = normalizedDate(payload.data.selectedDate);
      if (selectedDate) write(cache, cacheKey(provider, movieId, selectedDate), payload, ttlForProvider(provider));
    }
    return true;
  }

  async function getWorkerShows(provider, movieId, selectedDate = null, options = {}) {
    const key = registeredProvider(provider);
    const value = String(movieId || "");
    const prefix = `${key}:`;
    const id = value.startsWith(prefix) ? value.slice(prefix.length) : value;
    const signal = options?.signal || null;
    if (!key || !id) throw new Error("Comparison provider or movie id is invalid");
    if (signal?.aborted) throw abortError();

    const cache = cacheForProvider(key);
    const cached = read(cache, cacheKey(key, id, selectedDate));
    if (cached) return cached;

    const client = window.HKCinemaApiClient;
    if (!client?.get) throw new Error("HKCinemaApiClient is unavailable");
    const payload = await client.get(
      `/api/${key}/movies/${encodeURIComponent(id)}/shows`,
      { query: { date: selectedDate }, signal, timeoutMs: options?.timeoutMs }
    );
    if (signal?.aborted) throw abortError();
    rememberWorkerShows(key, id, selectedDate, payload);
    return payload;
  }

  function mclKey(movieSetId, selectedDate) {
    const id = String(movieSetId || "").replace(/^mcl:/, "");
    return `mcl:${id}:${selectedDate || "initial"}`;
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
      if (cached) return cached;
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
    if (!key || signal?.aborted) {
      if (signal?.aborted) throw abortError();
      return false;
    }
    if (read(cacheForProvider(key), cacheKey(key, movieId, selectedDate))) return true;
    await getWorkerShows(key, movieId, selectedDate, { signal });
    return Boolean(read(cacheForProvider(key), cacheKey(key, movieId, selectedDate)));
  }

  async function prefetchMCL(movieSetId, selectedDate, signal = null) {
    if (!installMCLCache()) return false;
    if (signal?.aborted) throw abortError();
    const key = mclKey(movieSetId, selectedDate);
    if (read(cacheForProvider("mcl"), key)) return true;
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    const data = await provider.getTicketing(movieSetId, selectedDate, { signal });
    return Boolean(data && read(cacheForProvider("mcl"), key));
  }

  function prefetchProvider(provider, movieId, selectedDate, signal = null) {
    const key = registeredProvider(provider);
    if (!key) return Promise.resolve(false);
    return key === "mcl"
      ? prefetchMCL(movieId, selectedDate, signal)
      : prefetchWorker(key, movieId, selectedDate, signal);
  }

  if (!installMCLCache()) {
    window.addEventListener("DOMContentLoaded", installMCLCache, { once: true });
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("[data-provider-compare-retry]") || event.target.closest?.("#refreshButton")) {
      clear();
    }
  }, true);

  window.HKCinemaProviderCompareMainCache = Object.freeze({
    version: "c5-1",
    owner: "showtimes",
    clear,
    clearProvider,
    getWorkerShows,
    prefetchProvider,
    getStats() {
      Object.values(caches).forEach(prune);
      return {
        owner: window.HKCinemaApiClient?.cacheOwners?.showtimes || "provider-compare-main-cache",
        providers: Object.fromEntries(PROVIDERS.map(provider => [provider, {
          entries: caches[provider]?.size || 0,
          ttlMs: ttlForProvider(provider)
        }]))
      };
    }
  });
})();
