(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_KEY = "hkcinema:cineart-catalogue:v2";
  const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;

  function validCatalogue(value) {
    return Boolean(
      value &&
      Array.isArray(value.now) &&
      Array.isArray(value.coming) &&
      Array.isArray(value.festival)
    );
  }

  function saveCachedCatalogue(catalogue) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        catalogue
      }));
    } catch {
      // Storage can be unavailable in private/restricted contexts.
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
        method: "GET",
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
        throw new Error(result?.error?.message || `CineArt HTTP ${response.status}`);
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

  function fallbackMetadata(session) {
    const languages = Array.isArray(session?.languages) && session.languages.length
      ? session.languages
      : ["unknown"];
    const subtitles = Array.isArray(session?.subtitles) && session.subtitles.length
      ? session.subtitles
      : ["unknown"];
    const formats = Array.isArray(session?.formats) && session.formats.length
      ? session.formats
      : ["unknown"];
    return {
      languages,
      subtitles,
      formats,
      languageLabels: languages.includes("unknown") ? ["語言未提供"] : languages,
      subtitleLabels: subtitles.includes("unknown") ? ["字幕未提供"] : subtitles,
      formatLabels: formats.includes("unknown") ? [] : formats
    };
  }

  function normalizeComparisonSession(session) {
    const metadata = window.HKCinemaShowtimeMetadata?.normalizeSession?.(session) || fallbackMetadata(session);
    const summary = session?.seatSummary || {};
    const total = Number.isFinite(summary.total) ? summary.total : null;
    const notSold = Number.isFinite(summary.notSold) ? summary.notSold : null;
    const price = Number.isFinite(session?.price?.display)
      ? session.price.display
      : Number.isFinite(session?.price?.face) ? session.price.face : null;
    const subtitleText = metadata.subtitles?.includes("unknown")
      ? "字幕未提供"
      : `字幕：${metadata.subtitleLabels.join("、")}`;
    const secondary = [
      session?.house?.name,
      ...metadata.formatLabels,
      ...metadata.languageLabels,
      subtitleText
    ].filter(Boolean).join(" · ");
    const cinemaName = session?.cinema?.name?.zh || session?.cinema?.name?.en || "CineArt 戲院";
    const seatText = Number.isFinite(notSold)
      ? Number.isFinite(total)
        ? `${notSold}/${total} 未售（非可選數）`
        : `${notSold} 未售（非可選數）`
      : "座位資料暫缺";

    return {
      id: `cineart:${session?.sourceId || session?.id || Math.random()}`,
      provider: "cineart",
      providerLabel: "CineArt",
      movieSourceId: session?._phase8cMovieSourceId || session?.movieSourceId || null,
      time: String(session?.time || "--:--"),
      cinemaName,
      secondary,
      metadata,
      price,
      pricePayload: session?.price || (Number.isFinite(price) ? { display: price } : null),
      seatSummary: session?.seatSummary || null,
      seatText,
      // Coarse not-sold data is intentionally neutral: it is not selectable availability.
      seatClass: "unknown",
      seatAvailable: null,
      seatTotal: total,
      bookingUrl: null
    };
  }

  const adapter = {
    catalogue: getCachedCatalogue(),
    getCatalogue,
    refreshCatalogue,
    getCachedCatalogue,
    comparison: Object.freeze({
      normalizeSession: normalizeComparisonSession
    }),
    apiBase: API_BASE,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  };

  window.HKCinemaProviders = window.HKCinemaProviders || {};
  window.HKCinemaProviders.cineart = adapter;
})();
