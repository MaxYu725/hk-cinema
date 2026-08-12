(() => {
  const TTL = {
    broadway: 60 * 1000,
    mcl: 90 * 1000,
    emperor: 60 * 1000
  };
  const MAX_ENTRIES = 48;
  const WORKER_ORIGIN = "https://hk-cinema-api.max-yu-jp.workers.dev";

  const nativeFetch = window.fetch.bind(window);
  const caches = {
    broadway: new Map(),
    mcl: new Map(),
    emperor: new Map()
  };

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
    cache.delete(key);
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    prune(cache);
  }

  function clear() {
    Object.values(caches).forEach(cache => cache.clear());
  }

  function clearProvider(provider) {
    const cache = caches[provider];
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

  function workerShowsProvider(details) {
    if (!details || details.method !== "GET" || details.url.origin !== WORKER_ORIGIN) return null;
    if (/^\/api\/broadway\/movies\/[^/]+\/shows$/.test(details.url.pathname)) return "broadway";
    if (/^\/api\/emperor\/movies\/[^/]+\/shows$/.test(details.url.pathname)) return "emperor";
    return null;
  }

  function responseFromSnapshot(snapshot) {
    return new Response(snapshot.body, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers
    });
  }

  function aliasWorkerSelectedDate(provider, details, snapshotPromise) {
    if (details.url.searchParams.has("date")) return;
    snapshotPromise.then(snapshot => {
      let payload = null;
      try {
        payload = JSON.parse(snapshot.body);
      } catch {
        return;
      }
      const selectedDate = normalizedDate(payload?.data?.selectedDate);
      if (!selectedDate) return;
      const aliasUrl = new URL(details.url.toString());
      aliasUrl.searchParams.set("date", selectedDate);
      write(caches[provider], aliasUrl.toString(), snapshotPromise, TTL[provider]);
    }).catch(() => {});
  }

  window.fetch = async function cachedComparisonFetch(input, init = {}) {
    const details = requestDetails(input, init);
    const provider = workerShowsProvider(details);
    if (!provider) return nativeFetch(input, init);
    if (details.signal?.aborted) throw abortError();

    const cache = caches[provider];
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
      write(cache, key, snapshotPromise, TTL[provider]);
      aliasWorkerSelectedDate(provider, details, snapshotPromise);
      snapshotPromise.catch(() => {
        const current = cache.get(key);
        if (current?.value === snapshotPromise) cache.delete(key);
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
    write(caches.mcl, mclKey(movieSetId, selectedDate), data, TTL.mcl);
    if (!selectedDate) {
      const resolvedDate = normalizedDate(data.selectedDate);
      if (resolvedDate) {
        write(caches.mcl, mclKey(movieSetId, resolvedDate), data, TTL.mcl);
      }
    }
    return true;
  }

  function workerUrl(provider, movieId, selectedDate) {
    const id = String(movieId || "").replace(new RegExp(`^${provider}:`), "");
    if (!id) return null;
    const url = new URL(`/api/${provider}/movies/${encodeURIComponent(id)}/shows`, WORKER_ORIGIN);
    if (selectedDate) url.searchParams.set("date", selectedDate);
    return url.toString();
  }

  function installMCLCache() {
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    if (provider.mainRequestCacheInstalledV3) return true;

    const originalGetTicketing = provider.getTicketing.bind(provider);
    provider.getTicketing = async (movieSetId, selectedDate = null, options = {}) => {
      const signal = options?.signal || null;
      if (signal?.aborted) throw abortError();

      const key = mclKey(movieSetId, selectedDate);
      const cached = read(caches.mcl, key);
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
    provider.mainRequestCacheTtlMs = TTL.mcl;
    return true;
  }

  async function prefetchWorker(provider, movieId, selectedDate, signal = null) {
    const url = workerUrl(provider, movieId, selectedDate);
    if (!url) return false;
    if (signal?.aborted) throw abortError();
    const cache = caches[provider];
    if (read(cache, url)) return true;
    const response = await window.fetch(url, { cache: "no-store", signal });
    if (!response.ok) return false;
    await response.text();
    return Boolean(read(cache, url));
  }

  async function prefetchMCL(movieSetId, selectedDate, signal = null) {
    if (!installMCLCache()) return false;
    if (signal?.aborted) throw abortError();
    const key = mclKey(movieSetId, selectedDate);
    if (read(caches.mcl, key)) return true;
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    const data = await provider.getTicketing(movieSetId, selectedDate, { signal });
    return Boolean(data && read(caches.mcl, key));
  }

  if (!installMCLCache()) {
    window.addEventListener("DOMContentLoaded", installMCLCache, { once: true });
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("[data-provider-compare-retry]") || event.target.closest?.("#refreshButton")) {
      clear();
    }
  }, true);

  window.HKCinemaProviderCompareMainCache = {
    clear,
    clearProvider,
    prefetchBroadway(movieId, selectedDate, signal = null) {
      return prefetchWorker("broadway", movieId, selectedDate, signal);
    },
    prefetchEmperor(movieId, selectedDate, signal = null) {
      return prefetchWorker("emperor", movieId, selectedDate, signal);
    },
    prefetchMCL,
    getStats() {
      Object.values(caches).forEach(prune);
      return {
        broadwayEntries: caches.broadway.size,
        mclEntries: caches.mcl.size,
        emperorEntries: caches.emperor.size,
        broadwayTtlMs: TTL.broadway,
        mclTtlMs: TTL.mcl,
        emperorTtlMs: TTL.emperor
      };
    }
  };
})();