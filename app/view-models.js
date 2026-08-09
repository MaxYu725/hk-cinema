(() => {
  const SCHEMA_VERSION = 1;

  const PROVIDERS = Object.freeze({
    broadway: Object.freeze({
      id: "broadway",
      label: "Broadway",
      bookingUrl: "https://www.cinema.com.hk/hk"
    }),
    mcl: Object.freeze({
      id: "mcl",
      label: "MCL",
      bookingUrl: "https://www.mclcinema.com/"
    }),
    emperor: Object.freeze({
      id: "emperor",
      label: "Emperor Cinemas",
      bookingUrl: "https://www.emperorcinemas.com/showtimes"
    })
  });

  const SEAT_STATUSES = Object.freeze([
    "available",
    "held",
    "sold",
    "blocked",
    "unavailable",
    "unknown"
  ]);

  const SEAT_TYPES = Object.freeze([
    "standard",
    "wheelchair",
    "sofa",
    "couple",
    "recliner",
    "motion",
    "special"
  ]);

  const SUMMARY_QUALITIES = Object.freeze([
    "exact",
    "provider-summary",
    "estimated",
    "unknown"
  ]);

  function provider(providerId) {
    const value = PROVIDERS[String(providerId || "").toLowerCase()];
    if (!value) throw new Error(`Unsupported cinema provider: ${providerId}`);
    return { ...value };
  }

  function text(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" || typeof value === "function") return null;
    const normalized = String(value).trim();
    return normalized || null;
  }

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function boolean(value) {
    return typeof value === "boolean" ? value : null;
  }

  function firstText(...values) {
    for (const value of values) {
      const normalized = text(value);
      if (normalized !== null) return normalized;
    }
    return null;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const normalized = finite(value);
      if (normalized !== null) return normalized;
    }
    return null;
  }

  function values(value) {
    const items = Array.isArray(value) ? value.flat(Infinity) : [value];
    return items
      .flatMap(item => typeof item === "string" ? item.split(/[、,，/;；]+/) : [item])
      .map(text)
      .filter(Boolean);
  }

  function uniqueValues(...inputs) {
    return Array.from(new Set(inputs.flatMap(values)));
  }

  function uniqueItems(...inputs) {
    return Array.from(new Set(
      inputs
        .flat(Infinity)
        .map(text)
        .filter(Boolean)
    ));
  }

  function normalizedId(providerId, id, sourceId) {
    const direct = text(id);
    if (direct) return direct.includes(":") ? direct : `${providerId}:${direct}`;
    const source = text(sourceId);
    return source ? `${providerId}:${source.replace(new RegExp(`^${providerId}:`), "")}` : null;
  }

  function sourceId(providerId, source) {
    const value = firstText(
      source?.sourceId,
      source?.movieSourceId,
      source?.movieSetId,
      source?.sessionId,
      source?.scheduleId,
      source?.showId,
      source?.id
    );
    return value ? value.replace(new RegExp(`^${providerId}:`), "") : null;
  }

  function detailMovie(detail) {
    return detail?.movie && typeof detail.movie === "object" ? detail.movie : detail || {};
  }

  function titleValue(source, language) {
    if (language === "zh") {
      return firstText(
        source?.title?.zh,
        source?.name?.zh,
        source?.filmName,
        source?.titleZh,
        source?.title
      );
    }
    return firstText(
      source?.title?.en,
      source?.name?.en,
      source?.filmEnName,
      source?.titleEn
    );
  }

  function movieViewModel(providerId, movie, detail = null) {
    const info = provider(providerId);
    const rich = detailMovie(detail);
    const fallback = movie || {};
    const sources = [rich, fallback];
    const pickText = getter => firstText(...sources.map(getter));
    const pickNumber = getter => firstNumber(...sources.map(getter));
    const zh = firstText(...sources.map(source => titleValue(source, "zh")));
    const en = firstText(...sources.map(source => titleValue(source, "en")));
    const display = zh || en || "未命名電影";
    const secondary = en && en !== display ? en : null;
    const idSource = sourceId(providerId, rich) || sourceId(providerId, fallback);
    const languages = uniqueValues(...sources.map(source => source?.languages || source?.language));
    const subtitles = uniqueValues(...sources.map(source => source?.subtitles || source?.subtitle));
    const formats = uniqueValues(
      ...sources.flatMap(source => [source?.formatGroups, source?.formats, source?.format])
    );
    const directors = uniqueValues(...sources.map(source => source?.directors || source?.director));
    const cast = uniqueValues(...sources.map(source => source?.cast || source?.actors));
    const facts = {
      releaseDate: pickText(source => source?.releaseDate || source?.openingDate),
      durationMinutes: pickNumber(source => source?.durationMinutes ?? source?.duration),
      classification: pickText(source => source?.classification || source?.rating),
      category: pickText(source => source?.category),
      languages,
      subtitles,
      formats
    };

    return {
      kind: "movie-detail",
      schemaVersion: SCHEMA_VERSION,
      provider: info,
      id: normalizedId(providerId, rich?.id || fallback?.id, idSource),
      sourceId: idSource,
      status: pickText(source => source?.status || source?.showStatus),
      title: { zh, en, display, secondary },
      posterUrl: pickText(source => source?.posterUrl || source?.poster),
      bookingUrl: pickText(source => source?.bookingUrl) || info.bookingUrl,
      facts,
      people: { directors, cast },
      description: pickText(source => source?.description || source?.introduction),
      trailerUrl: pickText(source => source?.trailerUrl || source?.trailer),
      availability: {
        hasFacts: Boolean(
          facts.releaseDate ||
          facts.durationMinutes !== null ||
          facts.classification ||
          facts.category ||
          facts.languages.length ||
          facts.subtitles.length ||
          facts.formats.length
        ),
        hasPeople: Boolean(directors.length || cast.length),
        hasDescription: Boolean(pickText(source => source?.description || source?.introduction)),
        hasTrailer: Boolean(pickText(source => source?.trailerUrl || source?.trailer))
      }
    };
  }

  function cinemaViewModel(raw, providerId) {
    const idSource = firstText(raw?.sourceId, raw?.id);
    const directName = typeof raw?.name === "string" ? raw.name : null;
    const zh = firstText(raw?.name?.zh, raw?.name?.en, directName);
    const en = firstText(raw?.name?.en);
    return {
      id: normalizedId(providerId, raw?.id, idSource),
      sourceId: idSource ? idSource.replace(new RegExp(`^${providerId}:`), "") : null,
      name: {
        zh,
        en,
        display: zh || en || PROVIDERS[providerId].label
      }
    };
  }

  function houseViewModel(raw) {
    return {
      id: firstText(raw?.id, raw?.sourceId),
      sourceId: firstText(raw?.sourceId, raw?.id),
      name: firstText(raw?.name)
    };
  }

  function occupiedPercent(summary) {
    const reportedPercent = firstNumber(summary?.occupiedPercent);
    if (reportedPercent !== null) {
      return Number(Math.min(100, Math.max(0, reportedPercent)).toFixed(1));
    }

    const occupancy = firstNumber(summary?.occupancy);
    if (occupancy === null) return null;
    const percent = occupancy >= 0 && occupancy <= 1 ? occupancy * 100 : occupancy;
    return Number(Math.min(100, Math.max(0, percent)).toFixed(1));
  }

  function summaryQuality(summary) {
    if (SUMMARY_QUALITIES.includes(summary?.quality)) return summary.quality;
    if (summary?.source === "exact") return "exact";
    const countKeys = ["total", "available", "held", "sold", "blocked", "unavailable"];
    const hasCounts = countKeys.some(key => finite(summary?.[key]) !== null);
    const hasPercent = occupiedPercent(summary) !== null;
    if (!hasCounts && hasPercent) return "estimated";
    if (hasCounts) return "provider-summary";
    return "unknown";
  }

  function seatSummaryViewModel(summary = {}) {
    return {
      quality: summaryQuality(summary),
      total: finite(summary?.total),
      available: finite(summary?.available),
      held: finite(summary?.held),
      sold: finite(summary?.sold),
      blocked: finite(summary?.blocked),
      unavailable: finite(summary?.unavailable),
      unknown: finite(summary?.unknown),
      accessibleAvailable: finite(summary?.accessibleAvailable),
      occupiedPercent: occupiedPercent(summary),
      updatedAt: text(summary?.updatedAt)
    };
  }

  function priceViewModel(price = {}) {
    const display = firstNumber(price?.display, price?.adult, price?.lowest, price?.face);
    return {
      currency: firstText(price?.currency) || "HKD",
      primary: display,
      display,
      adult: finite(price?.adult),
      student: finite(price?.student),
      child: finite(price?.child),
      senior: finite(price?.senior),
      face: finite(price?.face),
      lowest: finite(price?.lowest),
      serviceFee: finite(price?.serviceFee),
      ticketTypes: Array.isArray(price?.ticketTypes) ? price.ticketTypes.slice() : [],
      updatedAt: text(price?.updatedAt)
    };
  }

  function purchaseViewModel(purchase = {}) {
    return {
      canPurchase: boolean(purchase?.canPurchase),
      soldOut: boolean(purchase?.soldOut),
      blocked: boolean(purchase?.blocked),
      freeSeating: boolean(purchase?.freeSeating),
      prioritySale: boolean(purchase?.prioritySale),
      priorityAllowed: boolean(purchase?.priorityAllowed)
    };
  }

  function seatMapRequest(providerId, session) {
    const sessionSourceId = sourceId(providerId, session);
    if (providerId === "broadway") {
      return {
        supported: Boolean(sessionSourceId),
        layoutMode: "grid",
        request: { showId: sessionSourceId }
      };
    }

    if (providerId === "mcl") {
      const cinemaCode = firstText(session?.cinema?.sourceId, session?.cinema?.id);
      return {
        supported: Boolean(sessionSourceId && cinemaCode),
        layoutMode: "area-grid",
        request: {
          cinemaCode: cinemaCode ? cinemaCode.replace(/^mcl:/, "") : null,
          sessionId: sessionSourceId
        }
      };
    }

    const scheduleKey = text(session?.purchase?.scheduleKey);
    const cinemaLinkId = firstText(session?.cinema?.sourceId, session?.cinema?.id);
    const hallId = firstText(session?.house?.sourceId, session?.house?.id);
    return {
      supported: Boolean(sessionSourceId && scheduleKey && cinemaLinkId && hallId),
      layoutMode: "positioned",
      request: {
        scheduleId: sessionSourceId,
        scheduleKey,
        cinemaLinkId,
        hallId
      }
    };
  }

  function showtimeMetadata(session) {
    const explicit = {
      formats: uniqueValues(session?.formats, session?.format),
      languages: uniqueValues(session?.languages, session?.language),
      subtitles: uniqueValues(session?.subtitles, session?.subtitle)
    };
    const normalized = window.HKCinemaShowtimeMetadata?.normalizeSession?.(session);
    if (!normalized) return explicit;

    const labels = (kind, labelKey, field) => {
      if (explicit[kind].length) {
        return uniqueItems(explicit[kind].flatMap(value => {
          const item = window.HKCinemaShowtimeMetadata.normalizeSession({ [field]: value });
          const itemKeys = item?.[kind];
          const itemLabels = item?.[labelKey];
          return Array.isArray(itemKeys) && !itemKeys.includes("unknown") && Array.isArray(itemLabels)
            ? itemLabels
            : [value];
        }));
      }

      const keys = normalized?.[kind];
      const values = normalized?.[labelKey];
      return Array.isArray(keys) && !keys.includes("unknown") && Array.isArray(values)
        ? uniqueItems(values)
        : [];
    };

    return {
      formats: labels("formats", "formatLabels", "format"),
      languages: labels("languages", "languageLabels", "language"),
      subtitles: labels("subtitles", "subtitleLabels", "subtitle")
    };
  }

  function showtimeViewModel(providerId, session = {}) {
    const info = provider(providerId);
    const idSource = sourceId(providerId, session);
    const movieSource = firstText(session?.movieSourceId);
    const metadata = showtimeMetadata(session);
    return {
      kind: "showtime",
      schemaVersion: SCHEMA_VERSION,
      provider: info,
      id: normalizedId(providerId, session?.id, idSource),
      sourceId: idSource,
      movieId: firstText(session?.movieId) || (movieSource ? `${providerId}:${movieSource}` : null),
      cinema: cinemaViewModel(session?.cinema || {}, providerId),
      house: houseViewModel(session?.house || {}),
      date: firstText(session?.date),
      time: firstText(session?.time),
      startAt: firstText(session?.startAt, session?.startsAt),
      endAt: firstText(session?.endAt, session?.endsAt),
      metadata,
      price: priceViewModel(session?.price),
      seats: seatSummaryViewModel(session?.seatSummary),
      purchase: purchaseViewModel(session?.purchase),
      bookingUrl: firstText(session?.bookingUrl) || info.bookingUrl,
      seatMap: seatMapRequest(providerId, session)
    };
  }

  function commonSeat(raw, { status, type, providerStatus, providerType, label, row, column, position = null }) {
    return {
      id: firstText(raw?.id, raw?.seatNum, raw?.name),
      label: firstText(label, raw?.label, raw?.seatNum, raw?.columnName, raw?.name),
      row: firstText(row, raw?.rowName, raw?.row),
      column: firstNumber(column, raw?.column, raw?.displayCell, raw?.columnName),
      status,
      type,
      selectable: status === "available" && raw?.selectable !== false,
      areaId: firstText(raw?.areaId, raw?.areaCode),
      areaName: firstText(raw?.areaName, raw?.area),
      position,
      span: firstNumber(raw?.visualSpan) || 1,
      providerStatus: firstText(providerStatus),
      providerType: firstText(providerType)
    };
  }

  function broadwayStatus(value) {
    const status = text(value)?.toLowerCase();
    return SEAT_STATUSES.includes(status) ? status : "unknown";
  }

  function broadwayType(value) {
    const type = text(value)?.toLowerCase();
    if (type === "standard") return "standard";
    if (type === "wheelchair") return "wheelchair";
    return "special";
  }

  function broadwaySeat(raw) {
    return commonSeat(raw, {
      status: broadwayStatus(raw?.status),
      type: broadwayType(raw?.type),
      providerStatus: raw?.status,
      providerType: raw?.providerType || raw?.type,
      label: raw?.label,
      row: raw?.row,
      column: raw?.column
    });
  }

  function mclStatus(value) {
    const status = text(value)?.toLowerCase();
    if (["available", "wheelchair", "sofa-available"].includes(status)) return "available";
    if (["sold", "sofa-sold"].includes(status)) return "sold";
    if (status === "broken") return "blocked";
    return "unknown";
  }

  function mclType(raw) {
    const status = text(raw?.status)?.toLowerCase();
    const style = text(raw?.seatStyle)?.toLowerCase() || "";
    if (status === "wheelchair") return "wheelchair";
    if (status?.startsWith("sofa-") || style.includes("sofa")) return "sofa";
    return "standard";
  }

  function mclSeat(raw) {
    return commonSeat(raw, {
      status: mclStatus(raw?.status),
      type: mclType(raw),
      providerStatus: raw?.upstreamStatus || raw?.status,
      providerType: raw?.seatStyle || raw?.status,
      label: raw?.seatNum,
      row: raw?.rowName || raw?.row,
      column: raw?.column ?? raw?.displayCell
    });
  }

  function emperorStatus(value) {
    const status = text(value)?.toLowerCase();
    if (status === "available") return "available";
    if (status === "unavailable") return "unavailable";
    if (status === "disabled" || status === "isolation") return "blocked";
    return "unknown";
  }

  function emperorType(value) {
    const type = text(value)?.toLowerCase();
    if (["general", "single"].includes(type)) return "standard";
    if (type === "wheelchair" || type === "wheelchair-area") return "wheelchair";
    if (["double", "couple", "double-armchair"].includes(type)) return "couple";
    if (type === "extended-recliner") return "recliner";
    if (type === "vibrate") return "motion";
    return "special";
  }

  function emperorSeat(raw) {
    const position = raw?.position ? {
      left: finite(raw.position.left),
      top: finite(raw.position.top),
      relativeLeftPercent: finite(raw.position.relativeLeftPercent),
      relativeTopPercent: finite(raw.position.relativeTopPercent),
      rotate: finite(raw.position.rotate)
    } : null;
    return commonSeat(raw, {
      status: emperorStatus(raw?.status),
      type: emperorType(raw?.type),
      providerStatus: raw?.status,
      providerType: raw?.type,
      label: raw?.columnName || raw?.name,
      row: raw?.rowName || raw?.row,
      column: raw?.column ?? raw?.columnName,
      position
    });
  }

  function cell(kind, { label = null, index = null, seat = null } = {}) {
    return { kind, label: text(label), index: finite(index), seat };
  }

  function rowViewModel(label, cells, seats) {
    return {
      label: text(label),
      cells,
      seats
    };
  }

  function broadwayRows(rows = []) {
    return rows.map(row => {
      const seats = (row?.seats || []).map(broadwaySeat).sort((a, b) => (a.column ?? 0) - (b.column ?? 0));
      const numeric = seats.map(seat => seat.column).filter(Number.isFinite);
      if (!numeric.length) {
        return rowViewModel(row?.name, seats.map(seat => cell("seat", { seat })), seats);
      }
      const byColumn = new Map(seats.map(seat => [seat.column, seat]));
      const min = Math.min(...numeric);
      const max = Math.max(...numeric);
      const cells = [];
      for (let column = min; column <= max; column += 1) {
        const seat = byColumn.get(column);
        cells.push(seat ? cell("seat", { index: column, seat }) : cell("gap", { index: column }));
      }
      return rowViewModel(row?.name, cells, seats);
    });
  }

  function mclCell(raw) {
    if (raw?.type === "seat" && raw?.seat) {
      return cell("seat", { index: raw?.cellIndex, seat: mclSeat(raw.seat) });
    }
    if (raw?.type === "label") {
      return cell("label", { label: raw?.text, index: raw?.cellIndex });
    }
    return cell("gap", { index: raw?.cellIndex });
  }

  function commonArea(raw = {}) {
    return {
      id: firstText(raw?.id, raw?.areaId),
      name: firstText(raw?.name, raw?.areaName),
      color: firstText(raw?.color),
      price: firstNumber(raw?.price),
      lowestPrice: firstNumber(raw?.lowestPrice)
    };
  }

  function bounds(raw = {}) {
    return {
      minLeft: finite(raw?.minLeft),
      maxLeft: finite(raw?.maxLeft),
      minTop: finite(raw?.minTop),
      maxTop: finite(raw?.maxTop),
      width: finite(raw?.width),
      height: finite(raw?.height)
    };
  }

  function metrics(raw = {}) {
    return {
      totalColumns: finite(raw?.totalColumns),
      cellColumns: finite(raw?.cellColumns),
      ratioLeft: finite(raw?.ratioLeft),
      ratioTop: finite(raw?.ratioTop),
      minRow: finite(raw?.minRow),
      maxRow: finite(raw?.maxRow),
      minColumn: finite(raw?.minColumn),
      maxColumn: finite(raw?.maxColumn),
      pitch: finite(raw?.pitch)
    };
  }

  function section({ id = null, name = null, sectionBounds = {}, sectionMetrics = {}, areas = [], rows = [], seats = [] }) {
    return {
      id: text(id),
      name: text(name),
      bounds: bounds(sectionBounds),
      metrics: metrics(sectionMetrics),
      areas,
      rows,
      seats
    };
  }

  function exactSeatSummary(sections) {
    const seats = sections.flatMap(item => item.seats || []);
    const count = status => seats.filter(seat => seat.status === status).length;
    const unavailable = count("unavailable");
    const held = count("held");
    const sold = count("sold");
    const blocked = count("blocked");
    const unknown = count("unknown");
    const occupied = unavailable + held + sold + blocked + unknown;
    return {
      quality: "exact",
      total: seats.length,
      available: count("available"),
      held,
      sold,
      blocked,
      unavailable,
      unknown,
      accessibleAvailable: seats.filter(seat => seat.status === "available" && seat.type === "wheelchair").length,
      occupiedPercent: seats.length ? Number(((occupied / seats.length) * 100).toFixed(1)) : null,
      updatedAt: null
    };
  }

  function seatMapShell(providerId, raw, layoutMode, sessionIdValue, sections, screenLabel, notices = [], session = null) {
    const summary = exactSeatSummary(sections);
    summary.updatedAt = firstText(raw?.updatedAt, raw?.source?.updatedAt);
    const showtime = session?.kind === "showtime"
      ? session
      : session
        ? showtimeViewModel(providerId, session)
        : null;
    const rawSessionId = firstText(sessionIdValue, showtime?.sourceId);
    const providerPrefix = `${providerId}:`;
    return {
      kind: "seat-map",
      schemaVersion: SCHEMA_VERSION,
      provider: provider(providerId),
      sessionId: rawSessionId?.startsWith(providerPrefix)
        ? rawSessionId.slice(providerPrefix.length)
        : rawSessionId,
      layoutMode,
      screenLabel: firstText(screenLabel) || "銀幕",
      summary,
      sections,
      notices: uniqueItems(notices),
      purchaseLimit: finite(raw?.maxCanBuy),
      bookingUrl: firstText(showtime?.bookingUrl, raw?.bookingUrl, raw?.sourceUrl),
      showtime,
      source: {
        quality: "exact",
        name: firstText(raw?.source?.parser, raw?.source),
        updatedAt: summary.updatedAt
      }
    };
  }

  function broadwaySeatMap(raw = {}, session = null) {
    const rows = broadwayRows(raw?.rows || []);
    const seats = rows.flatMap(row => row.seats);
    const sections = [section({
      id: "main",
      sectionBounds: raw?.dimensions,
      sectionMetrics: { totalColumns: Math.max(0, ...seats.map(seat => seat.column || 0)) || null },
      rows,
      seats
    })];
    return seatMapShell(
      "broadway",
      raw,
      "grid",
      firstText(raw?.showId, raw?.sourceId),
      sections,
      raw?.screen,
      [],
      session
    );
  }

  function mclSeatMap(raw = {}, session = null) {
    const sections = (raw?.areas || []).map((area, index) => {
      const rows = (area?.rows || []).map(row => {
        const cells = (row?.cells || []).map(mclCell);
        const seats = cells.filter(item => item.kind === "seat" && item.seat).map(item => item.seat);
        return rowViewModel(row?.name, cells, seats);
      });
      return section({
        id: firstText(area?.id, area?.index ?? index),
        name: area?.name,
        sectionMetrics: {
          totalColumns: raw?.totalColumns,
          cellColumns: area?.cellColumns,
          ratioLeft: area?.ratioLeft,
          ratioTop: area?.ratioTop
        },
        rows,
        seats: rows.flatMap(row => row.seats)
      });
    });
    return seatMapShell(
      "mcl",
      raw,
      "area-grid",
      raw?.sessionId,
      sections,
      raw?.screenLabel,
      [],
      session
    );
  }

  function emperorRows(seats) {
    const grouped = new Map();
    for (const seat of seats) {
      const label = seat.row || "";
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label).push(seat);
    }
    return Array.from(grouped, ([label, rowSeats]) => rowViewModel(
      label,
      rowSeats.map(seat => cell("seat", { index: seat.column, seat })),
      rowSeats
    ));
  }

  function emperorSeatMap(raw = {}, session = null) {
    const sections = (raw?.sections || []).map((source, index) => {
      const seats = (source?.seats || []).map(emperorSeat);
      return section({
        id: firstText(source?.id, index),
        name: source?.name,
        sectionBounds: source?.bounds,
        sectionMetrics: source?.grid,
        areas: (source?.areas || []).map(commonArea),
        rows: emperorRows(seats),
        seats
      });
    });
    return seatMapShell(
      "emperor",
      raw,
      "positioned",
      raw?.scheduleId,
      sections,
      "SCREEN",
      [raw?.notice, raw?.filmLevelNotice, raw?.popupNotices],
      session
    );
  }

  const adapters = Object.freeze({
    broadway: Object.freeze({
      movie: (movie, detail) => movieViewModel("broadway", movie, detail),
      showtime: session => showtimeViewModel("broadway", session),
      seatMap: (data, session) => broadwaySeatMap(data, session)
    }),
    mcl: Object.freeze({
      movie: (movie, detail) => movieViewModel("mcl", movie, detail),
      showtime: session => showtimeViewModel("mcl", session),
      seatMap: (data, session) => mclSeatMap(data, session)
    }),
    emperor: Object.freeze({
      movie: (movie, detail) => movieViewModel("emperor", movie, detail),
      showtime: session => showtimeViewModel("emperor", session),
      seatMap: (data, session) => emperorSeatMap(data, session)
    })
  });

  function adapter(providerId) {
    const value = adapters[String(providerId || "").toLowerCase()];
    if (!value) throw new Error(`Unsupported cinema provider: ${providerId}`);
    return value;
  }

  window.HKCinemaViewModels = Object.freeze({
    version: "7b1",
    schemaVersion: SCHEMA_VERSION,
    providers: PROVIDERS,
    seatStatuses: SEAT_STATUSES,
    seatTypes: SEAT_TYPES,
    summaryQualities: SUMMARY_QUALITIES,
    adapters,
    movie(providerId, movie, detail = null) {
      return adapter(providerId).movie(movie, detail);
    },
    showtime(providerId, session) {
      return adapter(providerId).showtime(session);
    },
    seatMap(providerId, data, session = null) {
      return adapter(providerId).seatMap(data, session);
    }
  });
})();
