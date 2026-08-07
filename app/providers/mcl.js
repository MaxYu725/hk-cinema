(() => {
  const SITE_BASE = "https://www.mclcinema.com/";
  const API_BASE = `${SITE_BASE}MCLWebAPI2/`;
  const SERVICES_BASE = "https://services.mclcinema.com/";
  const CACHE_KEY = "hkcinema:mcl-catalogue:v1";
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const TICKETING_CACHE_MAX_AGE_MS = 2 * 60 * 1000;

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

  async function fetchTextWithTimeout(url, timeoutMs) {
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
          Accept: "application/json,text/html;q=0.9,*/*;q=0.8"
        }
      });

      if (!response.ok) {
        throw new Error(`MCL ticketing HTTP ${response.status}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTextWithRetry(url) {
    const timeouts = [8000, 12000];
    let lastError = null;

    for (let attempt = 0; attempt < timeouts.length; attempt++) {
      try {
        return await fetchTextWithTimeout(
          url,
          timeouts[attempt]
        );
      } catch (error) {
        lastError = error;

        if (attempt < timeouts.length - 1) {
          await sleep(650);
        }
      }
    }

    throw lastError || new Error("MCL ticketing request failed");
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

  function findBalancedObject(text, marker) {
    const markerIndex = text.indexOf(marker);

    if (markerIndex < 0) {
      return null;
    }

    let start = text.lastIndexOf("{", markerIndex);

    while (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === "{") {
          depth++;
        } else if (char === "}") {
          depth--;

          if (depth === 0) {
            const candidate = text.slice(start, i + 1);

            try {
              const parsed = JSON.parse(candidate);

              if (
                parsed &&
                parsed.AvailableDates &&
                Array.isArray(parsed.AvailableSessions)
              ) {
                return parsed;
              }
            } catch {
              break;
            }
          }
        }
      }

      start = text.lastIndexOf("{", start - 1);
    }

    return null;
  }

  function parseTicketingPayload(text) {
    const trimmed = String(text || "").trim();

    if (!trimmed) {
      throw new Error("MCL ticketing response empty");
    }

    try {
      const direct = JSON.parse(trimmed);

      if (
        direct &&
        direct.AvailableDates &&
        Array.isArray(direct.AvailableSessions)
      ) {
        return direct;
      }
    } catch {
      // The ticketing service may return HTML with an embedded JSON payload.
    }

    const embedded = findBalancedObject(
      trimmed,
      '"AvailableDates"'
    );

    if (embedded) {
      return embedded;
    }

    throw new Error("MCL ticketing payload not found");
  }

  function ticketingCacheKey(movieSetId) {
    return `hkcinema:mcl-ticketing:${movieSetId}:v1`;
  }

  function getCachedTicketing(movieSetId) {
    try {
      const text = sessionStorage.getItem(
        ticketingCacheKey(movieSetId)
      );

      if (!text) {
        return null;
      }

      const cached = JSON.parse(text);
      const ageMs = Date.now() - Number(cached?.savedAt);

      if (
        !Number.isFinite(ageMs) ||
        ageMs < 0 ||
        ageMs > TICKETING_CACHE_MAX_AGE_MS ||
        !cached?.raw
      ) {
        sessionStorage.removeItem(
          ticketingCacheKey(movieSetId)
        );
        return null;
      }

      return cached.raw;
    } catch {
      return null;
    }
  }

  function saveCachedTicketing(movieSetId, raw) {
    try {
      sessionStorage.setItem(
        ticketingCacheKey(movieSetId),
        JSON.stringify({
          savedAt: Date.now(),
          raw
        })
      );
    } catch {
      // Ignore storage failures.
    }
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeTicketing(raw, movieSetId, selectedDate = null) {
    const cinemas = raw.AvailableCinemas || {};
    const rawSessions = Array.isArray(raw.AvailableSessions)
      ? raw.AvailableSessions
      : [];

    const allSessions = rawSessions
      .filter(session => session && session.SessionID != null)
      .map(session => {
        const dateTime = String(session.SessionDateTime || "");
        const date = /^\d{4}-\d{2}-\d{2}/.test(dateTime)
          ? dateTime.slice(0, 10)
          : null;
        const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateTime)
          ? dateTime.slice(11, 16)
          : String(session.Time || "");
        const cinemaId = String(session.CinemaCodeID || "");
        const sessionId = String(session.SessionID);
        const occupiedPercent = toFiniteNumber(
          session.OccupiedSeatsInPercent
        );

        return {
          id: `mcl:${sessionId}`,
          provider: "mcl",
          sourceId: sessionId,
          date,
          time,
          cinema: {
            id: cinemaId || null,
            name: {
              zh: cinemas[cinemaId] || cinemaId || "MCL 戲院",
              en: null
            }
          },
          house: {
            id: null,
            name: session.ScreenName || null
          },
          format: session.Format || null,
          language: session.Languages || null,
          versionName: session.VersionName || null,
          displayVersion: session.DisplayVersion || null,
          price: {
            display: toFiniteNumber(session.AdultPrice),
            adult: toFiniteNumber(session.AdultPrice),
            student: toFiniteNumber(session.StudentPrice),
            child: toFiniteNumber(session.ChildPrice),
            senior: toFiniteNumber(session.SeniorPrice)
          },
          seatSummary: {
            available: null,
            total: null,
            held: null,
            unavailable: null,
            occupiedPercent
          },
          bookingUrl:
            `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(cinemaId)}&si=${encodeURIComponent(sessionId)}`
        };
      });

    const dateSet = new Set();

    Object.values(raw.AvailableDates || {}).forEach(value => {
      const text = String(value || "");
      const match = text.match(/^\d{4}-\d{2}-\d{2}/);
      if (match) dateSet.add(match[0]);
    });

    allSessions.forEach(session => {
      if (session.date) dateSet.add(session.date);
    });

    const availableDates = Array.from(dateSet).sort();
    const resolvedDate =
      selectedDate && availableDates.includes(selectedDate)
        ? selectedDate
        : availableDates[0] || null;

    const sessions = resolvedDate
      ? allSessions.filter(session => session.date === resolvedDate)
      : allSessions;

    return {
      movieSetId: String(movieSetId),
      availableDates,
      selectedDate: resolvedDate,
      sessions,
      allSessions,
      availableVersions: Array.isArray(raw.AvailableVersions)
        ? raw.AvailableVersions
        : [],
      source: {
        provider: "mcl",
        transport: "browser-direct",
        endpoint: `${SERVICES_BASE}Ticketing/MovieSet`,
        totalSessions: allSessions.length,
        selectedDateSessions: sessions.length,
        updatedAt: new Date().toISOString()
      }
    };
  }

  async function getTicketing(movieSetId, selectedDate = null) {
    const id = String(movieSetId || "").replace(/^mcl:/, "");

    if (!/^\d+$/.test(id)) {
      throw new Error("Invalid MCL movie ID");
    }

    let raw = getCachedTicketing(id);

    if (!raw) {
      const url =
        `${SERVICES_BASE}Ticketing/MovieSet?language=zh-TW&movieSetId=${encodeURIComponent(id)}`;
      const text = await fetchTextWithRetry(url);
      raw = parseTicketingPayload(text);
      saveCachedTicketing(id, raw);
    }

    return normalizeTicketing(raw, id, selectedDate);
  }

  window.HKCinemaProviders =
    window.HKCinemaProviders || {};

  window.HKCinemaProviders.mcl = {
    getCatalogue,
    refreshCatalogue,
    getCachedCatalogue,
    getTicketing,
    siteBase: SITE_BASE,
    apiBase: API_BASE,
    servicesBase: SERVICES_BASE,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  };
})();
