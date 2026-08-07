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

  function renderSeat(seat) {
    const number = String(seat.seatNum || "")
      .replace(String(seat.rowName || ""), "") || seat.seatNum;

    return `
      <span
        class="mcl-seat ${escapeHtml(seat.status)}"
        style="grid-column:${Number(seat.column) || 1}"
        title="${escapeHtml(seat.seatNum)} · ${escapeHtml(statusLabel(seat.status))}"
        aria-label="${escapeHtml(seat.seatNum)} ${escapeHtml(statusLabel(seat.status))}"
      >${escapeHtml(number)}</span>
    `;
  }

  function renderMap(data, bookingUrl) {
    const columns = Math.max(1, Number(data.totalColumns) || 1);
    const counts = data.counts || {};

    return `
      <div class="mcl-seatmap-heading">
        <div>
          <strong>座位圖</strong>
          <span>可選 ${counts.available ?? "—"} · 已售 ${counts.sold ?? "—"}</span>
        </div>
        <button type="button" class="mcl-seatmap-close" aria-label="收起座位圖">收起</button>
      </div>

      ${renderLegend()}

      <div class="mcl-seatmap-scroll">
        <div class="mcl-seat-screen">${escapeHtml(data.screenLabel || "銀幕")}</div>

        <div class="mcl-seat-rows">
          ${(data.rows || []).map(row => `
            <div class="mcl-seat-row">
              <span class="mcl-seat-row-name">${escapeHtml(row.name)}</span>
              <div
                class="mcl-seat-grid"
                style="grid-template-columns:repeat(${columns}, 30px)"
              >
                ${(row.seats || []).map(renderSeat).join("")}
              </div>
              <span class="mcl-seat-row-name">${escapeHtml(row.name)}</span>
            </div>
          `).join("")}
        </div>
      </div>

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
