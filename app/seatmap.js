(() => {
  const API_BASE =
    "https://hk-cinema-api.max-yu-jp.workers.dev";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getShowId(card) {
    const href = card?.getAttribute("href") || "";
    const match = href.match(/\/show\/(\d+)/);
    return match ? match[1] : null;
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
    const label =
      seat.type === "wheelchair"
        ? "♿"
        : seat.label || "";

    const title = [
      `${seat.row || ""}${seat.label || ""}`,
      statusLabel(seat.status),
      seat.type === "wheelchair" ? "輪椅位" : null
    ]
      .filter(Boolean)
      .join(" · ");

    return `
      <span
        class="seat-cell seat-${escapeHtml(seat.status || "unavailable")} ${seat.type === "wheelchair" ? "seat-wheelchair" : ""}"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}"
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  function renderSeatRows(rows) {
    const allColumns = (rows || [])
      .flatMap(row =>
        (row.seats || [])
          .map(seat => Number(seat.column))
          .filter(Number.isFinite)
      );

    if (!allColumns.length) {
      return `
        <div class="seat-map-empty">
          暫時無法顯示座位排列。
        </div>
      `;
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
          <span class="seat-row-label">${escapeHtml(row.name || "")}</span>
          <div
            class="seat-row-seats"
            style="--seat-columns:${maxColumn - minColumn + 1}"
          >
            ${cells.join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderSeatMap(data) {
    const summary = data.summary || {};

    const summaryItems = [
      Number.isFinite(summary.available)
        ? `<strong>${summary.available}</strong><span>可選</span>`
        : "",
      Number.isFinite(summary.held)
        ? `<strong>${summary.held}</strong><span>暫留</span>`
        : "",
      Number.isFinite(summary.unavailable)
        ? `<strong>${summary.unavailable}</strong><span>不可選</span>`
        : "",
      Number.isFinite(summary.total)
        ? `<strong>${summary.total}</strong><span>總座位</span>`
        : ""
    ].filter(Boolean);

    return `
      <div class="seat-map-header">
        <div>
          <p class="eyebrow">SEAT MAP</p>
          <h4>座位圖</h4>
        </div>
        <span class="seat-map-updated">即時資料</span>
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

      <div class="seat-map-scroll">
        <div class="seat-map-grid">
          ${renderSeatRows(data.rows || [])}
        </div>
      </div>

      <p class="seat-map-note">
        座位狀態只供查看，可能隨時變動；實際選座及購票請於 Broadway 官方網站完成。
      </p>
    `;
  }

  function renderError(panel, message) {
    panel.innerHTML = `
      <div class="seat-map-state">
        <strong>暫時無法取得座位圖</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  async function openSeatMap(pill) {
    const card = pill.closest(".showtime-card");
    const showId = getShowId(card);

    if (!card || !showId) {
      return;
    }

    const existing = document.querySelector(
      `.inline-seat-map[data-show-id="${showId}"]`
    );

    if (existing) {
      existing.remove();
      return;
    }

    document
      .querySelectorAll(".inline-seat-map")
      .forEach(item => item.remove());

    const panel = document.createElement("div");
    panel.className = "inline-seat-map";
    panel.dataset.showId = showId;
    panel.innerHTML = `
      <div class="seat-map-state">
        <strong>正在載入座位圖</strong>
        <span>正在取得 Broadway 最新座位狀態...</span>
      </div>
    `;

    card.after(panel);
    panel.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

    try {
      const response = await fetch(
        `${API_BASE}/api/broadway/shows/${encodeURIComponent(showId)}/seats`,
        { cache: "no-store" }
      );

      const result = await response.json();

      if (!response.ok || !result.ok || !result.data) {
        throw new Error(
          result.error?.message ||
          `API HTTP ${response.status}`
        );
      }

      if (!panel.isConnected) {
        return;
      }

      panel.innerHTML = renderSeatMap(result.data);
    } catch (error) {
      if (!panel.isConnected) {
        return;
      }

      renderError(
        panel,
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }

  document.addEventListener("click", event => {
    const pill = event.target.closest(".seat-pill");

    if (!pill) {
      return;
    }

    const card = pill.closest(".showtime-card");

    if (!card) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openSeatMap(pill);
  });
})();
