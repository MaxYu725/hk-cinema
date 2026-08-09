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
    return card?.dataset?.bookingUrl || card?.getAttribute("href") || "";
  }

  function sessionParams(card) {
    try {
      const url = new URL(cardUrl(card), location.href);
      return {
        sessionId: url.searchParams.get("si"),
        cinemaCode: url.searchParams.get("ci"),
        bookingUrl: url.href
      };
    } catch {
      return null;
    }
  }

  function isMCLCard(card) {
    if (!card) return false;
    if (card.matches(".provider-compare-show")) {
      return Boolean(card.querySelector(".provider-compare-source.mcl"));
    }
    return card.matches(".mcl-showtime-card");
  }

  function statusLabel(status) {
    return {
      available: "可選",
      sold: "已售",
      broken: "不可用",
      wheelchair: "輪椅位",
      "sofa-available": "Sofa 可選",
      "sofa-sold": "Sofa 已售",
      unknown: "其他"
    }[status] || "其他";
  }

  function renderLegend() {
    return `
      <div class="mcl-seat-legend" aria-label="MCL 座位圖圖例">
        ${[
          ["available", "可選"],
          ["sold", "已售"],
          ["broken", "不可用"],
          ["wheelchair", "輪椅位"],
          ["sofa-available", "Sofa 可選"],
          ["sofa-sold", "Sofa 已售"]
        ].map(([status, label]) => `
          <span><i class="mcl-seat-dot ${status}"></i>${label}</span>
        `).join("")}
      </div>
    `;
  }

  function seatNumber(seat) {
    const rowName = String(seat.rowName || "");
    const seatNum = String(seat.seatNum || "");
    if (rowName && seatNum.startsWith(rowName)) {
      return seatNum.slice(rowName.length) || seatNum;
    }
    return seatNum;
  }

  function renderCellV3(cell) {
    if (!cell || cell.type === "blank") {
      return `<span class="mcl-seat-cell blank" aria-hidden="true"></span>`;
    }
    if (cell.type === "label") {
      return `<span class="mcl-seat-cell label" aria-hidden="true">${escapeHtml(cell.text || "")}</span>`;
    }
    const seat = cell.seat;
    if (!seat) return `<span class="mcl-seat-cell blank" aria-hidden="true"></span>`;
    const wide = Number(seat.visualSpan) > 1;
    return `
      <span class="mcl-seat-cell seat-cell">
        <span
          class="mcl-seat ${escapeHtml(seat.status)} ${wide ? "wide" : ""}"
          title="${escapeHtml(seat.seatNum)} · ${escapeHtml(statusLabel(seat.status))}"
          aria-label="${escapeHtml(seat.seatNum)} ${escapeHtml(statusLabel(seat.status))}"
        >${escapeHtml(seatNumber(seat))}</span>
      </span>
    `;
  }

  function layoutMetricsV3(data) {
    const totalColumns = Math.max(1, Number(data.totalColumns) || 1);
    const availableWidth = Math.max(250, Math.min(720, (window.innerWidth || 390) - 92));
    const fitted = Math.floor(availableWidth / totalColumns);
    const minCell = totalColumns > 28 ? 17 : 18;
    const cellSize = Math.max(minCell, Math.min(28, fitted));
    const seatplanWidth = totalColumns * cellSize;
    const areas = Array.isArray(data.areas) ? data.areas : [];
    const seatplanHeight = Math.max(
      cellSize,
      ...areas.map(area => Math.max(1, area.rows?.length || 0) * cellSize)
    );

    const positionedAreas = areas.map(area => {
      const columns = Math.max(1, Number(area.cellColumns) || totalColumns);
      const width = columns * cellSize;
      const height = Math.max(1, area.rows?.length || 0) * cellSize;
      const left = Math.max(0, Math.round((Number(area.ratioLeft) || 0) * seatplanWidth));
      const top = areas.length === 1
        ? 0
        : Math.max(0, Math.round((Number(area.ratioTop) || 0) * seatplanHeight));
      return { ...area, columns, width, height, left, top };
    });

    const contentWidth = Math.max(
      seatplanWidth,
      ...positionedAreas.map(area => area.left + area.width)
    );
    const contentHeight = Math.max(
      seatplanHeight,
      ...positionedAreas.map(area => area.top + area.height)
    );

    return {
      totalColumns,
      cellSize,
      seatplanWidth,
      seatplanHeight,
      canvasWidth: contentWidth,
      canvasHeight: contentHeight,
      availableWidth,
      scrollable: contentWidth > availableWidth + 4,
      areas: positionedAreas
    };
  }

  function renderAreaV3(area, metrics) {
    return `
      <div
        class="mcl-seat-area"
        style="left:${area.left}px; top:${area.top}px; width:${area.width}px; --mcl-area-columns:${area.columns}"
      >
        ${(area.rows || []).map(row => `
          <div
            class="mcl-seat-area-row"
            style="grid-template-columns:repeat(${area.columns}, ${metrics.cellSize}px); height:${metrics.cellSize}px"
          >${(row.cells || []).map(renderCellV3).join("")}</div>
        `).join("")}
      </div>
    `;
  }

  function renderFixedRowLabels(metrics) {
    const labels = new Map();
    for (const area of metrics.areas) {
      (area.rows || []).forEach((row, index) => {
        const name = String(row?.name || "").trim();
        if (!name) return;
        const top = 48 + area.top + (index * metrics.cellSize) + (metrics.cellSize / 2);
        if (!labels.has(name) || top < labels.get(name)) labels.set(name, top);
      });
    }
    return Array.from(labels, ([name, top]) => (
      `<span class="mcl-seatmap-fixed-row" style="top:${Math.round(top)}px">${escapeHtml(name)}</span>`
    )).join("");
  }

  function renderOfficialLayoutV3(data) {
    const metrics = layoutMetricsV3(data);
    return `
      ${metrics.scrollable ? `<p class="mcl-seatmap-scroll-hint">大型／闊身影廳 · 左右滑動查看完整座位</p>` : ""}
      <div class="mcl-seatmap-viewport">
        <div class="mcl-seatmap-stage ${metrics.scrollable ? "is-scrollable" : ""}" tabindex="0" aria-label="可左右捲動 MCL 座位圖">
          <div
            class="mcl-seatmap-canvas"
            style="width:${metrics.canvasWidth}px; min-width:${metrics.canvasWidth}px; --mcl-cell-size:${metrics.cellSize}px"
          >
            <div class="mcl-seat-screen" style="width:${metrics.seatplanWidth}px">${escapeHtml(data.screenLabel || "銀幕")}</div>
            <div class="mcl-seat-areas" style="height:${metrics.canvasHeight}px; width:${metrics.canvasWidth}px">
              ${metrics.areas.map(area => renderAreaV3(area, metrics)).join("")}
            </div>
          </div>
        </div>
        ${metrics.scrollable ? `<div class="mcl-seatmap-fixed-rows" aria-hidden="true">${renderFixedRowLabels(metrics)}</div>` : ""}
      </div>
    `;
  }

  function renderLegacyLayout(data) {
    const columns = Math.max(1, Number(data.totalColumns) || 1);
    return `
      <div class="mcl-seatmap-stage" tabindex="0" aria-label="MCL 座位圖">
        <div class="mcl-seat-screen">${escapeHtml(data.screenLabel || "銀幕")}</div>
        <div class="mcl-seat-legacy-rows">
          ${(data.rows || []).map(row => `
            <div class="mcl-seat-legacy-row">
              <span class="mcl-seat-row-label">${escapeHtml(row.name)}</span>
              <div class="mcl-seat-legacy-grid" style="grid-template-columns:repeat(${columns}, minmax(0, 1fr))">
                ${(row.seats || []).map(seat => `
                  <span
                    class="mcl-seat ${escapeHtml(seat.status)}"
                    style="grid-column:${Math.max(1, Number(seat.column) || 1)}"
                    aria-label="${escapeHtml(seat.seatNum)} ${escapeHtml(statusLabel(seat.status))}"
                  >${escapeHtml(seatNumber(seat))}</span>
                `).join("")}
              </div>
              <span class="mcl-seat-row-label">${escapeHtml(row.name)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderMap(data, bookingUrl) {
    const counts = data.counts || {};
    const layout = data.layoutVersion >= 3 && Array.isArray(data.areas) && data.areas.length
      ? renderOfficialLayoutV3(data)
      : renderLegacyLayout(data);
    return `
      <div class="mcl-seatmap-heading">
        <div>
          <p class="eyebrow">MCL CINEMAS · SEAT MAP</p>
          <strong>唯讀座位圖</strong>
          <span>
            可選 ${counts.available ?? "—"} · 已售 ${counts.sold ?? "—"}
            ${counts.blocked ? ` · 不可用 ${counts.blocked}` : ""}
          </span>
        </div>
        <button type="button" class="mcl-seatmap-close" data-mcl-seatmap-close aria-label="收起 MCL 座位圖">收起</button>
      </div>
      ${renderLegend()}
      ${layout}
      <div class="mcl-seatmap-footer">
        <p>座位狀態只供即時參考，實際可購座位以 MCL 結帳頁為準。</p>
        <a href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" class="detail-action">前往 MCL 官方購票</a>
      </div>
    `;
  }

  function panelFor(card) {
    let panel = card.nextElementSibling;
    if (!panel?.classList?.contains("mcl-seatmap-panel")) {
      panel = document.createElement("div");
      panel.className = "mcl-seatmap-panel";
      card.insertAdjacentElement("afterend", panel);
    }
    panel.dataset.provider = "mcl";
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
    document.querySelectorAll(".mcl-seatmap-panel").forEach(panel => {
      if (panel.previousElementSibling !== currentCard) closePanel(panel, { restoreFocus: false });
    });
  }

  function cacheKey(params) {
    return `${params.cinemaCode}:${params.sessionId}`;
  }

  function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function cacheSet(key, data) {
    cache.set(key, { savedAt: Date.now(), data });
    while (cache.size > 24) cache.delete(cache.keys().next().value);
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

  function renderLoading(panel) {
    panel.innerHTML = `
      <div class="mcl-seatmap-loading" role="status" aria-live="polite">
        <strong>正在載入座位圖</strong>
        <span>正在取得 MCL 最新座位狀態...</span>
      </div>
    `;
  }

  function renderError(panel, message, bookingUrl) {
    panel.innerHTML = `
      <div class="mcl-seatmap-loading error" role="alert">
        <strong>暫時無法取得座位圖</strong>
        <span>${escapeHtml(message)}</span>
        <div class="mcl-seatmap-error-actions">
          <button type="button" class="mcl-seatmap-close" data-mcl-seatmap-retry>重新載入</button>
          <button type="button" class="mcl-seatmap-close" data-mcl-seatmap-close>收起</button>
          <a href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" class="detail-action">前往 MCL 官方購票</a>
        </div>
      </div>
    `;
  }

  async function openSeatMap(trigger, force = false) {
    const card = trigger?.closest(".mcl-showtime-card, .provider-compare-show");
    const params = sessionParams(card);
    if (!card || !isMCLCard(card) || !params?.sessionId || !params?.cinemaCode) return;

    const existing = card.nextElementSibling;
    if (!force && existing?.classList?.contains("mcl-seatmap-panel")) {
      closePanel(existing);
      return;
    }

    shared?.announceOpening("mcl");
    closeOtherPanels(card);
    generation += 1;
    const ownGeneration = generation;
    controller?.abort("superseded");
    controller = new AbortController();
    const requestController = controller;

    const panel = panelFor(card);
    panel._seatmapTrigger = trigger;
    renderLoading(panel);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const key = cacheKey(params);
    const cached = force ? null : cacheGet(key);
    if (cached) {
      panel.innerHTML = renderMap(cached, params.bookingUrl);
      shared?.centerAfterRender(panel, ".mcl-seatmap-stage.is-scrollable");
      return;
    }

    const timer = setTimeout(() => requestController.abort("timeout"), REQUEST_TIMEOUT_MS);
    try {
      const data = await fetchSeatMap(params, requestController.signal);
      if (ownGeneration !== generation || requestController.signal.aborted || !panel.isConnected) return;
      cacheSet(key, data);
      panel.innerHTML = renderMap(data, params.bookingUrl);
      shared?.centerAfterRender(panel, ".mcl-seatmap-stage.is-scrollable");
    } catch (error) {
      if (ownGeneration !== generation || requestController.signal.reason === "close") return;
      const message = requestController.signal.reason === "timeout"
        ? "MCL 座位圖連線逾時，請重新載入。"
        : error instanceof Error ? error.message : String(error);
      if (panel.isConnected) renderError(panel, message, params.bookingUrl);
    } finally {
      clearTimeout(timer);
      if (controller === requestController) controller = null;
    }
  }

  function prepareTrigger(node, card) {
    if (!node || !card || node.dataset.mclSeatmapReady === "true") return;
    const params = sessionParams(card);
    if (!isMCLCard(card) || !params?.sessionId || !params?.cinemaCode) return;
    const time = card.querySelector(".showtime-time, .provider-compare-show-time")?.textContent?.trim() || "";
    const cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "MCL";
    node.dataset.mclSeatmapReady = "true";
    shared?.prepareTrigger(node, {
      provider: "mcl",
      label: `查看 ${cinema} ${time} MCL 座位圖`
    });
  }

  function enhance() {
    scheduled = false;
    document.querySelectorAll(".mcl-showtime-card .seat-pill, .provider-compare-show .provider-compare-seat").forEach(node => {
      const card = node.closest(".mcl-showtime-card, .provider-compare-show");
      prepareTrigger(node, card);
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
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSeatMap(trigger);
      return;
    }

    const retry = event.target.closest?.("[data-mcl-seatmap-retry]");
    if (retry) {
      event.preventDefault();
      const panel = retry.closest(".mcl-seatmap-panel");
      if (panel?._seatmapTrigger) openSeatMap(panel._seatmapTrigger, true);
      return;
    }

    const close = event.target.closest?.("[data-mcl-seatmap-close]");
    if (close) {
      event.preventDefault();
      closePanel(close.closest(".mcl-seatmap-panel"));
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
      const panel = document.querySelector(".mcl-seatmap-panel");
      if (panel) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closePanel(panel);
      }
    }
  }, true);

  window.addEventListener(shared?.openEvent || "hkcinema:seatmap-opening", event => {
    if (event.detail?.provider === "mcl") return;
    document.querySelectorAll(".mcl-seatmap-panel").forEach(panel => {
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

  window.HKCinemaMCLSeatMap = Object.freeze({
    open: openSeatMap,
    renderMap,
    layoutMetricsV3,
    getStats() {
      return {
        cacheEntries: cache.size,
        cacheTtlMs: CACHE_TTL_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS
      };
    }
  });
})();
