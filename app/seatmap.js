(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_TTL_MS = 30 * 1000;
  const REQUEST_TIMEOUT_MS = 12000;

  const shared = window.HKCinemaSeatMapShared;
  const cache = new Map();

  let generation = 0;
  let controller = null;
  let scheduled = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cardUrl(card) {
    return card?.getAttribute("href") || card?.dataset?.bookingUrl || "";
  }

  function getShowId(card) {
    const match = cardUrl(card).match(/\/show\/(\d+)/);
    return match ? match[1] : null;
  }

  function isBroadwayCard(card) {
    if (!card) return false;
    if (card.matches(".provider-compare-show")) {
      return Boolean(card.querySelector(".provider-compare-source.broadway"));
    }
    return card.matches(".showtime-card:not(.mcl-showtime-card):not(.emperor-showtime-card)") && Boolean(getShowId(card));
  }

  function statusLabel(status) {
    switch (status) {
      case "available":
        return "可選";
      case "held":
        return "暫留";
      case "blocked":
        return "停用";
      default:
        return "不可選";
    }
  }

  function renderSeat(seat) {
    const label = seat.type === "wheelchair" ? "♿" : seat.label || "";
    const title = [
      `${seat.row || ""}${seat.label || ""}`,
      statusLabel(seat.status),
      seat.type === "wheelchair" ? "輪椅位" : null
    ].filter(Boolean).join(" · ");

    return `
      <span
        class="seat-cell seat-${escapeHtml(seat.status || "unavailable")} ${seat.type === "wheelchair" ? "seat-wheelchair" : ""}"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}"
      >${escapeHtml(label)}</span>
    `;
  }

  function renderSeatRows(rows) {
    const allColumns = (rows || []).flatMap(row =>
      (row.seats || [])
        .map(seat => Number(seat.column))
        .filter(Number.isFinite)
    );

    if (!allColumns.length) {
      return `<div class="seat-map-empty">暫時無法顯示座位排列。</div>`;
    }

    const minColumn = Math.min(...allColumns);
    const maxColumn = Math.max(...allColumns);

    return (rows || []).map(row => {
      const byColumn = new Map(
        (row.seats || [])
          .filter(seat => Number.isFinite(Number(seat.column)))
          .map(seat => [Number(seat.column), seat])
      );
      const cells = [];

      for (let column = minColumn; column <= maxColumn; column++) {
        const seat = byColumn.get(column);
        cells.push(
          seat
            ? renderSeat(seat)
            : `<span class="seat-cell seat-gap" aria-hidden="true"></span>`
        );
      }

      return `
        <div class="seat-row">
          <span class="seat-row-label" aria-hidden="true">${escapeHtml(row.name || "")}</span>
          <div class="seat-row-seats" style="--seat-columns:${maxColumn - minColumn + 1}">
            ${cells.join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderSeatMap(data) {
    const summary = data.summary || {};
    const summaryItems = [
      Number.isFinite(summary.available) ? `<strong>${summary.available}</strong><span>可選</span>` : "",
      Number.isFinite(summary.held) ? `<strong>${summary.held}</strong><span>暫留</span>` : "",
      Number.isFinite(summary.unavailable) ? `<strong>${summary.unavailable}</strong><span>不可選</span>` : "",
      Number.isFinite(summary.total) ? `<strong>${summary.total}</strong><span>總座位</span>` : ""
    ].filter(Boolean);

    return `
      <div class="seat-map-header">
        <div>
          <p class="eyebrow">BROADWAY · SEAT MAP</p>
          <h4>唯讀座位圖</h4>
        </div>
        <div class="seat-map-header-actions">
          <span class="seat-map-updated">即時資料</span>
          <button type="button" class="seat-map-close" data-broadway-seatmap-close aria-label="收起 Broadway 座位圖">收起</button>
        </div>
      </div>

      <div class="seat-map-summary">
        ${summaryItems.map(item => `<div>${item}</div>`).join("")}
      </div>

      <div class="seat-map-legend" aria-label="座位圖圖例">
        <span><i class="legend-seat available"></i>可選</span>
        <span><i class="legend-seat held"></i>暫留</span>
        <span><i class="legend-seat unavailable"></i>不可選</span>
        <span><i class="legend-seat wheelchair"></i>輪椅位</span>
      </div>

      <div class="seat-screen">${escapeHtml(data.screen || "SCREEN")}</div>

      <div class="seat-map-scroll" tabindex="0" aria-label="可左右捲動 Broadway 座位圖">
        <div class="seat-map-grid">${renderSeatRows(data.rows || [])}</div>
      </div>

      <p class="seat-map-note">
        座位狀態只供查看，可能隨時變動；實際選座及購票請於 Broadway 官方網站完成。
      </p>
    `;
  }

  function renderLoading(panel) {
    panel.innerHTML = `
      <div class="seat-map-state" role="status" aria-live="polite">
        <strong>正在載入座位圖</strong>
        <span>正在取得 Broadway 最新座位狀態...</span>
      </div>
    `;
  }

  function renderError(panel, message) {
    panel.innerHTML = `
      <div class="seat-map-state" role="alert">
        <strong>暫時無法取得座位圖</strong>
        <span>${escapeHtml(message)}</span>
        <div class="seat-map-state-actions">
          <button type="button" data-broadway-seatmap-retry>重新載入</button>
          <button type="button" data-broadway-seatmap-close>收起</button>
        </div>
      </div>
    `;
  }

  function cacheGet(showId) {
    const entry = cache.get(showId);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      cache.delete(showId);
      return null;
    }
    return entry.data;
  }

  function cacheSet(showId, data) {
    cache.set(showId, { savedAt: Date.now(), data });
    while (cache.size > 24) cache.delete(cache.keys().next().value);
  }

  function panelFor(card, showId) {
    let panel = card.nextElementSibling;
    if (!panel?.classList?.contains("inline-seat-map")) {
      panel = document.createElement("div");
      panel.className = "inline-seat-map";
      card.insertAdjacentElement("afterend", panel);
    }
    panel.dataset.showId = showId;
    panel.dataset.provider = "broadway";
    panel.hidden = false;
    return panel;
  }

  function closePanel(panel, { restoreFocus = true } = {}) {
    if (!panel) return;
    generation += 1;
    controller?.abort("close");
    controller = null;
    const trigger = panel._seatmapTrigger;
    panel.remove();
    if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  function closeOtherPanels(currentCard) {
    document.querySelectorAll(".inline-seat-map").forEach(panel => {
      if (panel.previousElementSibling !== currentCard) closePanel(panel, { restoreFocus: false });
    });
  }

  async function fetchSeatMap(showId, signal) {
    const response = await fetch(
      `${API_BASE}/api/broadway/shows/${encodeURIComponent(showId)}/seats`,
      { cache: "no-store", signal, headers: { Accept: "application/json" } }
    );
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Broadway 座位圖 HTTP ${response.status}`);
    }
    if (!response.ok || !result?.ok || !result?.data) {
      throw new Error(result?.error?.message || `Broadway 座位圖 HTTP ${response.status}`);
    }
    return result.data;
  }

  async function openSeatMap(trigger, force = false) {
    const card = trigger?.closest(".showtime-card, .provider-compare-show");
    const showId = getShowId(card);
    if (!card || !showId || !isBroadwayCard(card)) return;

    const existing = card.nextElementSibling;
    if (!force && existing?.classList?.contains("inline-seat-map")) {
      closePanel(existing);
      return;
    }

    shared?.announceOpening("broadway");
    closeOtherPanels(card);
    generation += 1;
    const ownGeneration = generation;
    controller?.abort("superseded");
    controller = new AbortController();
    const requestController = controller;

    const panel = panelFor(card, showId);
    panel._seatmapTrigger = trigger;
    renderLoading(panel);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const cached = force ? null : cacheGet(showId);
    if (cached) {
      panel.innerHTML = renderSeatMap(cached);
      shared?.centerAfterRender(panel, ".seat-map-scroll");
      return;
    }

    const timer = setTimeout(() => requestController.abort("timeout"), REQUEST_TIMEOUT_MS);
    try {
      const data = await fetchSeatMap(showId, requestController.signal);
      if (ownGeneration !== generation || requestController.signal.aborted || !panel.isConnected) return;
      cacheSet(showId, data);
      panel.innerHTML = renderSeatMap(data);
      shared?.centerAfterRender(panel, ".seat-map-scroll");
    } catch (error) {
      if (ownGeneration !== generation || requestController.signal.reason === "close") return;
      const message = requestController.signal.reason === "timeout"
        ? "Broadway 座位圖連線逾時，請重新載入。"
        : error instanceof Error ? error.message : String(error);
      if (panel.isConnected) renderError(panel, message);
    } finally {
      clearTimeout(timer);
      if (controller === requestController) controller = null;
    }
  }

  function prepareTrigger(node, card) {
    if (!node || !card || node.dataset.broadwaySeatmapReady === "true") return;
    if (!isBroadwayCard(card) || !getShowId(card)) return;
    const time = card.querySelector(".showtime-time, .provider-compare-show-time")?.textContent?.trim() || "";
    const cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "Broadway";
    node.dataset.broadwaySeatmapReady = "true";
    shared?.prepareTrigger(node, {
      provider: "broadway",
      label: `查看 ${cinema} ${time} Broadway 座位圖`
    });
  }

  function enhance() {
    scheduled = false;
    document.querySelectorAll(".showtime-card .seat-pill, .provider-compare-show .provider-compare-seat").forEach(node => {
      const card = node.closest(".showtime-card, .provider-compare-show");
      prepareTrigger(node, card);
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
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSeatMap(trigger);
      return;
    }

    const retry = event.target.closest?.("[data-broadway-seatmap-retry]");
    if (retry) {
      event.preventDefault();
      const panel = retry.closest(".inline-seat-map");
      if (panel?._seatmapTrigger) openSeatMap(panel._seatmapTrigger, true);
      return;
    }

    const close = event.target.closest?.("[data-broadway-seatmap-close]");
    if (close) {
      event.preventDefault();
      closePanel(close.closest(".inline-seat-map"));
    }
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
    if (trigger && shared?.isActivationKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSeatMap(trigger);
      return;
    }
    if (event.key === "Escape") {
      const panel = document.querySelector(".inline-seat-map");
      if (panel) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closePanel(panel);
      }
    }
  }, true);

  window.addEventListener(shared?.openEvent || "hkcinema:seatmap-opening", event => {
    if (event.detail?.provider === "broadway") return;
    document.querySelectorAll(".inline-seat-map").forEach(panel => {
      closePanel(panel, { restoreFocus: false });
    });
  });

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
    renderSeatMap,
    getStats() {
      return {
        cacheEntries: cache.size,
        cacheTtlMs: CACHE_TTL_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS
      };
    }
  });
})();
