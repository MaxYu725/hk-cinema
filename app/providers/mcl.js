(() => {
  const SITE_BASE = "https://www.mclcinema.com/";
  const API_BASE = `${SITE_BASE}MCLWebAPI2/`;

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

  async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
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

  async function getCatalogue() {
    const raw = await fetchJsonWithTimeout(
      `${API_BASE}GetNCF.aspx?l=1`
    );

    if (!raw || !raw.n || !raw.c) {
      throw new Error("MCL catalogue response invalid");
    }

    const now = normalizeGroup(raw.n, "now-showing");
    const coming = normalizeGroup(raw.c, "coming-soon");
    const festival = normalizeGroup(raw.f, "festival");

    return {
      now,
      coming,
      festival,
      meta: {
        provider: "mcl",
        transport: "browser-direct",
        endpoint: `${API_BASE}GetNCF.aspx?l=1`,
        counts: {
          now: now.length,
          coming: coming.length,
          festival: festival.length
        },
        updatedAt: new Date().toISOString()
      }
    };
  }

  window.HKCinemaProviders =
    window.HKCinemaProviders || {};

  window.HKCinemaProviders.mcl = {
    getCatalogue,
    siteBase: SITE_BASE,
    apiBase: API_BASE
  };
})();
