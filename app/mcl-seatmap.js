(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const cache = new Map();
  const CACHE_MS = 30 * 1000;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sessionParams(card) {
    try {
      const url = new URL(card.href, location.href);
      return {
        sessionId: url.searchParams.get("si"),
        cinemaCode: url.searchParams.get("ci"),
        bookingUrl: url.href
      };
    } catch {
      return null;
    }
  }

  function panelFor(card) {
    let panel = card.nextElementSibling;

    if (!panel?.classList?.contains("mcl-seatmap-panel")) {
      panel = document.createElement("div");
      panel.className = "mcl-seatmap-panel";
      panel.hidden = true;
      card.insertAdjacentElement("afterend", panel);
    }

    return panel;
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
      <div class="mcl-seat-legend">
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

  function renderSeatV2(seat) {
    const cell = Math.max(1, Number(seat.displayCell) || 1);
    const span = Math.max(1, Math.min(2, Number(seat.span) || 1));

    return `
      <span
        class="mcl-seat ${escapeHtml(seat.status)}"
        style="grid-column:${cell} / span ${span}"
        title="${escapeHtml(seat.seatNum)} · ${escapeHtml(statusLabel(seat.status))}"
        aria-label="${escapeHtml(seat.seatNum)} ${escapeHtml(statusLabel(seat.status))}"
      >${escapeHtml(seatNumber(seat))}</span>
    `;
  }

  function layoutMetrics(data) {
    const totalColumns = Math.max(1, Number(data.totalColumns) || 1);
    const availableWidth = Math.max(
      250,
      Math.min(720, (window.innerWidth || 390) - 92)
    );
    const gap = 2;
    const maxCell = 26;
    const minCell = totalColumns > 28 ? 18 : 16;
    const fitted = Math.floor(
      (availableWidth - Math.max(0, totalColumns - 1) * gap) /
      totalColumns
    );
    const cellSize = Math.max(minCell, Math.min(maxCell, fitted));
    const canvasWidth =
      totalColumns * cellSize +
      Math.max(0, totalColumns - 1) * gap;
    const rowPitch = cellSize + 4;
    const areas = Array.isArray(data.areas) ? data.areas : [];
    const maxAreaRows = Math.max(
      1,
      ...areas.map(area => Math.max(1, area.rows?.length || 0))
    );

    const positionedAreas = areas.map(area => {
      const columns = Math.max(
        1,
        Number(area.cellColumns) || totalColumns
      );
      const width =
        columns * cellSize +
        Math.max(0, columns - 1) * gap;
      const left = Math.max(
        0,
        Math.round((Number(area.ratioLeft) || 0) * canvasWidth)
      );
      const top = areas.length > 1
        ? Math.max(
            0,
            Math.round(
              (Number(area.ratioTop) || 0) *
              maxAreaRows *
              rowPitch
            )
          )
        : 0;
      const height = Math.max(1, area.rows?.length || 0) * rowPitch;

      return {
        ...area,
        columns,
        width,
        left,
        top,
        height
      };
    });

    const contentWidth = Math.max(
      canvasWidth,
      ...positionedAreas.map(area => area.left + area.width)
    );
    const contentHeight = Math.max(
      rowPitch,
      ...positionedAreas.map(area => area.top + area.height)
    );

    return {
      totalColumns,
      gap,
      cellSize,
      rowPitch,
      canvasWidth: contentWidth,
      canvasHeight: contentHeight,
      availableWidth,
      scrollable: contentWidth > availableWidth + 4,
      areas: positionedAreas
    };
  }

  function renderArea(area, metrics) {
    return `
      <div
        class="mcl-seat-area"
        style="left:${area.left}px; top:${area.top}px; width:${area.width}px; --mcl-area-columns:${area.columns}"
      >
        ${(area.rows || []).map(row => `
          <div
            class="mcl-seat-area-row"
            style="grid-template-columns:repeat(${area.columns}, ${metrics.cellSize}px); gap:${metrics.gap}px; min-height:${metrics.rowPitch}px"
          >
            ${row.name ? `<span class="mcl-seat-row-label left" style="grid-column:1">${escapeHtml(row.name)}</span>` : ""}
            ${(row.seats || []).map(renderSeatV2).join("")}
            ${row.name ? `<span class="mcl-seat-row-label right" style="grid-column:${area.columns}">${escapeHtml(row.name)}</span>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderOfficialLayout(data) {
    const metrics = layoutMetrics(data);

    return `
      ${metrics.scrollable ? `<p class="mcl-seatmap-scroll-hint">大型／闊身影廳 · 左右滑動查看完整座位</p>` : ""}
      <div class="mcl-seatmap-stage ${metrics.scrollable ? "is-scrollable" : ""}">
        <div
          class="mcl-seatmap-canvas"
          style="width:${metrics.canvasWidth}px; min-width:${metrics.canvasWidth}px; --mcl-cell-size:${metrics.cellSize}px"
        >
          <div class="mcl-seat-screen">${escapeHtml(data.screenLabel || "銀幕")}</div>
          <div
            class="mcl-seat-areas"
            style="height:${metrics.canvasHeight}px"
          >
            ${metrics.areas.map(area => renderArea(area, metrics)).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderLegacyLayout(data) {
    const columns = Math.max(1, Number(data.totalColumns) || 1);

    return `
      <div class="mcl-seatmap-stage">
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
    const layout =
      data.layoutVersion >= 2 &&
      Array.isArray(data.areas) &&
      data.areas.length
        ? renderOfficialLayout(data)
        : renderLegacyLayout(data);

    return `
      <div class="mcl-seatmap-heading">
        <div>
          <strong>座位圖</strong>
          <span>
            可選 ${counts.available ?? "—"}
            · 已售 ${counts.sold ?? "—"}
            ${counts.blocked ? ` · 不可用 ${counts.blocked}` : ""}
          </span>
        </div>
        <button type="button" class="mcl-seatmap-close" aria-label="收起座位圖">收起</button>
      </div>

      ${renderLegend()}
      ${layout}

      <div class="mcl-seatmap-footer">
        <p>座位狀態只供即時參考，實際可購座位以 MCL 結帳頁為準。</p>
        <a href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" class="detail-action">前往 MCL 官方購票</a>
      </div>
    `;
  }

  async function fetchSeatMap(sessionId, cinemaCode) {
    const key = `${cinemaCode}:${sessionId}`;
    const cached = cache.get(key);

    if (cached && Date.now() - cached.savedAt < CACHE_MS) {
      return cached.data;
    }

    const response = await fetch(
      `${API_BASE}/api/mcl/shows/${encodeURIComponent(sessionId)}/seats?cinemaCode=${encodeURIComponent(cinemaCode)}`,
      { cache: "no-store" }
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

    cache.set(key, { savedAt: Date.now(), data: result.data });
    return result.data;
  }

  function centerSeatMap(panel) {
    requestAnimationFrame(() => {
      const scroller = panel.querySelector(
        ".mcl-seatmap-stage.is-scrollable"
      );

      if (scroller) {
        scroller.scrollLeft = Math.max(
          0,
          (scroller.scrollWidth - scroller.clientWidth) / 2
        );
      }
    });
  }

  async function openSeatMap(card) {
    const params = sessionParams(card);
    if (!params?.sessionId || !params?.cinemaCode) {
      window.open(card.href, "_blank", "noopener,noreferrer");
      return;
    }

    document.querySelectorAll(".mcl-seatmap-panel:not([hidden])").forEach(panel => {
      if (panel !== card.nextElementSibling) panel.hidden = true;
    });

    const panel = panelFor(card);

    if (!panel.hidden && panel.dataset.ready === "true") {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    panel.dataset.ready = "false";
    panel.innerHTML = `
      <div class="mcl-seatmap-loading">
        <strong>正在載入座位圖</strong>
        <span>正在取得 MCL 即時座位狀態...</span>
      </div>
    `;

    try {
      const data = await fetchSeatMap(params.sessionId, params.cinemaCode);
      panel.innerHTML = renderMap(data, params.bookingUrl);
      panel.dataset.ready = "true";
      centerSeatMap(panel);
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      panel.innerHTML = `
        <div class="mcl-seatmap-loading error">
          <strong>暫時無法取得座位圖</strong>
          <span>${escapeHtml(error instanceof Error ? error.message : String(error))}</span>
          <a href="${escapeHtml(params.bookingUrl)}" target="_blank" rel="noopener noreferrer" class="detail-action">前往 MCL 官方購票</a>
        </div>
      `;
    }
  }

  document.addEventListener("click", event => {
    const close = event.target.closest(".mcl-seatmap-close");
    if (close) {
      event.preventDefault();
      close.closest(".mcl-seatmap-panel").hidden = true;
      return;
    }

    const card = event.target.closest(".mcl-showtime-card");
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();
    openSeatMap(card);
  }, true);
})();
