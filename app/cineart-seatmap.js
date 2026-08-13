(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const shared = window.HKCinemaSeatMapShared;

  function triggerFromEvent(event) {
    const node = event.target.closest?.(".provider-compare-show[data-provider='cineart'] .provider-compare-seat");
    if (!node) return null;
    const card = node.closest(".provider-compare-show[data-provider='cineart']");
    const showId = String(card?.dataset?.showtimeId || "").replace(/^cineart:/, "");
    return /^\d+$/.test(showId) ? { node, card, showId } : null;
  }

  function movieSourceId(card) {
    const value = String(card?.dataset?.movieSourceId || "").replace(/^cineart:/, "");
    return /^\d+$/.test(value) ? value : null;
  }

  function cardText(card, selector) {
    return card?.querySelector(selector)?.textContent?.trim() || "";
  }

  function showtimeFor(card, showId) {
    const cinema = cardText(card, ".provider-compare-show-topline strong") || "CineArt 戲院";
    const secondary = cardText(card, ".provider-compare-show-main p");
    return window.HKCinemaViewModels?.showtime?.("cineart", {
      sourceId: showId,
      movieSourceId: movieSourceId(card),
      date: document.querySelector("[data-provider-compare-date].active")?.dataset?.providerCompareDate || null,
      time: cardText(card, ".provider-compare-show-time"),
      cinema: { name: { zh: cinema } },
      house: { name: secondary.split(" · ")[0]?.trim() || null },
      bookingUrl: null
    }) || null;
  }

  async function fetchSeatMap(showId, movieId, signal) {
    const query = movieId ? `?movieSourceId=${encodeURIComponent(movieId)}` : "";
    const response = await fetch(
      `${API_BASE}/api/cineart/shows/${encodeURIComponent(showId)}/seats${query}`,
      { cache: "no-store", signal, headers: { Accept: "application/json" } }
    );
    let result = null;
    try { result = await response.json(); } catch { throw new Error(`CineArt 座位圖 HTTP ${response.status}`); }
    if (!response.ok || result?.ok !== true || !result?.data) {
      throw new Error(result?.error?.message || `CineArt 座位圖 HTTP ${response.status}`);
    }
    return result.data;
  }

  function openSeatMap(trigger, force = false) {
    const card = trigger?.closest?.(".provider-compare-show[data-provider='cineart']");
    const showId = String(card?.dataset?.showtimeId || "").replace(/^cineart:/, "");
    if (!card || !/^\d+$/.test(showId)) return false;
    const movieId = movieSourceId(card);
    const showtime = showtimeFor(card, showId);
    return shared?.open({
      provider: "cineart",
      key: showId,
      trigger,
      showtime,
      bookingUrl: null,
      force,
      load: signal => fetchSeatMap(showId, movieId, signal),
      adapt: data => window.HKCinemaViewModels.seatMap("cineart", data, showtime)
    });
  }

  document.addEventListener("click", event => {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openSeatMap(trigger.node);
  }, true);

  document.addEventListener("auxclick", event => {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openSeatMap(trigger.node);
  }, true);

  document.addEventListener("keydown", event => {
    const trigger = triggerFromEvent(event);
    if (!trigger || !shared?.isActivationKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    openSeatMap(trigger.node);
  }, true);

  window.HKCinemaCineArtSeatMap = Object.freeze({
    open: openSeatMap,
    getStats: () => shared?.getStats("cineart")
  });
})();
