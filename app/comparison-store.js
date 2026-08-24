(() => {
  const DEFAULT_FILTERS = Object.freeze({
    provider: "all",
    language: "all",
    subtitle: "all",
    format: "all",
    region: "all",
    district: "all",
    cinema: "all",
    period: "all",
    price: "all",
    seats: "all",
    sort: "time"
  });
  const FILTER_KEYS = Object.freeze(Object.keys(DEFAULT_FILTERS));
  const HK_TIME_ZONE = "Asia/Hong_Kong";

  let state = {
    matchId: null,
    selectedDate: null,
    sessions: [],
    filters: { ...DEFAULT_FILTERS },
    revision: 0
  };

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function timeMinutes(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function values(input, fallback = "unknown") {
    const list = Array.isArray(input) ? input : String(input || "").split(",");
    const normalized = list.map(value => String(value || "").trim()).filter(Boolean);
    return normalized.length ? Array.from(new Set(normalized)) : [fallback];
  }

  function seatRecord(session) {
    const available = finite(session?.seatAvailable ?? session?.seats?.available);
    const total = finite(session?.seatTotal ?? session?.seats?.total);
    if (available === null || total === null || total <= 0 || available < 0 || available > total) return null;
    return { available, total, ratio: available / total };
  }

  function stableId(session, index) {
    const explicit = String(session?.comparisonId || session?.id || "").trim();
    if (explicit) return explicit;
    const parts = [
      session?.provider || "unknown",
      session?.sourceId || session?.movieSourceId || "session",
      session?.time || "--:--",
      session?.cinemaName || session?.cinema || index
    ];
    return parts.map(value => String(value).normalize("NFKC").trim()).join(":");
  }

  function cinemaRecord(provider, cinema) {
    const registry = window.HKCinemaCinemaRegistry;
    const fallback = { provider, canonical: cinema, region: "unknown", district: null };
    const resolved = registry?.resolve?.(provider, cinema) || fallback;
    const canonical = resolved.canonical || cinema || "未知戲院";
    const normalized = registry?.normalize?.(canonical) || String(canonical).normalize("NFKC").toLowerCase().trim();
    return {
      provider,
      canonical,
      region: resolved.region || "unknown",
      district: resolved.district || null,
      key: `${provider}:${normalized}`
    };
  }

  function normalizeSession(session, index = 0) {
    const provider = String(session?.provider || "unknown").trim().toLowerCase() || "unknown";
    const cinema = String(session?.cinemaName || session?.cinema || "戲院").trim() || "戲院";
    const cinemaMeta = cinemaRecord(provider, cinema);
    const time = String(session?.time || "--:--").trim() || "--:--";
    const seats = seatRecord(session);
    return Object.freeze({
      ...session,
      id: stableId(session, index),
      comparisonId: stableId(session, index),
      index,
      provider,
      providerLabel: String(session?.providerLabel || provider || "院線"),
      time,
      timeMinutes: timeMinutes(time),
      cinema,
      cinemaName: cinema,
      cinemaMeta,
      cinemaKey: cinemaMeta.key,
      canonicalCinema: cinemaMeta.canonical,
      region: cinemaMeta.region,
      district: cinemaMeta.district,
      price: finite(session?.price),
      languages: values(session?.languages || session?.metadata?.languages),
      subtitles: values(session?.subtitles || session?.metadata?.subtitles),
      formats: values(session?.formats || session?.metadata?.formats),
      seats,
      seatAvailable: seats?.available ?? null,
      seatTotal: seats?.total ?? null,
      seatRatio: seats?.ratio ?? null
    });
  }

  function cloneSession(session) {
    const metadata = session.metadata ? {
      ...session.metadata,
      languages: Array.isArray(session.metadata.languages) ? [...session.metadata.languages] : session.metadata.languages,
      subtitles: Array.isArray(session.metadata.subtitles) ? [...session.metadata.subtitles] : session.metadata.subtitles,
      formats: Array.isArray(session.metadata.formats) ? [...session.metadata.formats] : session.metadata.formats,
      languageLabels: Array.isArray(session.metadata.languageLabels) ? [...session.metadata.languageLabels] : session.metadata.languageLabels,
      subtitleLabels: Array.isArray(session.metadata.subtitleLabels) ? [...session.metadata.subtitleLabels] : session.metadata.subtitleLabels,
      formatLabels: Array.isArray(session.metadata.formatLabels) ? [...session.metadata.formatLabels] : session.metadata.formatLabels
    } : session.metadata;
    return {
      ...session,
      languages: [...session.languages],
      subtitles: [...session.subtitles],
      formats: [...session.formats],
      cinemaMeta: { ...session.cinemaMeta },
      seats: session.seats ? { ...session.seats } : null,
      metadata,
      pricePayload: session.pricePayload ? { ...session.pricePayload } : session.pricePayload,
      seatSummary: session.seatSummary ? { ...session.seatSummary } : session.seatSummary
    };
  }

  function snapshot() {
    return {
      matchId: state.matchId,
      selectedDate: state.selectedDate,
      sessions: state.sessions.map(cloneSession),
      filters: { ...state.filters },
      revision: state.revision
    };
  }

  function emit(reason) {
    window.dispatchEvent(new CustomEvent("hkcinema:comparison-store-change", {
      detail: {
        reason,
        revision: state.revision,
        matchId: state.matchId,
        selectedDate: state.selectedDate
      }
    }));
  }

  function publish({ matchId = null, selectedDate = null, sessions = [] } = {}) {
    const seen = new Map();
    const normalized = (sessions || []).map((session, index) => {
      const record = normalizeSession(session, index);
      const count = seen.get(record.id) || 0;
      seen.set(record.id, count + 1);
      return count ? Object.freeze({ ...record, id: `${record.id}:${count}`, comparisonId: `${record.id}:${count}` }) : record;
    });
    state = {
      ...state,
      matchId: matchId || null,
      selectedDate: selectedDate || null,
      sessions: normalized,
      revision: state.revision + 1
    };
    emit("sessions");
    return state.sessions.map(cloneSession);
  }

  function sanitizeFilters(patch = {}) {
    const next = { ...state.filters };
    for (const key of FILTER_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const value = String(patch[key] || DEFAULT_FILTERS[key]);
      next[key] = value || DEFAULT_FILTERS[key];
    }
    return next;
  }

  function setFilters(patch = {}, reason = "filters") {
    const filters = sanitizeFilters(patch);
    const changed = FILTER_KEYS.some(key => filters[key] !== state.filters[key]);
    if (!changed) return { ...state.filters };
    state = { ...state, filters, revision: state.revision + 1 };
    emit(reason);
    return { ...state.filters };
  }

  function resetFilters() {
    return setFilters(DEFAULT_FILTERS, "filters-reset");
  }

  function patchSession(id, patch = {}, reason = "enrichment") {
    const key = String(id || "").trim();
    if (!key) return false;
    const index = state.sessions.findIndex(session => session.id === key);
    if (index < 0) return false;
    const current = state.sessions[index];
    const nextInput = { ...current, ...patch };
    if (patch.seats) {
      nextInput.seatAvailable = patch.seats.available;
      nextInput.seatTotal = patch.seats.total;
    }
    const next = normalizeSession(nextInput, current.index);
    const sessions = state.sessions.slice();
    sessions[index] = Object.freeze({ ...next, id: current.id, comparisonId: current.id });
    state = { ...state, sessions, revision: state.revision + 1 };
    emit(reason);
    return true;
  }

  function hongKongClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: HK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      minutes: Number(values.hour) * 60 + Number(values.minute)
    };
  }

  function priceLimit(filters) {
    const match = String(filters.price || "").match(/^lte-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function matchesSession(session, filters = DEFAULT_FILTERS, context = {}, ignore = new Set()) {
    const criteria = { ...DEFAULT_FILTERS, ...filters };
    const clock = context.clock || hongKongClock(context.now);
    const period = criteria.period;
    let periodMatches = true;
    if (period === "morning") periodMatches = Number.isFinite(session.timeMinutes) && session.timeMinutes < 12 * 60;
    else if (period === "afternoon") periodMatches = Number.isFinite(session.timeMinutes) && session.timeMinutes >= 12 * 60 && session.timeMinutes < 18 * 60;
    else if (period === "evening") periodMatches = Number.isFinite(session.timeMinutes) && session.timeMinutes >= 18 * 60;
    else if (period === "next2h") periodMatches = context.selectedDate === clock.date && Number.isFinite(session.timeMinutes) && session.timeMinutes >= clock.minutes && session.timeMinutes <= clock.minutes + 120;

    const limit = priceLimit(criteria);
    const priceMatches = !Number.isFinite(limit) || (Number.isFinite(session.price) && session.price <= limit);
    let seatsMatch = true;
    if (criteria.seats === "known") seatsMatch = Boolean(session.seats);
    else if (criteria.seats === "available") seatsMatch = Boolean(session.seats && session.seats.available > 0);
    else if (criteria.seats === "roomy") seatsMatch = Boolean(session.seats && session.seats.available > 0 && session.seats.ratio >= 0.5);

    return (
      (ignore.has("provider") || criteria.provider === "all" || session.provider === criteria.provider) &&
      (ignore.has("language") || criteria.language === "all" || session.languages.includes(criteria.language)) &&
      (ignore.has("subtitle") || criteria.subtitle === "all" || session.subtitles.includes(criteria.subtitle)) &&
      (ignore.has("format") || criteria.format === "all" || session.formats.includes(criteria.format)) &&
      (ignore.has("region") || criteria.region === "all" || session.region === criteria.region) &&
      (ignore.has("district") || criteria.district === "all" || session.district === criteria.district) &&
      (ignore.has("cinema") || criteria.cinema === "all" || session.cinemaKey === criteria.cinema) &&
      (ignore.has("period") || periodMatches) &&
      (ignore.has("price") || priceMatches) &&
      (ignore.has("seats") || seatsMatch)
    );
  }

  function compareSessions(a, b, filters) {
    if (filters.sort === "price") {
      const ap = Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
      const bp = Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
      return ap - bp || (a.timeMinutes ?? Number.MAX_SAFE_INTEGER) - (b.timeMinutes ?? Number.MAX_SAFE_INTEGER) || a.index - b.index;
    }
    if (filters.sort === "seats") {
      const ah = Number.isFinite(a.seatRatio);
      const bh = Number.isFinite(b.seatRatio);
      if (ah !== bh) return ah ? -1 : 1;
      if (ah && bh) return b.seatRatio - a.seatRatio || b.seatAvailable - a.seatAvailable || (a.timeMinutes ?? Number.MAX_SAFE_INTEGER) - (b.timeMinutes ?? Number.MAX_SAFE_INTEGER) || a.index - b.index;
    }
    return (a.timeMinutes ?? Number.MAX_SAFE_INTEGER) - (b.timeMinutes ?? Number.MAX_SAFE_INTEGER) || a.index - b.index;
  }

  function selectSessions({ sessions = state.sessions, filters = state.filters, ignore = [], now, selectedDate = state.selectedDate } = {}) {
    const safeFilters = { ...DEFAULT_FILTERS, ...filters };
    const ignored = ignore instanceof Set ? ignore : new Set(ignore || []);
    return sessions
      .filter(session => matchesSession(session, safeFilters, { now, selectedDate }, ignored))
      .slice()
      .sort((a, b) => compareSessions(a, b, safeFilters))
      .map(cloneSession);
  }

  window.addEventListener("hkcinema:compare-price", event => {
    const detail = event.detail || {};
    const adult = finite(detail.adult);
    if (!detail.comparisonSessionId || adult === null) return;
    patchSession(detail.comparisonSessionId, {
      price: adult,
      pricePayload: {
        adult,
        student: finite(detail.student),
        child: finite(detail.child),
        senior: finite(detail.senior)
      }
    }, "price");
  });

  function patchSeatsFromEvent(event) {
    const detail = event.detail || {};
    if (!detail.comparisonSessionId) return;
    patchSession(detail.comparisonSessionId, {
      seats: { available: finite(detail.available), total: finite(detail.total) },
      seatAvailable: finite(detail.available),
      seatTotal: finite(detail.total),
      seatSummary: {
        available: finite(detail.available),
        total: finite(detail.total),
        sold: finite(detail.sold),
        blocked: finite(detail.blocked)
      }
    }, "seats");
  }

  window.addEventListener("hkcinema:compare-seat-summary", patchSeatsFromEvent);
  window.addEventListener("hkcinema:compare-seat-summary-normalized", patchSeatsFromEvent);

  window.HKCinemaComparisonStore = Object.freeze({
    version: "c4-1",
    DEFAULT_FILTERS,
    publish,
    patchSession,
    setFilters,
    resetFilters,
    getState: snapshot,
    selectSessions,
    matchesSession,
    normalizeSession,
    hongKongClock
  });
})();
