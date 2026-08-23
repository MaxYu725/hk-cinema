(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const shared = window.HKCinemaSeatMapShared;
  let scheduled = false;

  function cardUrl(card) {
    return card?.dataset?.bookingUrl || card?.getAttribute("href") || "";
  }

  function sessionParams(card) {
    try {
      const url = new URL(cardUrl(card), location.href);
      return {
        sessionId: url.searchParams.get("si") || String(card?.dataset?.showtimeId || "").replace(/^mcl:/, ""),
        cinemaCode: url.searchParams.get("ci") || url.searchParams.get("cinemaCode"),
        bookingUrl: url.href
      };
    } catch {
      return null;
    }
  }

  function isMCLCard(card) {
    return Boolean(card?.matches(".provider-compare-show") && card.querySelector(".provider-compare-source.mcl"));
  }

  function cardText(card, selector) {
    return card?.querySelector(selector)?.textContent?.trim() || "";
  }

  function showtimeFor(card, params) {
    const cinema = cardText(card, ".provider-compare-show-topline strong") || "MCL 戲院";
    const secondary = cardText(card, ".provider-compare-show-main p");
    return window.HKCinemaViewModels?.showtime("mcl", {
      sourceId: params.sessionId,
      date: document.querySelector("[data-provider-compare-date].active")?.dataset?.providerCompareDate || null,
      time: cardText(card, ".showtime-time, .provider-compare-show-time"),
      cinema: { sourceId: params.cinemaCode, name: { zh: cinema } },
      house: { name: secondary.split(" · ")[0]?.trim() || null },
      bookingUrl: params.bookingUrl
    });
  }

  async function fetchSeatMap(params, signal) {
    const response = await fetch(
      `${API_BASE}/api/mcl/shows/${encodeURIComponent(params.sessionId)}/seats?cinemaCode=${encodeURIComponent(params.cinemaCode)}`,
      { cache: "no-store", signal, headers: { Accept: "application/json" } }
    );
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`MCL 座位圖 HTTP ${response.status}`);
    }
    if (!response.ok || !result?.ok || !result?.data) {
      throw new Error(result?.error?.message || `MCL 座位圖 HTTP ${response.status}`);
    }
    return result.data;
  }

  function openSeatMap(trigger, force = false) {
    const card = trigger?.closest(".provider-compare-show");
    const params = sessionParams(card);
    if (!card || !isMCLCard(card) || !params?.sessionId || !params?.cinemaCode) return false;
    const showtime = showtimeFor(card, params);
    return shared?.open({
      provider: "mcl",
      key: `${params.cinemaCode}:${params.sessionId}`,
      trigger,
      showtime,
      bookingUrl: params.bookingUrl,
      force,
      load: signal => fetchSeatMap(params, signal),
      adapt: data => window.HKCinemaViewModels.seatMap("mcl", data, showtime)
    });
  }

  function prepareTrigger(node, card) {
    if (!node || !card || node.dataset.mclSeatmapReady === "true") return;
    const params = sessionParams(card);
    if (!isMCLCard(card) || !params?.sessionId || !params?.cinemaCode) return;
    const time = cardText(card, ".showtime-time, .provider-compare-show-time");
    const cinema = cardText(card, ".provider-compare-show-topline strong") || "MCL";
    node.dataset.mclSeatmapReady = "true";
    shared?.prepareTrigger(node, { provider: "mcl", label: `查看 ${cinema} ${time} MCL 座位圖` });
  }

  function enhance() {
    scheduled = false;
    document.querySelectorAll(".provider-compare-show .provider-compare-seat").forEach(node => {
      prepareTrigger(node, node.closest(".provider-compare-show"));
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function triggerFromEvent(event) {
    return event.target.closest?.(".mcl-seatmap-launch");
  }

  document.addEventListener("click", event => {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSeatMap(trigger);
  }, true);

  document.addEventListener("auxclick", event => {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSeatMap(trigger);
  }, true);

  document.addEventListener("keydown", event => {
    const trigger = triggerFromEvent(event);
    if (!trigger || !shared?.isActivationKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSeatMap(trigger);
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

  window.HKCinemaMCLSeatMap = Object.freeze({
    open: openSeatMap,
    getStats: () => shared?.getStats("mcl")
  });
})();
