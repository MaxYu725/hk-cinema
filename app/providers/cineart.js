(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_KEY = "hkcinema:cineart-catalogue:v2";
  const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;
  const SEAT_MAP_DISPLAY_DENSITY = 0.72;

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

  function seatClass(available, total) {
    if (!Number.isFinite(available)) return "unknown";
    if (available <= 0) return "full";
    if (Number.isFinite(total) && total > 0) {
      const ratio = available / total;
      if (ratio <= 0.08) return "full";
      if (ratio <= 0.25) return "limited";
    }
    if (available <= 10) return "limited";
    return "available";
  }

  function normalizeComparisonSession(session) {
    const metadata = window.HKCinemaShowtimeMetadata?.normalizeSession?.(session) || fallbackMetadata(session);
    const summary = session?.seatSummary || {};
    const total = Number.isFinite(summary.total) ? summary.total : null;
    const strict = summary.quality === "strict-seat-state" && Number.isFinite(summary.available);
    const available = strict ? summary.available : null;
    const notSold = Number.isFinite(summary.notSold) ? summary.notSold : null;
    const price = Number.isFinite(session?.price?.adult)
      ? session.price.adult
      : Number.isFinite(session?.price?.display)
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
    const seatText = strict
      ? Number.isFinite(total)
        ? `${available}/${total} 可選`
        : `${available} 個可選`
      : Number.isFinite(notSold)
        ? Number.isFinite(total)
          ? `${notSold}/${total} 未售（非可選數）`
          : `${notSold} 未售（非可選數）`
        : "座位資料暫缺";

    return {
      id: `cineart:${session?.sourceId || session?.id || Math.random()}`,
      sourceId: String(session?.sourceId || session?.id || "") || null,
      provider: "cineart",
      providerLabel: "CineArt",
      movieSourceId: session?._phase8cMovieSourceId || session?.movieSourceId || null,
      time: String(session?.time || "--:--"),
      date: session?.date || null,
      cinemaName,
      cinemaSourceId: session?.cinema?.sourceId || null,
      houseName: session?.house?.name || null,
      houseSourceId: session?.house?.sourceId || null,
      secondary,
      metadata,
      price,
      pricePayload: session?.price || (Number.isFinite(price) ? { display: price } : null),
      seatSummary: session?.seatSummary || null,
      seatText,
      seatClass: strict ? seatClass(available, total) : "unknown",
      seatAvailable: available,
      seatTotal: total,
      bookingUrl: null
    };
  }

  function seatMapRequest(providerId, session = {}) {
    const rawShowId = String(
      session?.sourceId || session?.showId || session?.id || ""
    ).replace(/^cineart:/, "");
    const movieSourceId = String(
      session?.movieSourceId || session?.movieId || ""
    ).replace(/^cineart:/, "") || null;
    const supported = /^\d+$/.test(rawShowId);
    return {
      supported,
      layoutMode: "positioned",
      request: {
        showId: supported ? rawShowId : null,
        movieSourceId: /^\d+$/.test(movieSourceId || "") ? movieSourceId : null
      },
      reason: supported ? null : "missing-request-data"
    };
  }

  function normalizeSeat(raw = {}) {
    const validStatuses = new Set([
      "available",
      "held",
      "sold",
      "blocked",
      "unavailable",
      "unknown"
    ]);
    const validTypes = new Set([
      "standard",
      "wheelchair",
      "sofa",
      "couple",
      "recliner",
      "motion",
      "special"
    ]);
    const status = validStatuses.has(raw.status) ? raw.status : "unknown";
    const type = validTypes.has(raw.type) ? raw.type : "special";
    return {
      id: String(raw.id || raw.label || ""),
      label: String(raw.label || raw.id || ""),
      row: raw.row ? String(raw.row) : null,
      column: Number.isFinite(Number(raw.column)) ? Number(raw.column) : null,
      status,
      type,
      selectable: status === "available" && raw.selectable !== false,
      areaId: null,
      areaName: null,
      position: raw.position ? {
        left: Number(raw.position.left),
        top: Number(raw.position.top),
        relativeLeftPercent: Number(raw.position.relativeLeftPercent || 0),
        relativeTopPercent: Number(raw.position.relativeTopPercent || 0),
        rotate: Number(raw.position.rotate || 0)
      } : null,
      span: 1,
      providerStatus: raw.providerStatus || null,
      providerType: raw.providerType || null
    };
  }

  function sourceBounds(section = {}) {
    const raw = section?.bounds || {};
    const minLeft = Number(raw.minLeft || 0);
    const minTop = Number(raw.minTop || 0);
    const width = Number(raw.width || 0);
    const height = Number(raw.height || 0);
    return {
      minLeft,
      maxLeft: Number(raw.maxLeft || (minLeft + width)),
      minTop,
      maxTop: Number(raw.maxTop || (minTop + height)),
      width,
      height
    };
  }

  function displayBounds(section = {}) {
    const source = sourceBounds(section);
    const width = source.width * SEAT_MAP_DISPLAY_DENSITY;
    const height = source.height * SEAT_MAP_DISPLAY_DENSITY;
    return {
      minLeft: source.minLeft,
      maxLeft: source.minLeft + width,
      minTop: source.minTop,
      maxTop: source.minTop + height,
      width,
      height
    };
  }

  function compressSeatPosition(seat, source) {
    if (!seat?.position) return seat;
    const left = Number(seat.position.left);
    const top = Number(seat.position.top);
    return {
      ...seat,
      position: {
        ...seat.position,
        left: Number.isFinite(left)
          ? source.minLeft + ((left - source.minLeft) * SEAT_MAP_DISPLAY_DENSITY)
          : left,
        top: Number.isFinite(top)
          ? source.minTop + ((top - source.minTop) * SEAT_MAP_DISPLAY_DENSITY)
          : top
      }
    };
  }

  function seatMapViewModel(data = {}, session = null) {
    const provider = window.HKCinemaViewModels?.provider?.("cineart") || {
      id: "cineart",
      label: "CineArt",
      bookingUrl: null,
      capabilities: { seatMap: true, booking: false }
    };
    const sourceSections = Array.isArray(data.sections) ? data.sections : [];
    const sections = sourceSections.map((section, index) => {
      const source = sourceBounds(section);
      const bounds = displayBounds(section);
      const seats = (Array.isArray(section?.seats) ? section.seats : [])
        .map(normalizeSeat)
        .map(seat => compressSeatPosition(seat, source));
      const grouped = new Map();
      for (const seat of seats) {
        const row = seat.row || "";
        if (!grouped.has(row)) grouped.set(row, []);
        grouped.get(row).push(seat);
      }
      const rows = Array.from(grouped, ([label, rowSeats]) => ({
        label,
        cells: rowSeats.map(seat => ({
          kind: "seat",
          label: null,
          index: seat.column,
          seat
        })),
        seats: rowSeats
      }));
      return {
        id: String(section?.id || index),
        name: section?.name || null,
        bounds,
        metrics: {},
        areas: [],
        rows,
        seats
      };
    });
    const seats = sections.flatMap(section => section.seats);
    const count = status => seats.filter(seat => seat.status === status).length;
    return {
      kind: "seat-map",
      schemaVersion: 1,
      provider,
      sessionId: String(
        data.showId || session?.sourceId || ""
      ).replace(/^cineart:/, "") || null,
      layoutMode: "positioned",
      screenLabel: data.screenLabel || "銀幕",
      summary: {
        quality: "exact",
        total: seats.length,
        available: count("available"),
        held: count("held"),
        sold: count("sold"),
        blocked: count("blocked"),
        unavailable: count("unavailable"),
        unknown: count("unknown"),
        accessibleAvailable: seats.filter(
          seat => seat.status === "available" && seat.type === "wheelchair"
        ).length,
        occupiedPercent: seats.length
          ? Number((
              (
                count("held") +
                count("sold") +
                count("blocked") +
                count("unavailable") +
                count("unknown")
              ) / seats.length * 100
            ).toFixed(1))
          : null,
        updatedAt: data.updatedAt || data.source?.updatedAt || null
      },
      sections,
      notices: [],
      purchaseLimit: null,
      bookingUrl: null,
      showtime: session || null,
      source: {
        quality: "exact",
        name: data.source?.parser || "cineart-next-flight-seatmap",
        updatedAt: data.updatedAt || data.source?.updatedAt || null
      }
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
    seatMapRequest,
    viewModels: Object.freeze({
      seatMap: seatMapViewModel
    }),
    apiBase: API_BASE,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS
  };

  window.HKCinemaProviders = window.HKCinemaProviders || {};
  window.HKCinemaProviders.cineart = adapter;
})();