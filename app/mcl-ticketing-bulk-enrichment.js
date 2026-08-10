(() => {
  const providerAtCapture = window.HKCinemaProviders?.mcl;
  const bulkGetTicketing = providerAtCapture?.getTicketing?.bind(providerAtCapture);
  const BULK_TIMEOUT_MS = 4500;

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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

  function timeoutAfter(ms) {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }

  async function fetchBulk(movieSetId, selectedDate) {
    if (!bulkGetTicketing) return null;
    try {
      return await Promise.race([
        bulkGetTicketing(movieSetId, selectedDate),
        timeoutAfter(BULK_TIMEOUT_MS)
      ]);
    } catch {
      return null;
    }
  }

  function install() {
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing || !bulkGetTicketing) return false;
    if (provider.ticketingBulkEnrichmentInstalled) return true;

    const primaryGetTicketing = provider.getTicketing.bind(provider);
    provider.getTicketing = async (movieSetId, selectedDate = null, options = {}) => {
      const bulkPromise = fetchBulk(movieSetId, selectedDate);
      const primaryData = await primaryGetTicketing(movieSetId, selectedDate, options);
      const bulkData = await bulkPromise;
      return mergeResult(primaryData, bulkData);
    };

    provider.ticketingBulkEnrichmentInstalled = true;
    provider.ticketingBulkEnrichmentVersion = "8d2";
    return true;
  }

  window.HKCinemaMCLBulkEnrichment = Object.freeze({
    version: "8d2",
    timeoutMs: BULK_TIMEOUT_MS,
    mergeResult,
    install
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    setTimeout(install, 0);
  }
})();
