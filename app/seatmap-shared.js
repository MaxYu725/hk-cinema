(() => {
  const OPEN_EVENT = "hkcinema:seatmap-opening";
  const CACHE_TTL_MS = 30 * 1000;
  const REQUEST_TIMEOUT_MS = 12000;
  const BROADWAY_GRID_SEAT_SIZE = 20;
  const MCL_AREA_GRID_SEAT_SIZE = 20;
  const PROVIDER_COPY_OVERRIDES = Object.freeze({
    broadway: Object.freeze({
      eyebrow: "BROADWAY",
      bookingLabel: "前往 Broadway 官方購票",
      note: "座位狀態只供即時參考；實際選座、鎖位、付款及最終庫存以 Broadway 官方網站為準。"
    }),
    mcl: Object.freeze({
      eyebrow: "MCL CINEMAS",
      bookingLabel: "前往 MCL 官方購票",
      note: "座位狀態只供即時參考；實際選座、鎖位、付款及最終庫存以 MCL 官方網站為準。"
    }),
    emperor: Object.freeze({
      eyebrow: "EMPEROR CINEMAS",
      bookingLabel: "前往 Emperor 官方購票",
      note: "Emperor 的「不可選」不會被推測為已售；實際選座、鎖位、付款及最終庫存以官方網站為準。"
    })
  });
  const STATUS_COPY = Object.freeze({
    available: "可選",
    held: "暫留",
    sold: "已售",
    blocked: "停用",
    unavailable: "不可選",
    unknown: "未分類"
  });
  const TYPE_COPY = Object.freeze({
    wheelchair: "輪椅位",
    sofa: "Sofa",
    couple: "雙人座",
    recliner: "躺椅",
    motion: "動感座位",
    special: "特別座位"
  });

  const cache = new Map();
  let generation = 0;
  let controller = null;
  let activeRequest = null;
  let returnFocus = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function providerCopy(providerId) {
    const normalized = String(providerId || "").trim().toLowerCase();
    const info = window.HKCinemaViewModels?.provider?.(normalized);
    if (!info) throw new Error(`Unregistered seat-map provider: ${providerId}`);
    const override = PROVIDER_COPY_OVERRIDES[normalized] || {};
    const label = info.label || normalized;
    return {
      id: normalized,
      label,
      eyebrow: override.eyebrow || String(label).toUpperCase(),
      bookingLabel: override.bookingLabel || `前往 ${label} 官方購票`,
      note: override.note || `座位狀態只供即時參考；實際選座、鎖位、付款及最終庫存以 ${label} 官方資料為準。`,
      capabilities: { ...(info.capabilities || {}) }
    };
  }

  function prepareTrigger(node, { provider, label } = {}) {
    if (!node) return null;
    const normalizedProvider = String(provider || "").trim().toLowerCase();
    if (normalizedProvider && !providerCopy(normalizedProvider).capabilities.seatMap) return null;
    node.classList.add("seatmap-launch");
    if (normalizedProvider) {
      node.classList.add(`${normalizedProvider}-seatmap-launch`);
      node.dataset.seatmapProvider = normalizedProvider;
    }
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    if (label) node.setAttribute("aria-label", String(label));
    return node;
  }

  function isActivationKey(event) {
    return event?.key === "Enter" || event?.key === " ";
  }

  function centerHorizontally(scroller) {
    if (!scroller) return 0;
    const maximumScroll = Math.max(0, Number(scroller.scrollWidth || 0) - Number(scroller.clientWidth || 0));
    const target = Math.round(maximumScroll / 2);
    scroller.scrollLeft = target;
    return target;
  }

  function centerAfterRender(root, selector) {
    if (!root || !selector) return;
    requestAnimationFrame(() => root.querySelectorAll(selector).forEach(centerHorizontally));
  }

  function ensureOverlay() {
    let overlay = document.querySelector("#sharedSeatMapOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "sharedSeatMapOverlay";
    overlay.className = "shared-seatmap-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="shared-seatmap-backdrop" data-seatmap-close></div>
      <aside class="shared-seatmap-sheet" role="dialog" aria-modal="true" aria-labelledby="sharedSeatMapTitle">
        <button type="button" class="shared-seatmap-close" data-seatmap-close aria-label="關閉座位圖">×</button>
        <div id="sharedSeatMapContent"></div>
      </aside>
    `;
    document.body.appendChild(overlay);
    return overlay;
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
    while (cache.size > 48) cache.delete(cache.keys().next().value);
  }

  function showtimeLine(showtime) {
    const metadata = showtime?.metadata || {};
    return [
      showtime?.date,
      showtime?.time,
      showtime?.house?.name,
      ...(metadata.formats || []),
      ...(metadata.languages || []),
      ...(metadata.subtitles || [])
    ].filter(Boolean).join(" · ");
  }

  function headerHtml(copy, showtime, { loading = false } = {}) {
    const cinema = showtime?.cinema?.name?.display || showtime?.cinema?.name?.zh || copy.label;
    return `
      <header class="shared-seatmap-header">
        <p class="eyebrow">${escapeHtml(copy.eyebrow)} · SEAT MAP</p>
        <h2 id="sharedSeatMapTitle">${escapeHtml(cinema)}</h2>
        <p>${escapeHtml(showtimeLine(showtime) || (loading ? "正在準備場次資料…" : "唯讀座位圖"))}</p>
      </header>
    `;
  }

  function renderLoading(request) {
    const copy = providerCopy(request.provider);
    return `
      ${headerHtml(copy, request.showtime, { loading: true })}
      <div class="shared-seatmap-state" role="status" aria-live="polite">
        <span class="shared-seatmap-spinner" aria-hidden="true"></span>
        <strong>正在載入座位圖</strong>
        <span>正在取得 ${escapeHtml(copy.label)} 最新座位狀態…</span>
      </div>
    `;
  }

  function bookingAction(copy, bookingUrl) {
    if (!copy.capabilities.booking || !bookingUrl) return "";
    return `<a href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" class="shared-seatmap-booking">${escapeHtml(copy.bookingLabel)}</a>`;
  }

  function renderError(request, message) {
    const copy = providerCopy(request.provider);
    const bookingUrl = request.showtime?.bookingUrl || request.bookingUrl;
    return `
      ${headerHtml(copy, request.showtime)}
      <div class="shared-seatmap-state error" role="alert">
        <strong>暫時無法取得座位圖</strong>
        <span>${escapeHtml(message)}</span>
        <div class="shared-seatmap-state-actions">
          <button type="button" data-seatmap-retry>重新載入</button>
          ${bookingAction(copy, bookingUrl)}
        </div>
      </div>
    `;
  }

  function summaryItems(summary = {}) {
    const statuses = ["available", "held", "sold", "blocked", "unavailable", "unknown"]
      .filter(status => Number.isFinite(summary[status]) && (status === "available" || summary[status] > 0))
      .map(status => ({ status, label: STATUS_COPY[status], value: summary[status] }));
    if (Number.isFinite(summary.total)) statuses.push({ status: "total", label: "總座位", value: summary.total });
    return statuses;
  }

  function mapSeats(model) {
    return (model.sections || []).flatMap(section => section.seats || []);
  }

  function renderSummary(model) {
    const items = summaryItems(model.summary);
    if (!items.length) return "";
    return `
      <div class="shared-seatmap-summary" aria-label="座位數目">
        ${items.map(item => `
          <div class="status-${escapeHtml(item.status)}"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>
        `).join("")}
      </div>
    `;
  }

  function renderLegend(model) {
    const seats = mapSeats(model);
    const statuses = ["available", "held", "sold", "blocked", "unavailable", "unknown"]
      .filter(status => seats.some(seat => seat.status === status));
    const types = Object.keys(TYPE_COPY).filter(type => seats.some(seat => seat.type === type));
    return `
      <div class="shared-seatmap-legends">
        <div class="shared-seatmap-legend" aria-label="座位狀態圖例">
          ${statuses.map(status => `<span><i class="status-${status}"></i>${escapeHtml(STATUS_COPY[status])}</span>`).join("")}
        </div>
        ${types.length ? `
          <div class="shared-seatmap-legend type-legend" aria-label="座位類型圖例">
            ${types.map(type => `<span><i class="type-${type}">${type === "wheelchair" ? "♿" : ""}</i>${escapeHtml(TYPE_COPY[type])}</span>`).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function seatLabel(seat) {
    if (seat.type === "wheelchair") return "♿";
    const row = String(seat.row || "");
    const label = String(seat.label || "");
    return row && label.startsWith(row) ? label.slice(row.length) || label : label;
  }

  function seatTitle(seat) {
    return [
      seat.label || [seat.row, seat.column].filter(Boolean).join(""),
      STATUS_COPY[seat.status] || STATUS_COPY.unknown,
      seat.type !== "standard" ? TYPE_COPY[seat.type] : null,
      seat.areaName
    ].filter(Boolean).join(" · ");
  }

  function seatHtml(seat, { positioned = false, style = "" } = {}) {
    const classes = [
      "shared-seat",
      `status-${seat.status || "unknown"}`,
      `type-${seat.type || "standard"}`,
      Number(seat.span) > 1 ? "is-wide" : ""
    ].filter(Boolean).join(" ");
    const title = seatTitle(seat);
    const spanStyle = !positioned && Number(seat.span) > 1 ? `grid-column:span ${Math.max(1, Number(seat.span))};` : "";
    return `<span class="${escapeHtml(classes)}" style="${escapeHtml(style + spanStyle)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(seatLabel(seat))}</span>`;
  }

  function availableWidth() {
    return Math.max(250, Math.min(720, Number(window.innerWidth || 390) - 56));
  }

  function renderScreen(label, width = null) {
    return `<div class="shared-seatmap-screen"${Number.isFinite(width) ? ` style="width:${Math.round(width)}px"` : ""}><span>${escapeHtml(label || "銀幕")}</span></div>`;
  }

  function gridMetrics(model) {
    const rows = model.sections?.[0]?.rows || [];
    const columns = Math.max(1, ...rows.map(row => row.cells?.length || 0));
    const gap = columns > 22 ? 2 : 4;
    const fitted = Math.floor((availableWidth() - 34 - (gap * Math.max(0, columns - 1))) / columns);
    const minimum = columns > 24 ? 17 : 18;
    const size = model?.provider?.id === "broadway"
      ? BROADWAY_GRID_SEAT_SIZE
      : Math.max(minimum, Math.min(28, fitted));
    const contentWidth = 34 + (columns * size) + (Math.max(0, columns - 1) * gap);
    return { columns, gap, size, contentWidth, scrollable: contentWidth > availableWidth() + 4 };
  }

  function renderGrid(model) {
    const section = model.sections?.[0];
    if (!section?.rows?.length) return renderEmptyGeometry();
    const metrics = gridMetrics(model);
    const screenWidth = Math.max(180, metrics.contentWidth - 34);
    return `
      ${metrics.scrollable ? `<p class="shared-seatmap-scroll-hint">大型／闊身影廳 · 左右滑動查看完整座位</p>` : ""}
      <div class="shared-seatmap-viewport">
        <div class="shared-seatmap-scroll ${metrics.scrollable ? "is-scrollable" : ""}" tabindex="0" aria-label="可左右捲動座位圖">
          <div class="shared-seatmap-grid" style="--seat-size:${metrics.size}px;--seat-gap:${metrics.gap}px;min-width:${metrics.contentWidth}px">
            <div class="shared-seatmap-grid-screen" style="box-sizing:border-box;width:${metrics.contentWidth}px;padding-left:34px">
              ${renderScreen(model.screenLabel, screenWidth)}
            </div>
            ${section.rows.map(row => `
              <div class="shared-seatmap-row">
                <span class="shared-seatmap-row-label">${escapeHtml(row.label || "")}</span>
                <div class="shared-seatmap-row-cells" style="grid-template-columns:repeat(${metrics.columns}, ${metrics.size}px)">
                  ${(row.cells || []).map(cell => cell.kind === "seat" && cell.seat
                    ? seatHtml(cell.seat)
                    : `<span class="shared-seat gap" aria-hidden="true"></span>`).join("")}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function areaGridMetrics(model) {
    const sections = model.sections || [];
    const totalColumns = Math.max(1, ...sections.map(section => Number(section.metrics?.totalColumns) || Number(section.metrics?.cellColumns) || 1));
    const fitted = Math.floor(availableWidth() / totalColumns);
    const minimum = totalColumns > 28 ? 17 : 18;
    const cellSize = model?.provider?.id === "mcl"
      ? MCL_AREA_GRID_SEAT_SIZE
      : Math.max(minimum, Math.min(28, fitted));
    const baseWidth = totalColumns * cellSize;
    const baseHeight = Math.max(cellSize, ...sections.map(section => Math.max(1, section.rows?.length || 0) * cellSize));
    const positioned = sections.map(section => {
      const columns = Math.max(1, Number(section.metrics?.cellColumns) || totalColumns);
      const left = Math.max(0, Math.round((Number(section.metrics?.ratioLeft) || 0) * baseWidth));
      const top = sections.length === 1 ? 0 : Math.max(0, Math.round((Number(section.metrics?.ratioTop) || 0) * baseHeight));
      return {
        section,
        columns,
        left,
        top,
        width: columns * cellSize,
        height: Math.max(1, section.rows?.length || 0) * cellSize
      };
    });
    const canvasWidth = Math.max(baseWidth, ...positioned.map(area => area.left + area.width));
    const canvasHeight = Math.max(baseHeight, ...positioned.map(area => area.top + area.height));
    return { totalColumns, cellSize, baseWidth, canvasWidth, canvasHeight, positioned, scrollable: canvasWidth > availableWidth() + 4 };
  }

  function renderAreaCell(cell) {
    if (!cell || cell.kind === "gap") return `<span class="shared-seat area-cell gap" aria-hidden="true"></span>`;
    if (cell.kind === "label") return `<span class="shared-seat area-cell label" aria-hidden="true">${escapeHtml(cell.label || "")}</span>`;
    return `<span class="shared-seat area-cell seat-cell">${cell.seat ? seatHtml(cell.seat) : ""}</span>`;
  }

  function renderFixedAreaRows(metrics) {
    const labels = new Map();
    for (const area of metrics.positioned) {
      (area.section.rows || []).forEach((row, index) => {
        const label = String(row.label || "").trim();
        if (!label) return;
        const top = 48 + area.top + (index * metrics.cellSize) + (metrics.cellSize / 2);
        if (!labels.has(label) || top < labels.get(label)) labels.set(label, top);
      });
    }
    return Array.from(labels, ([label, top]) => `<span style="top:${Math.round(top)}px">${escapeHtml(label)}</span>`).join("");
  }

  function renderAreaGrid(model) {
    if (!(model.sections || []).some(section => section.rows?.length)) return renderEmptyGeometry();
    const metrics = areaGridMetrics(model);
    return `
      ${metrics.scrollable ? `<p class="shared-seatmap-scroll-hint">大型／闊身影廳 · 左右滑動查看完整座位</p>` : ""}
      <div class="shared-seatmap-viewport area-grid-viewport">
        <div class="shared-seatmap-scroll ${metrics.scrollable ? "is-scrollable" : ""}" tabindex="0" aria-label="可左右捲動座位圖">
          <div class="shared-seatmap-area-canvas" style="width:${metrics.canvasWidth}px;min-width:${metrics.canvasWidth}px;--seat-size:${metrics.cellSize}px">
            ${renderScreen(model.screenLabel, metrics.baseWidth)}
            <div class="shared-seatmap-areas" style="width:${metrics.canvasWidth}px;height:${metrics.canvasHeight}px">
              ${metrics.positioned.map(area => `
                <div class="shared-seatmap-area" style="left:${area.left}px;top:${area.top}px;width:${area.width}px">
                  ${(area.section.rows || []).map(row => `
                    <div class="shared-seatmap-area-row" style="grid-template-columns:repeat(${area.columns}, ${metrics.cellSize}px);height:${metrics.cellSize}px">
                      ${(row.cells || []).map(renderAreaCell).join("")}
                    </div>
                  `).join("")}
                </div>
              `).join("")}
            </div>
          </div>
        </div>
        ${metrics.scrollable ? `<div class="shared-seatmap-fixed-rows" aria-hidden="true">${renderFixedAreaRows(metrics)}</div>` : ""}
      </div>
    `;
  }

  function positionedMetrics(section) {
    const geometryWidth = Math.max(104, Number(section.bounds?.width || 0));
    const geometryHeight = Math.max(56, Number(section.bounds?.height || 0));
    const scale = Math.max(0.75, Math.min(1, (availableWidth() - 76) / geometryWidth));
    const width = Math.round((geometryWidth * scale) + 76);
    return {
      scale,
      width,
      height: Math.round((geometryHeight * scale) + 64),
      seatSize: Math.max(18, Math.round(24 * scale)),
      scrollable: width > availableWidth() + 4
    };
  }

  function positionedSeat(seat, section, metrics) {
    const position = seat.position || {};
    const left = ((Number(position.left || 0) - Number(section.bounds?.minLeft || 0)) * metrics.scale) + 42;
    const top = ((Number(position.top || 0) - Number(section.bounds?.minTop || 0)) * metrics.scale) + 24;
    const relLeft = Number(position.relativeLeftPercent || 0);
    const relTop = Number(position.relativeTopPercent || 0);
    const rotate = Number(position.rotate || 0);
    const style = `left:${left}px;top:${top}px;width:${metrics.seatSize}px;height:${metrics.seatSize}px;transform:translate(${relLeft}%,${relTop}%) rotate(${rotate}deg);`;
    return seatHtml(seat, { positioned: true, style });
  }

  function positionedRows(section, metrics) {
    return (section.rows || []).map(row => {
      const tops = (row.seats || []).map(seat => Number(seat.position?.top)).filter(Number.isFinite);
      if (!tops.length || !row.label) return "";
      const top = ((Math.min(...tops) - Number(section.bounds?.minTop || 0)) * metrics.scale) + 36;
      return `<span style="top:${top}px">${escapeHtml(row.label)}</span>`;
    }).join("");
  }

  function renderAreas(section) {
    const areas = (section.areas || []).filter(area => area.name);
    if (!areas.length) return "";
    return `<div class="shared-seatmap-zone-list">${areas.map(area => `<span>${escapeHtml(area.name)}${Number.isFinite(area.price) ? ` · $${escapeHtml(area.price)}` : ""}</span>`).join("")}</div>`;
  }

  function renderPositioned(model) {
    const sections = (model.sections || []).filter(section => section.seats?.length);
    if (!sections.length) return renderEmptyGeometry();
    return `
      ${renderScreen(model.screenLabel)}
      ${sections.map(section => {
        const metrics = positionedMetrics(section);
        return `
          <section class="shared-seatmap-section">
            <div class="shared-seatmap-section-heading">
              <strong>${escapeHtml(section.name || "座位區")}</strong>
              <span>${escapeHtml(section.seats.length)} 個座位${metrics.scrollable ? " · 可左右滑動" : ""}</span>
            </div>
            ${renderAreas(section)}
            <div class="shared-seatmap-viewport positioned-viewport">
              <div class="shared-seatmap-scroll ${metrics.scrollable ? "is-scrollable" : ""}" tabindex="0" aria-label="可左右捲動座位圖">
                <div class="shared-seatmap-positioned-canvas" style="width:${metrics.width}px;height:${metrics.height}px">
                  ${section.seats.map(seat => positionedSeat(seat, section, metrics)).join("")}
                </div>
              </div>
              <div class="shared-seatmap-positioned-rows" style="height:${metrics.height}px" aria-hidden="true">${positionedRows(section, metrics)}</div>
            </div>
          </section>
        `;
      }).join("")}
    `;
  }

  function renderEmptyGeometry() {
    return `
      <div class="shared-seatmap-empty">
        <strong>此場次沒有可顯示的座位排列</strong>
        <span>保留官方座位摘要，不建立推測座位圖。</span>
      </div>
    `;
  }

  function renderLayout(model) {
    if (model.layoutMode === "grid") return renderGrid(model);
    if (model.layoutMode === "area-grid") return renderAreaGrid(model);
    if (model.layoutMode === "positioned") return renderPositioned(model);
    return renderEmptyGeometry();
  }

  function renderNotices(model) {
    if (!Array.isArray(model.notices) || !model.notices.length) return "";
    return `<div class="shared-seatmap-notices">${model.notices.map(note => `<p>${escapeHtml(note)}</p>`).join("")}</div>`;
  }

  function renderMap(model) {
    const copy = providerCopy(model?.provider?.id);
    const showtime = model.showtime;
    const bookingUrl = model.bookingUrl || showtime?.bookingUrl;
    return `
      <div class="shared-seatmap-content" data-seatmap-provider="${escapeHtml(copy.id)}" data-layout-mode="${escapeHtml(model.layoutMode)}">
        ${headerHtml(copy, showtime)}
        ${renderSummary(model)}
        ${renderLegend(model)}
        <div class="shared-seatmap-layout">${renderLayout(model)}</div>
        ${renderNotices(model)}
        <footer class="shared-seatmap-footer">
          <p>${escapeHtml(copy.note)}</p>
          ${bookingAction(copy, bookingUrl)}
        </footer>
      </div>
    `;
  }

  function showOverlay(request) {
    const overlay = ensureOverlay();
    const opening = overlay.hidden;
    if (opening && !returnFocus?.isConnected) returnFocus = request.trigger || document.activeElement;
    if (request.trigger?.isConnected) returnFocus = request.trigger;
    overlay.dataset.seatmapProvider = request.provider;
    overlay.dataset.seatmapKey = request.fullKey;
    overlay.hidden = false;
    document.body.classList.add("seatmap-open");
    const sheet = overlay.querySelector(".shared-seatmap-sheet");
    if (sheet) sheet.scrollTop = 0;
    if (opening) requestAnimationFrame(() => overlay.querySelector(".shared-seatmap-close")?.focus());
    return overlay;
  }

  function renderIntoOverlay(html) {
    const overlay = ensureOverlay();
    const content = overlay.querySelector("#sharedSeatMapContent");
    content.innerHTML = html;
    return content;
  }

  function validModel(model, provider) {
    return model?.kind === "seat-map" && model?.provider?.id === provider && Array.isArray(model?.sections);
  }

  async function open(options = {}) {
    const copy = providerCopy(options.provider);
    if (!copy.capabilities.seatMap) return false;
    const key = String(options.key || "").trim();
    if (!key || typeof options.load !== "function" || typeof options.adapt !== "function") return false;
    const fullKey = `${copy.id}:${key}`;
    const overlay = document.querySelector("#sharedSeatMapOverlay");
    if (!options.force && overlay && !overlay.hidden && overlay.dataset.seatmapKey === fullKey) {
      close();
      return false;
    }

    generation += 1;
    const ownGeneration = generation;
    controller?.abort("superseded");
    controller = new AbortController();
    const requestController = controller;
    const request = {
      ...options,
      provider: copy.id,
      fullKey,
      showtime: options.showtime || null
    };
    activeRequest = request;

    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { provider: copy.id } }));
    showOverlay(request);
    renderIntoOverlay(renderLoading(request));

    const cached = options.force ? null : cacheGet(fullKey);
    if (cached) {
      renderIntoOverlay(renderMap(cached));
      centerAfterRender(ensureOverlay(), ".shared-seatmap-scroll.is-scrollable");
      controller = null;
      return true;
    }

    const timer = setTimeout(() => requestController.abort("timeout"), REQUEST_TIMEOUT_MS);
    try {
      const raw = await options.load(requestController.signal);
      if (ownGeneration !== generation || requestController.signal.aborted) return false;
      const model = options.adapt(raw);
      if (!validModel(model, copy.id)) throw new Error("座位資料格式不完整");
      cacheSet(fullKey, model);
      renderIntoOverlay(renderMap(model));
      centerAfterRender(ensureOverlay(), ".shared-seatmap-scroll.is-scrollable");
      return true;
    } catch (error) {
      if (ownGeneration !== generation || requestController.signal.reason === "close") return false;
      const message = requestController.signal.reason === "timeout"
        ? `${copy.label} 座位圖連線逾時，請重新載入。`
        : error instanceof Error ? error.message : String(error);
      renderIntoOverlay(renderError(request, message));
      return false;
    } finally {
      clearTimeout(timer);
      if (controller === requestController) controller = null;
    }
  }

  function close({ restoreFocus = true } = {}) {
    const overlay = document.querySelector("#sharedSeatMapOverlay");
    if (!overlay || overlay.hidden) return false;
    generation += 1;
    controller?.abort("close");
    controller = null;
    activeRequest = null;
    overlay.hidden = true;
    delete overlay.dataset.seatmapProvider;
    delete overlay.dataset.seatmapKey;
    document.body.classList.remove("seatmap-open");
    const focusTarget = returnFocus;
    returnFocus = null;
    if (restoreFocus && focusTarget?.isConnected) requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    return true;
  }

  function isOpen() {
    const overlay = document.querySelector("#sharedSeatMapOverlay");
    return Boolean(overlay && !overlay.hidden);
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("#sharedSeatMapOverlay [data-seatmap-close]")) {
      event.preventDefault();
      close();
      return;
    }
    if (event.target.closest?.("#sharedSeatMapOverlay [data-seatmap-retry]") && activeRequest) {
      event.preventDefault();
      open({ ...activeRequest, force: true });
    }
  }, true);

  document.addEventListener("keydown", event => {
    const overlay = document.querySelector("#sharedSeatMapOverlay");
    if (!overlay || overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!overlay.contains(document.activeElement) || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  window.HKCinemaSeatMapShared = Object.freeze({
    version: "7b3-m8a2h1-1",
    openEvent: OPEN_EVENT,
    prepareTrigger,
    isActivationKey,
    centerHorizontally,
    centerAfterRender,
    ensureOverlay,
    open,
    close,
    isOpen,
    renderMap,
    gridMetrics,
    areaGridMetrics,
    positionedMetrics,
    getStats(provider = null) {
      const prefix = provider ? `${String(provider).toLowerCase()}:` : null;
      return {
        cacheEntries: prefix ? Array.from(cache.keys()).filter(key => key.startsWith(prefix)).length : cache.size,
        cacheTtlMs: CACHE_TTL_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS
      };
    }
  });
})();
