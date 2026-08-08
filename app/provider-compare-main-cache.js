(() => {
  const BROADWAY_TTL_MS = 60 * 1000;
  const MCL_TTL_MS = 90 * 1000;
  const MAX_ENTRIES = 48;
  const WORKER_ORIGIN = "https://hk-cinema-api.max-yu-jp.workers.dev";

  const nativeFetch = window.fetch.bind(window);
  const broadwayCache = new Map();
  const mclCache = new Map();

  function abortError() {
    const error = new Error("Comparison request cancelled");
    error.name = "AbortError";
    return error;
  }

  function prune(cache) {
    const now = Date.now();

    for (const [key, entry] of cache) {
      if (!entry || entry.expiresAt <= now) {
        cache.delete(key);
      }
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
    cache.set(key, {
      expiresAt: Date.now() + ttlMs,
      value
    });
    prune(cache);
  }

  function clear() {
    broadwayCache.clear();
    mclCache.clear();
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

  function isBroadwayShowsRequest(details) {
    return Boolean(
      details &&
      details.method === "GET" &&
      details.url.origin === WORKER_ORIGIN &&
      /^\/api\/broadway\/movies\/[^/]+\/shows$/.test(details.url.pathname)
    );
  }

  function responseFromSnapshot(snapshot) {
    return new Response(snapshot.body, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers
    });
  }

  window.fetch = async function cachedComparisonFetch(input, init = {}) {
    const details = requestDetails(input, init);

    if (!isBroadwayShowsRequest(details)) {
      return nativeFetch(input, init);
    }

    if (details.signal?.aborted) {
      throw abortError();
    }

    const key = details.url.toString();
    const cached = read(broadwayCache, key);

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

      write(broadwayCache, key, snapshotPromise, BROADWAY_TTL_MS);

      snapshotPromise.catch(() => {
        const current = broadwayCache.get(key);
        if (current?.value === snapshotPromise) broadwayCache.delete(key);
      });
    }

    return response;
  };

  function mclKey(movieSetId, selectedDate) {
    const id = String(movieSetId || "").replace(/^mcl:/, "");
    return `${id}:${selectedDate || "initial"}`;
  }

  function broadwayUrl(movieId, selectedDate) {
    const id = String(movieId || "").replace(/^broadway:/, "");
    if (!id) return null;

    const url = new URL(
      `/api/broadway/movies/${encodeURIComponent(id)}/shows`,
      WORKER_ORIGIN
    );
    if (selectedDate) url.searchParams.set("date", selectedDate);
    return url.toString();
  }

  function installMCLCache() {
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    if (provider.mainRequestCacheInstalled) return true;

    const originalGetTicketing = provider.getTicketing.bind(provider);

    provider.getTicketing = async (movieSetId, selectedDate = null) => {
      const key = mclKey(movieSetId, selectedDate);
      const cached = read(mclCache, key);
      if (cached) return cached;

      const data = await originalGetTicketing(movieSetId, selectedDate);
      if (data && typeof data === "object") {
        write(mclCache, key, data, MCL_TTL_MS);
      }
      return data;
    };

    provider.mainRequestCacheInstalled = true;
    provider.mainRequestCacheTtlMs = MCL_TTL_MS;
    return true;
  }

  async function prefetchBroadway(movieId, selectedDate) {
    const url = broadwayUrl(movieId, selectedDate);
    if (!url) return false;
    if (read(broadwayCache, url)) return true;

    const response = await window.fetch(url, { cache: "no-store" });
    if (!response.ok) return false;

    await response.text();
    return Boolean(read(broadwayCache, url));
  }

  async function prefetchMCL(movieSetId, selectedDate) {
    if (!installMCLCache()) return false;

    const key = mclKey(movieSetId, selectedDate);
    if (read(mclCache, key)) return true;

    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;

    const data = await provider.getTicketing(movieSetId, selectedDate);
    return Boolean(data && read(mclCache, key));
  }

  if (!installMCLCache()) {
    window.addEventListener("DOMContentLoaded", installMCLCache, { once: true });
  }

  document.addEventListener("click", event => {
    if (
      event.target.closest?.("[data-provider-compare-retry]") ||
      event.target.closest?.("#refreshButton")
    ) {
      clear();
    }
  }, true);

  window.HKCinemaProviderCompareMainCache = {
    clear,
    prefetchBroadway,
    prefetchMCL,
    getStats() {
      prune(broadwayCache);
      prune(mclCache);
      return {
        broadwayEntries: broadwayCache.size,
        mclEntries: mclCache.size,
        broadwayTtlMs: BROADWAY_TTL_MS,
        mclTtlMs: MCL_TTL_MS
      };
    }
  };
})();