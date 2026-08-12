(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_KEY = "hkcinema:cineart-catalogue:v1";
  const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;

  function validCatalogue(value) {
    return Boolean(
      value &&
      Array.isArray(value.now) &&
      Array.isArray(value.coming)
    );
  }

  function saveCachedCatalogue(catalogue) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        catalogue
      }));
    } catch {
      // Storage may be unavailable in private/restricted contexts.
    }
  }

  function getCachedCatalogue() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      const cached = JSON.parse(raw);
      const savedAt = Number(cached?.savedAt);
      const catalogue = cached?.catalogue;
      const ageMs = Date.now() - savedAt;

      if (
        !Number.isFinite(savedAt) ||
        !validCatalogue(catalogue) ||
        ageMs < 0 ||
        ageMs > CACHE_MAX_AGE_MS
      ) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      return {
        ...catalogue,
        meta: {
          ...(catalogue.meta || {}),
          cache: true,
          localCache: true,
          cacheSavedAt: new Date(savedAt).toISOString(),
          cacheAgeMs: ageMs
        }
      };
    } catch {
      return null;
    }
  }

  async function refreshCatalogue() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/api/cineart/catalogue`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        throw new Error(`CineArt HTTP ${response.status}`);
      }

      if (!response.ok || result?.ok !== true || !validCatalogue(result?.data)) {
        throw new Error(
          result?.error?.message || `CineArt HTTP ${response.status}`
        );
      }

      const catalogue = {
        ...result.data,
        meta: {
          ...(result.data.meta || {}),
          provider: "cineart",
          transport: "worker-next-flight",
          cacheState: result.meta?.cacheState || result.data.meta?.cacheState || "network",
          stale: result.meta?.stale === true || result.data.meta?.stale === true,
          updatedAt: result.meta?.updatedAt || result.data.meta?.updatedAt || new Date().toISOString()
        }
      };

      saveCachedCatalogue(catalogue);
      adapter.catalogue = catalogue;
      return catalogue;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getCatalogue() {
    return await refreshCatalogue();
  }

  const adapter = {
    catalogue: getCachedCatalogue(),
    getCatalogue,
    refreshCatalogue,
    getCachedCatalogue,
    apiBase: API_BASE,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  };

  window.HKCinemaProviders = window.HKCinemaProviders || {};
  window.HKCinemaProviders.cineart = adapter;
})();
