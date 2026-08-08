(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_KEY = "hkcinema:emperor-catalogue:v1";
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 10000;

  function toArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value === null || value === undefined || value === "") return [];
    return String(value)
      .split(/[、,，/]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function normalizeMovie(movie, status) {
    const sourceId = String(movie?.sourceId || "").trim();
    const titleZh = movie?.title?.zh || movie?.name?.zh || movie?.filmName || null;
    const titleEn = movie?.title?.en || movie?.name?.en || movie?.filmEnName || null;
    const releaseDate = movie?.releaseDate || movie?.openingDate || null;
    const durationMinutes = Number(movie?.durationMinutes ?? movie?.duration);
    const formats = movie?.formats || movie?.format || [];

    return {
      id: `emperor:${sourceId}`,
      provider: "emperor",
      sourceId,
      movieKey: null,
      title: {
        zh: titleZh,
        en: titleEn
      },
      releaseDate: releaseDate ? String(releaseDate).slice(0, 10) : null,
      status,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      category: movie?.category || null,
      rating: movie?.classification || movie?.rating || null,
      language: toArray(movie?.language),
      subtitles: toArray(movie?.subtitles || movie?.subtitle),
      director: toArray(movie?.director || movie?.directors),
      cast: toArray(movie?.cast),
      poster: movie?.poster || null,
      trailer: movie?.trailer || null,
      formats: toArray(formats),
      bookingUrl: movie?.bookingUrl || "https://www.emperorcinemas.com/showtimes"
    };
  }

  async function fetchEndpoint(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Emperor HTTP ${response.status}`);
      }

      if (!response.ok || !result?.ok || !Array.isArray(result?.data)) {
        throw new Error(
          result?.error?.message || `Emperor HTTP ${response.status}`
        );
      }

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  function saveCachedCatalogue(catalogue) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        catalogue
      }));
    } catch {
      // Storage can be unavailable in restricted/private contexts.
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
        !catalogue ||
        !Array.isArray(catalogue.now) ||
        !Array.isArray(catalogue.coming) ||
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
          cacheSavedAt: new Date(savedAt).toISOString(),
          cacheAgeMs: ageMs
        }
      };
    } catch {
      return null;
    }
  }

  async function refreshCatalogue() {
    const [nowResult, comingResult] = await Promise.allSettled([
      fetchEndpoint("/api/emperor/movies"),
      fetchEndpoint("/api/emperor/upcoming")
    ]);

    if (nowResult.status === "rejected" && comingResult.status === "rejected") {
      throw nowResult.reason || comingResult.reason || new Error("Emperor catalogue unavailable");
    }

    const now = nowResult.status === "fulfilled"
      ? nowResult.value.data.map(movie => normalizeMovie(movie, "now-showing"))
      : [];
    const coming = comingResult.status === "fulfilled"
      ? comingResult.value.data.map(movie => normalizeMovie(movie, "coming-soon"))
      : [];

    const catalogue = {
      now,
      coming,
      meta: {
        provider: "emperor",
        transport: "worker-signed-api",
        cache: false,
        partial: nowResult.status === "rejected" || comingResult.status === "rejected",
        errors: {
          now: nowResult.status === "rejected"
            ? String(nowResult.reason?.message || nowResult.reason || "Emperor now-showing failed")
            : null,
          coming: comingResult.status === "rejected"
            ? String(comingResult.reason?.message || comingResult.reason || "Emperor upcoming failed")
            : null
        },
        counts: {
          now: now.length,
          coming: coming.length
        },
        updatedAt: new Date().toISOString()
      }
    };

    saveCachedCatalogue(catalogue);
    return catalogue;
  }

  async function getCatalogue() {
    return await refreshCatalogue();
  }

  window.HKCinemaProviders = window.HKCinemaProviders || {};
  window.HKCinemaProviders.emperor = {
    getCatalogue,
    refreshCatalogue,
    getCachedCatalogue,
    apiBase: API_BASE,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  };
})();
