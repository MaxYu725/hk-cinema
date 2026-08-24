(() => {
  const CACHE_KEY = "hkcinema:broadway-catalogue:v1";
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  async function fetchEndpoint(path) {
    const result = await window.HKCinemaApiClient?.get?.(path);
    if (!result || !Array.isArray(result.data)) throw new Error("Broadway Worker response is invalid");
    return result;
  }

  function readCacheEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return { now: null, coming: null };
      const validate = entry => {
        const savedAt = Number(entry?.savedAt);
        const ageMs = Date.now() - savedAt;
        if (!Number.isFinite(savedAt) || ageMs < 0 || ageMs > CACHE_MAX_AGE_MS) return null;
        return Array.isArray(entry?.data) ? { ...entry, ageMs } : null;
      };
      return { now: validate(parsed.now), coming: validate(parsed.coming) };
    } catch {
      return { now: null, coming: null };
    }
  }

  function writeCacheEntries(entries) {
    try {
      if (!entries.now && !entries.coming) {
        localStorage.removeItem(CACHE_KEY);
        return;
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch {
      // Storage can be unavailable in private or restricted browsing modes.
    }
  }

  function catalogueFromEntries(entries) {
    if (!entries.now && !entries.coming) return null;
    const updated = [entries.now?.updatedAt, entries.coming?.updatedAt]
      .map(value => Date.parse(value || ""))
      .filter(Number.isFinite);
    const now = entries.now?.data || [];
    const coming = entries.coming?.data || [];
    return {
      now,
      coming,
      presale: now.filter(movie => movie?.status === "presale"),
      meta: {
        provider: "broadway",
        transport: "worker-next-catalogue",
        cache: true,
        cacheAgeMs: Math.max(entries.now?.ageMs || 0, entries.coming?.ageMs || 0),
        fallbackSections: { now: Boolean(entries.now), coming: Boolean(entries.coming) },
        errors: { now: null, coming: null },
        counts: { now: now.length, coming: coming.length },
        updatedAt: updated.length ? new Date(Math.min(...updated)).toISOString() : null
      }
    };
  }

  function getCachedCatalogue() {
    return catalogueFromEntries(readCacheEntries());
  }

  async function refreshCatalogue() {
    const entries = readCacheEntries();
    const [nowResult, comingResult] = await Promise.allSettled([
      fetchEndpoint("/api/broadway/movies"),
      fetchEndpoint("/api/broadway/upcoming")
    ]);

    if (nowResult.status === "rejected" && comingResult.status === "rejected" && !entries.now && !entries.coming) {
      throw nowResult.reason || comingResult.reason || new Error("Broadway catalogue unavailable");
    }

    if (nowResult.status === "fulfilled") {
      entries.now = {
        savedAt: Date.now(),
        updatedAt: nowResult.value.meta?.updatedAt || null,
        data: nowResult.value.data
      };
    }
    if (comingResult.status === "fulfilled") {
      entries.coming = {
        savedAt: Date.now(),
        updatedAt: comingResult.value.meta?.updatedAt || null,
        data: comingResult.value.data
      };
    }
    writeCacheEntries(entries);

    const catalogue = catalogueFromEntries(entries) || { now: [], coming: [], presale: [], meta: {} };
    const fallbackSections = {
      now: nowResult.status === "rejected" && Boolean(entries.now),
      coming: comingResult.status === "rejected" && Boolean(entries.coming)
    };
    return {
      ...catalogue,
      meta: {
        ...catalogue.meta,
        cache: fallbackSections.now || fallbackSections.coming,
        partial: nowResult.status === "rejected" || comingResult.status === "rejected",
        fallbackSections,
        errors: {
          now: nowResult.status === "rejected"
            ? String(nowResult.reason?.message || nowResult.reason || "Broadway now-showing failed")
            : null,
          coming: comingResult.status === "rejected"
            ? String(comingResult.reason?.message || comingResult.reason || "Broadway upcoming failed")
            : null
        }
      }
    };
  }

  window.HKCinemaProviders = window.HKCinemaProviders || {};
  window.HKCinemaProviders.broadway = Object.freeze({
    getCatalogue: refreshCatalogue,
    refreshCatalogue,
    getCachedCatalogue,
    apiBase: window.HKCinemaApiClient?.origin || null,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  });
})();
