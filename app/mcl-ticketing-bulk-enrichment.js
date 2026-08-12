(() => {
  const legacyBulkGetTicketing = typeof window.__HKCinemaMCLLegacyBulkGetter === "function"
    ? window.__HKCinemaMCLLegacyBulkGetter
    : null;
  const SERVICES_BASE = "https://services.mclcinema.com/";
  const SITE_BASE = "https://www.mclcinema.com/";
  const BULK_TIMEOUT_MS = 4500;
  const BULK_CACHE_MAX_AGE_MS = 90 * 1000;

  const bulkCache = new Map();
  let suppressedLegacyPriceRequests = 0;

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizedDate(value) {
    const text = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function normalizeCinemaCode(value) {
    const text = String(value || "").trim();
    if (!/^\d{1,4}$/.test(text)) return text;
    return text.length <= 3 ? text.padStart(3, "0") : text;
  }

  function sourceIdOf(session) {
    const raw = session?.sourceId ?? session?.id ?? "";
    return String(raw).replace(/^mcl:/, "").trim();
  }

  function mergePrice(primary = {}, bulk = {}) {
    const pick = key => {
      const current = finite(primary?.[key]);
      if (current !== null) return current;
      return finite(bulk?.[key]);
    };
    return {
      display: pick("display") ?? pick("adult"),
      adult: pick("adult"),
      student: pick("student"),
      child: pick("child"),
      senior: pick("senior")
    };
  }

  function mergeSeatSummary(primary = {}, bulk = {}) {
    return {
      available: finite(primary?.available) ?? finite(bulk?.available),
      total: finite(primary?.total) ?? finite(bulk?.total),
      held: finite(primary?.held) ?? finite(bulk?.held),
      unavailable: finite(primary?.unavailable) ?? finite(bulk?.unavailable),
      occupiedPercent: finite(primary?.occupiedPercent) ?? finite(bulk?.occupiedPercent)
    };
  }

  function mergeSession(primary, bulk) {
    if (!bulk) return primary;
    return {
      ...primary,
      cinema: {
        ...(bulk.cinema || {}),
        ...(primary.cinema || {}),
        name: {
          ...(bulk.cinema?.name || {}),
          ...(primary.cinema?.name || {})
        }
      },
      house: {
        ...(bulk.house || {}),
        ...(primary.house || {}),
        name: primary.house?.name || bulk.house?.name || null
      },
      format: primary.format || bulk.format || null,
      language: primary.language || bulk.language || null,
      versionName: primary.versionName || bulk.versionName || null,
      displayVersion: primary.displayVersion || bulk.displayVersion || null,
      price: mergePrice(primary.price, bulk.price),
      seatSummary: mergeSeatSummary(primary.seatSummary, bulk.seatSummary),
      bookingUrl: primary.bookingUrl || bulk.bookingUrl || null,
      _mclBulkEnriched: true
    };
  }

  function buildBulkMap(bulkData) {
    const map = new Map();
    const candidates = [
      ...(Array.isArray(bulkData?.allSessions) ? bulkData.allSessions : []),
      ...(Array.isArray(bulkData?.sessions) ? bulkData.sessions : [])
    ];
    for (const session of candidates) {
      const key = sourceIdOf(session);
      if (key) map.set(key, session);
    }
    return map;
  }

  function mergeResult(primaryData, bulkData) {
    if (!primaryData || !bulkData) return primaryData;
    const bulkMap = buildBulkMap(bulkData);
    if (!bulkMap.size) return primaryData;

    let matched = 0;
    let priceFilled = 0;
    const mergeList = list => (Array.isArray(list) ? list : []).map(session => {
      const bulk = bulkMap.get(sourceIdOf(session));
      if (!bulk) return session;
      matched += 1;
      const before = finite(session?.price?.adult) ?? finite(session?.price?.display);
      const merged = mergeSession(session, bulk);
      const after = finite(merged?.price?.adult) ?? finite(merged?.price?.display);
      if (before === null && after !== null) priceFilled += 1;
      return merged;
    });

    const sessions = mergeList(primaryData.sessions);
    const allSessions = mergeList(primaryData.allSessions);
    const selectedPriceCount = sessions.filter(session => (
      finite(session?.price?.adult) !== null || finite(session?.price?.display) !== null
    )).length;

    return {
      ...primaryData,
      sessions,
      allSessions,
      pricingComplete: selectedPriceCount === sessions.length,
      bulkEnrichment: {
        source: "services-movieset",
        matched,
        priceFilled,
        selectedPriceCount,
        selectedSessionCount: sessions.length
      },
      source: {
        ...(primaryData.source || {}),
        bulkEnrichment: "services-movieset"
      }
    };
  }

  function findBalancedObject(text, marker) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) return null;

    let start = text.lastIndexOf("{", markerIndex);
    while (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') {
          inString = true;
          continue;
        }
        if (char === "{") depth += 1;
        else if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            const candidate = text.slice(start, i + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (parsed?.AvailableDates && Array.isArray(parsed?.AvailableSessions)) return parsed;
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

  function parseMovieSetPayload(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    try {
      const direct = JSON.parse(trimmed);
      if (direct?.AvailableDates && Array.isArray(direct?.AvailableSessions)) return direct;
    } catch {
      // MovieSet can return HTML with the JSON payload embedded.
    }
    return findBalancedObject(trimmed, '"AvailableDates"');
  }

  function normalizeMovieSet(raw, movieSetId, selectedDate = null) {
    if (!raw || !Array.isArray(raw.AvailableSessions)) return null;
    const cinemas = raw.AvailableCinemas || {};
    const allSessions = raw.AvailableSessions
      .filter(session => session && session.SessionID != null)
      .map(session => {
        const dateTime = String(session.SessionDateTime || "");
        const date = /^\d{4}-\d{2}-\d{2}/.test(dateTime) ? dateTime.slice(0, 10) : null;
        const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateTime)
          ? dateTime.slice(11, 16)
          : String(session.Time || "");
        const cinemaId = normalizeCinemaCode(session.CinemaCodeID);
        const sourceId = String(session.SessionID);
        const adult = finite(session.AdultPrice);
        return {
          id: `mcl:${sourceId}`,
          provider: "mcl",
          sourceId,
          date,
          time,
          cinema: {
            id: cinemaId || null,
            name: { zh: cinemas[session.CinemaCodeID] || cinemas[cinemaId] || cinemaId || "MCL 戲院", en: null }
          },
          house: { id: null, name: session.ScreenName || null },
          format: session.Format || null,
          language: session.Languages || null,
          versionName: session.VersionName || null,
          displayVersion: session.DisplayVersion || null,
          price: {
            display: adult,
            adult,
            student: finite(session.StudentPrice),
            child: finite(session.ChildPrice),
            senior: finite(session.SeniorPrice)
          },
          seatSummary: {
            available: null,
            total: null,
            held: null,
            unavailable: null,
            occupiedPercent: finite(session.OccupiedSeatsInPercent)
          },
          bookingUrl: cinemaId
            ? `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(cinemaId)}&si=${encodeURIComponent(sourceId)}`
            : null
        };
      });

    const dates = new Set();
    Object.values(raw.AvailableDates || {}).forEach(value => {
      const date = normalizedDate(value);
      if (date) dates.add(date);
    });
    allSessions.forEach(session => {
      if (session.date) dates.add(session.date);
    });
    const availableDates = Array.from(dates).sort();
    const resolvedDate = selectedDate && availableDates.includes(selectedDate)
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
      source: {
        provider: "mcl",
        transport: "services-movieset-bulk",
        endpoint: `${SERVICES_BASE}Ticketing/MovieSet`
      }
    };
  }

  function bulkKey(movieSetId, selectedDate) {
    const id = String(movieSetId || "").replace(/^mcl:/, "");
    return `${id}:${selectedDate || "initial"}`;
  }

  function readBulkCache(key) {
    const entry = bulkCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > BULK_CACHE_MAX_AGE_MS) {
      bulkCache.delete(key);
      return null;
    }
    return entry.data;
  }

  function writeBulkCache(movieSetId, selectedDate, data) {
    if (!data) return;
    bulkCache.set(bulkKey(movieSetId, selectedDate), { savedAt: Date.now(), data });
    if (!selectedDate) {
      const resolvedDate = normalizedDate(data.selectedDate);
      if (resolvedDate) {
        bulkCache.set(bulkKey(movieSetId, resolvedDate), { savedAt: Date.now(), data });
      }
    }
    while (bulkCache.size > 24) {
      const oldest = bulkCache.keys().next().value;
      if (oldest === undefined) break;
      bulkCache.delete(oldest);
    }
  }

  async function fetchMovieSetDirect(movieSetId, selectedDate, parentSignal = null) {
    if (typeof window.fetch !== "function") return null;
    const id = String(movieSetId || "").replace(/^mcl:/, "");
    if (!/^\d+$/.test(id)) return null;

    const controller = new AbortController();
    const onParentAbort = () => controller.abort(parentSignal?.reason || "lifecycle");
    const timer = setTimeout(() => controller.abort("bulk-timeout"), BULK_TIMEOUT_MS);
    if (parentSignal?.aborted) onParentAbort();
    else parentSignal?.addEventListener?.("abort", onParentAbort, { once: true });

    try {
      if (controller.signal.aborted) return null;
      const response = await window.fetch(
        `${SERVICES_BASE}Ticketing/MovieSet?language=zh-TW&movieSetId=${encodeURIComponent(id)}`,
        {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json,text/html;q=0.9,*/*;q=0.8" }
        }
      );
      if (!response.ok) return null;
      const raw = parseMovieSetPayload(await response.text());
      return normalizeMovieSet(raw, id, selectedDate);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.("abort", onParentAbort);
    }
  }

  async function fetchBulk(movieSetId, selectedDate, options = {}) {
    const signal = options?.signal || null;
    if (signal?.aborted) return null;
    const key = bulkKey(movieSetId, selectedDate);
    const cached = readBulkCache(key);
    if (cached) return cached;

    let data = null;
    if (typeof window.fetch === "function") {
      data = await fetchMovieSetDirect(movieSetId, selectedDate, signal);
    } else if (legacyBulkGetTicketing) {
      try {
        data = await legacyBulkGetTicketing(movieSetId, selectedDate, options);
      } catch {
        data = null;
      }
    }

    if (!signal?.aborted && data) writeBulkCache(movieSetId, selectedDate, data);
    return signal?.aborted ? null : data;
  }

  function installLegacyPriceRequestPolicy() {
    if (typeof window.fetch !== "function") return false;
    if (window.__HKCinemaMCLPriceRequestPolicyM6D2C) return true;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function mclPricePolicyFetch(input, init = {}) {
      let url = null;
      let accept = "";
      try {
        const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
        url = new URL(request?.url || String(input || ""), window.location?.href || SITE_BASE);
        const headers = new Headers(init.headers || request?.headers || undefined);
        accept = headers.get("Accept") || "";
      } catch {
        return nativeFetch(input, init);
      }

      const isLegacyEagerPrice =
        url.origin === "https://www.mclcinema.com" &&
        url.pathname.endsWith("/MCLWebAPI2/GetPrice.aspx") &&
        /text\/html/i.test(accept);

      if (isLegacyEagerPrice) {
        suppressedLegacyPriceRequests += 1;
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return nativeFetch(input, init);
    };

    window.__HKCinemaMCLPriceRequestPolicyM6D2C = true;
    return true;
  }

  function install() {
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) return false;
    if (provider.ticketingBulkEnrichmentInstalled) return true;

    const primaryGetTicketing = provider.getTicketing.bind(provider);
    provider.getTicketing = async (movieSetId, selectedDate = null, options = {}) => {
      const bulkPromise = fetchBulk(movieSetId, selectedDate, options);
      const primaryData = await primaryGetTicketing(movieSetId, selectedDate, options);
      const bulkData = await bulkPromise;
      return mergeResult(primaryData, bulkData);
    };

    provider.ticketingBulkEnrichmentInstalled = true;
    provider.ticketingBulkEnrichmentVersion = "8d2-m6d2c";
    return true;
  }

  installLegacyPriceRequestPolicy();

  window.HKCinemaMCLBulkEnrichment = Object.freeze({
    version: "8d2",
    requestPolicyVersion: "m6d2c",
    timeoutMs: BULK_TIMEOUT_MS,
    cacheMaxAgeMs: BULK_CACHE_MAX_AGE_MS,
    mergeResult,
    install,
    getStats() {
      return {
        bulkCacheEntries: bulkCache.size,
        suppressedLegacyPriceRequests
      };
    }
  });

  if (!install()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      setTimeout(install, 0);
    }
  }
})();
