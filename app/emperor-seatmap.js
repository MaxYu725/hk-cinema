(() => {
  const sessionStore = new Map();
  const triggerSessions = new WeakMap();
  const shared = window.HKCinemaSeatMapShared;
  let scheduled = false;

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

  function captureStoreSessions() {
    const sessions = window.HKCinemaComparisonStore?.getState?.().sessions || [];
    sessionStore.clear();
    captureShows({ sessions: sessions.filter(session => session?.provider === "emperor") });
  }

  window.addEventListener("hkcinema:comparison-store-change", captureStoreSessions);
  captureStoreSessions();

  function activeDateFor() {
    return document.querySelector("[data-provider-compare-date].active")?.dataset?.providerCompareDate || null;
  }

  function cardParts(card) {
    const date = activeDateFor();
    const time = card.querySelector(".showtime-time, .provider-compare-show-time")?.textContent?.trim() || "";
    const cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "";
    const secondary = card.querySelector(".provider-compare-show-main p")?.textContent?.trim() || "";
    return { date, time, cinema, house: secondary.split(" · ")[0]?.trim() || "" };
  }

  function findSession(card) {
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
    const result = await window.HKCinemaApiClient?.get?.(
      `/api/emperor/shows/${encodeURIComponent(scheduleId)}/seats`,
      { query: { scheduleKey, cinemaLinkId, hallId }, signal }
    );
    if (!result?.data) throw new Error("Emperor SeatMap 回應無效");
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
