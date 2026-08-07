(() => {
  const SITE_BASE = "https://www.mclcinema.com/";
  const API_BASE = `${SITE_BASE}MCLWebAPI2/`;
  const CACHE_KEY = "hkcinema:mcl-catalogue:v1";
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function buildPosterUrl(group, item) {
    if (item?.n) {
      return new URL(item.n, SITE_BASE).href;
    }

    if (!group?.p || !group?.ta || item?.id == null) {
      return null;
    }

    return new URL(
      `${group.p}${item.id}${group.ta}`,
      SITE_BASE
    ).href;
  }

  function buildBookingUrl(group, item) {
    const path = group?.u || "MovieSet.aspx?id=";

    return new URL(
      `${path}${item.id}&visLang=1`,
      SITE_BASE
    ).href;
  }

  function normalizeGroup(group, status) {
    if (!group || !Array.isArray(group.n)) {
      return [];
    }

    return group.n
      .filter(item => item && item.id != null)
      .map(item => ({
        id: `mcl:${item.id}`,
        provider: "mcl",
        sourceId: String(item.id),
        movieKey: null,
        title: {
          zh: item.mn || null,
          en: null
        },
        releaseDate: null,
        status,
        durationMinutes: null,
        category: null,
        rating: null,
        language: [],
        subtitles: [],
        director: [],
        cast: [],
        poster: buildPosterUrl(group, item),
        trailer: null,
        formats: [],
        bookingUrl: buildBookingUrl(group, item)
      }));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01"
        }
      });

      if (!response.ok) {
        throw new Error(`MCL HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJsonWithRetry(url) {
    const timeouts = [8000, 12000];
    let lastError = null;

    for (let attempt = 0; attempt < timeouts.length; attempt++) {
      try {
        return await fetchJsonWithTimeout(
          url,
          timeouts[attempt]
        );
      } catch (error) {
        lastError = error;

        if (attempt < timeouts.length - 1) {
          await sleep(750);
        }
      }
    }

    throw lastError || new Error("MCL request failed");
  }

  function normalizeCatalogue(raw) {
    if (!raw || !raw.n || !raw.c) {
      throw new Error("MCL catalogue response invalid");
    }

    const now = normalizeGroup(raw.n, "now-showing");
    const coming = normalizeGroup(raw.c, "coming-soon");
    const festival = normalizeGroup(raw.f, "festival");
    const updatedAt = new Date().toISOString();

    return {
      now,
      coming,
      festival,
      meta: {
        provider: "mcl",
        transport: "browser-direct",
        endpoint: `${API_BASE}GetNCF.aspx?l=1`,
        cache: false,
        counts: {
          now: now.length,
          coming: coming.length,
          festival: festival.length
        },
        updatedAt
      }
    };
  }

  function saveCachedCatalogue(catalogue) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          catalogue
        })
      );
    } catch {
      // Storage may be unavailable in private/restricted contexts.
    }
  }

  function getCachedCatalogue() {
    try {
      const text = localStorage.getItem(CACHE_KEY);

      if (!text) {
        return null;
      }

      const cached = JSON.parse(text);
      const savedAt = Number(cached?.savedAt);
      const catalogue = cached?.catalogue;

      if (
        !Number.isFinite(savedAt) ||
        !catalogue ||
        !Array.isArray(catalogue.now) ||
        !Array.isArray(catalogue.coming)
      ) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      const ageMs = Date.now() - savedAt;

      if (ageMs < 0 || ageMs > CACHE_MAX_AGE_MS) {
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
    const raw = await fetchJsonWithRetry(
      `${API_BASE}GetNCF.aspx?l=1`
    );

    const catalogue = normalizeCatalogue(raw);
    saveCachedCatalogue(catalogue);
    return catalogue;
  }

  async function getCatalogue() {
    return await refreshCatalogue();
  }

  window.HKCinemaProviders =
    window.HKCinemaProviders || {};

  window.HKCinemaProviders.mcl = {
    getCatalogue,
    refreshCatalogue,
    getCachedCatalogue,
    siteBase: SITE_BASE,
    apiBase: API_BASE,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  };
})();
