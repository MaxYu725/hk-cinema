(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const sessionStore = new Map();
  const triggerSessions = new WeakMap();
  const shared = window.HKCinemaSeatMapShared;
  let scheduled = false;

  const delegatedFetch = window.fetch.bind(window);

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function sessionKey(session) {
    const date = String(session?.date || "").slice(0, 10);
    const cinema = normalize(session?.cinema?.name?.zh || session?.cinema?.name?.en);
    const time = String(session?.time || "").trim();
    const house = normalize(session?.house?.name);
    return `${date}|${cinema}|${time}|${house}`;
  }

  function captureShows(data) {
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    for (const session of sessions) {
      const key = sessionKey(session);
      if (!key.includes("||")) sessionStore.set(key, session);
    }
    scheduleEnhance();
  }

  function requestDetails(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const rawUrl = request?.url || String(input || "");
    try {
      return {
        url: new URL(rawUrl, window.location.href),
        method: String(init.method || request?.method || "GET").toUpperCase()
      };
    } catch {
      return null;
    }
  }

  window.fetch = async function emperorSeatMapAwareFetch(input, init = {}) {
    const details = requestDetails(input, init);
    const response = await delegatedFetch(input, init);
    if (
      details?.method === "GET" &&
      details.url.origin === API_BASE &&
      /^\/api\/emperor\/movies\/[^/]+\/shows$/.test(details.url.pathname) &&
      response.ok
    ) {
      response.clone().json().then(result => {
        if (result?.ok && result?.data) captureShows(result.data);
      }).catch(() => {});
    }
    return response;
  };

  function activeDateFor(card) {
    if (card.matches(".emperor-showtime-card")) {
      return document.querySelector('[data-detail-provider="emperor"][data-detail-date].active')?.dataset?.detailDate || null;
    }
    return document.querySelector("[data-provider-compare-date].active")?.dataset?.providerCompareDate || null;
  }

  function cardParts(card) {
    const date = activeDateFor(card);
    const time = card.querySelector(".showtime-time, .provider-compare-show-time")?.textContent?.trim() || "";
    let cinema = "";
    let secondary = "";
    if (card.matches(".emperor-showtime-card")) {
      cinema = card.closest(".cinema-group")?.querySelector(".cinema-group-heading h3")?.textContent?.trim() || "";
      secondary = Array.from(card.querySelectorAll("p"))
        .find(node => !node.classList.contains("emperor-ticket-prices"))
        ?.textContent?.trim() || "";
    } else {
      cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "";
      secondary = card.querySelector(".provider-compare-show-main p")?.textContent?.trim() || "";
    }
    return { date, time, cinema, house: secondary.split(" · ")[0]?.trim() || "" };
  }

  function findSession(card) {
    const stored = window.HKCinemaMovieDetail?.showtimeFor?.(card);
    if (stored?.seatMap?.request) {
      const request = stored.seatMap.request;
      return {
        sourceId: request.scheduleId || stored.sourceId,
        date: stored.date,
        time: stored.time,
        cinema: {
          sourceId: request.cinemaLinkId || stored.cinema?.sourceId,
          name: { zh: stored.cinema?.name?.zh || stored.cinema?.name?.display, en: stored.cinema?.name?.en }
        },
        house: { sourceId: request.hallId || stored.house?.sourceId, name: stored.house?.name },
        format: stored.metadata?.formats?.[0],
        language: stored.metadata?.languages?.[0],
        bookingUrl: stored.bookingUrl,
        purchase: { ...stored.purchase, scheduleKey: request.scheduleKey }
      };
    }

    const parts = cardParts(card);
    const exact = `${parts.date || ""}|${normalize(parts.cinema)}|${parts.time}|${normalize(parts.house)}`;
    if (sessionStore.has(exact)) return sessionStore.get(exact);
    const candidates = Array.from(sessionStore.values()).filter(session => {
      if (parts.date && String(session?.date || "").slice(0, 10) !== parts.date) return false;
      if (String(session?.time || "") !== parts.time) return false;
      if (normalize(session?.cinema?.name?.zh || session?.cinema?.name?.en) !== normalize(parts.cinema)) return false;
      if (parts.house && normalize(session?.house?.name) !== normalize(parts.house)) return false;
      return true;
    });
    return candidates.length === 1 ? candidates[0] : null;
  }

  function hasSeatMapIdentifiers(session) {
    const request = session?.seatMap?.request || {};
    return Boolean(
      (request.scheduleKey || session?.purchase?.scheduleKey) &&
      (request.scheduleId || session?.sourceId) &&
      (request.cinemaLinkId || session?.cinema?.sourceId) &&
      (request.hallId || session?.house?.sourceId)
    );
  }

  function prepareTrigger(seatNode, session) {
    if (!seatNode || !hasSeatMapIdentifiers(session) || seatNode.dataset.emperorSeatmapReady === "true") return;
    seatNode.dataset.emperorSeatmapReady = "true";
    shared?.prepareTrigger(seatNode, {
      provider: "emperor",
      label: `查看 ${session?.cinema?.name?.zh || "Emperor"} ${session?.time || ""} 座位圖`
    });
    triggerSessions.set(seatNode, session);
  }

  function enhance() {
    scheduled = false;
    document.querySelectorAll(".emperor-showtime-card").forEach(card => {
      const session = findSession(card);
      if (session) prepareTrigger(card.querySelector(".seat-pill"), session);
    });
    document.querySelectorAll(".provider-compare-show").forEach(card => {
      if (!card.querySelector(".provider-compare-source.emperor")) return;
      const session = findSession(card);
      if (session) prepareTrigger(card.querySelector(".provider-compare-seat"), session);
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function mapKey(session) {
    const request = session?.seatMap?.request || {};
    return [
      request.scheduleId || session?.sourceId,
      request.scheduleKey || session?.purchase?.scheduleKey,
      request.cinemaLinkId || session?.cinema?.sourceId,
      request.hallId || session?.house?.sourceId
    ].join("|");
  }

  async function fetchSeatMap(session, signal) {
    const request = session?.seatMap?.request || {};
    const scheduleId = String(request.scheduleId || session?.sourceId || "").replace(/^emperor:/, "");
    const scheduleKey = String(request.scheduleKey || session?.purchase?.scheduleKey || "");
    const cinemaLinkId = String(request.cinemaLinkId || session?.cinema?.sourceId || "");
    const hallId = String(request.hallId || session?.house?.sourceId || "");
    if (!scheduleId || !scheduleKey || !cinemaLinkId || !hallId) {
      throw new Error("此場次缺少 Emperor SeatMap 識別資料");
    }
    const url = new URL(`/api/emperor/shows/${encodeURIComponent(scheduleId)}/seats`, API_BASE);
    url.searchParams.set("scheduleKey", scheduleKey);
    url.searchParams.set("cinemaLinkId", cinemaLinkId);
    url.searchParams.set("hallId", hallId);
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal,
      headers: { Accept: "application/json" }
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Emperor SeatMap HTTP ${response.status}`);
    }
    if (!response.ok || !result?.ok || !result?.data) {
      throw new Error(result?.error?.message || `Emperor SeatMap HTTP ${response.status}`);
    }
    return result.data;
  }

  function open(session, force = false, trigger = null) {
    if (!hasSeatMapIdentifiers(session)) return false;
    const showtime = session?.kind === "showtime"
      ? session
      : window.HKCinemaViewModels.showtime("emperor", session);
    return shared?.open({
      provider: "emperor",
      key: mapKey(session),
      trigger,
      showtime,
      bookingUrl: showtime?.bookingUrl || session?.bookingUrl,
      force,
      load: signal => fetchSeatMap(session, signal),
      adapt: data => window.HKCinemaViewModels.seatMap("emperor", data, showtime)
    });
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest?.(".emperor-seatmap-launch");
    if (!trigger) return;
    const session = triggerSessions.get(trigger);
    if (!session) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    open(session, false, trigger);
  }, true);

  document.addEventListener("auxclick", event => {
    const trigger = event.target.closest?.(".emperor-seatmap-launch");
    if (!trigger) return;
    const session = triggerSessions.get(trigger);
    if (!session) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    open(session, false, trigger);
  }, true);

  document.addEventListener("keydown", event => {
    const trigger = event.target.closest?.(".emperor-seatmap-launch");
    if (!trigger || !shared?.isActivationKey(event)) return;
    const session = triggerSessions.get(trigger);
    if (!session) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    open(session, false, trigger);
  }, true);

  const observer = new MutationObserver(scheduleEnhance);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleEnhance();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleEnhance();
    }, { once: true });
  }

  window.HKCinemaEmperorSeatMap = Object.freeze({
    open,
    close: () => shared?.close(),
    refresh: scheduleEnhance,
    getStats() {
      return {
        capturedSessions: sessionStore.size,
        ...shared?.getStats("emperor")
      };
    }
  });
})();
