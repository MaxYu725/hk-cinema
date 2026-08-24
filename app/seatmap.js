(() => {
  const shared = window.HKCinemaSeatMapShared;
  let scheduled = false;

  function cardUrl(card) {
    return card?.dataset?.bookingUrl || card?.getAttribute("href") || "";
  }

  function getShowId(card) {
    const explicit = String(card?.dataset?.showtimeId || "").replace(/^broadway:/, "");
    if (explicit) return explicit;
    const match = cardUrl(card).match(/\/show\/(\d+)/);
    return match ? match[1] : null;
  }

  function isBroadwayCard(card) {
    return Boolean(card?.matches(".provider-compare-show") && card.querySelector(".provider-compare-source.broadway"));
  }

  function cardText(card, selector) {
    return card?.querySelector(selector)?.textContent?.trim() || "";
  }

  function showtimeFor(card, showId) {
    const cinema = cardText(card, ".provider-compare-show-topline strong") || "Broadway 戲院";
    const secondary = cardText(card, ".provider-compare-show-main p");
    return window.HKCinemaViewModels?.showtime("broadway", {
      sourceId: showId,
      date: document.querySelector("[data-provider-compare-date].active")?.dataset?.providerCompareDate || null,
      time: cardText(card, ".showtime-time, .provider-compare-show-time"),
      cinema: { name: { zh: cinema } },
      house: { name: secondary.split(" · ")[0]?.trim() || null },
      bookingUrl: cardUrl(card)
    });
  }

  async function fetchSeatMap(showId, signal) {
    const result = await window.HKCinemaApiClient?.get?.(
      `/api/broadway/shows/${encodeURIComponent(showId)}/seats`,
      { signal }
    );
    if (!result?.data) throw new Error("Broadway 座位圖回應無效");
    return result.data;
  }

  function openSeatMap(trigger, force = false) {
    const card = trigger?.closest(".provider-compare-show");
    const showId = getShowId(card);
    if (!card || !showId || !isBroadwayCard(card)) return false;
    const showtime = showtimeFor(card, showId);
    return shared?.open({
      provider: "broadway",
      key: showId,
      trigger,
      showtime,
      bookingUrl: cardUrl(card),
      force,
      load: signal => fetchSeatMap(showId, signal),
      adapt: data => window.HKCinemaViewModels.seatMap("broadway", data, showtime)
    });
  }

  function prepareTrigger(node, card) {
    if (!node || !card || node.dataset.broadwaySeatmapReady === "true") return;
    if (!isBroadwayCard(card) || !getShowId(card)) return;
    const time = cardText(card, ".showtime-time, .provider-compare-show-time");
    const cinema = cardText(card, ".provider-compare-show-topline strong") || "Broadway";
    node.dataset.broadwaySeatmapReady = "true";
    shared?.prepareTrigger(node, { provider: "broadway", label: `查看 ${cinema} ${time} Broadway 座位圖` });
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
    return event.target.closest?.(".broadway-seatmap-launch");
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

  window.HKCinemaBroadwaySeatMap = Object.freeze({
    open: openSeatMap,
    getStats: () => shared?.getStats("broadway")
  });
})();
