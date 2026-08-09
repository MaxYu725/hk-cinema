(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_TTL_MS = 30 * 1000;
  const REQUEST_TIMEOUT_MS = 12000;

  const sessionStore = new Map();
  const seatCache = new Map();
  const triggerSessions = new WeakMap();
  const shared = window.HKCinemaSeatMapShared;

  let generation = 0;
  let controller = null;
  let scheduled = false;
  let returnFocus = null;

  const delegatedFetch = window.fetch.bind(window);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  function requestDetails(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const rawUrl = request?.url || String(input || "");
    try {
      return {
        url: new URL(rawUrl, window.location.href),
        method: String(init.method || request?.method || "GET").toUpperCase()
      };
    } catch {
      return null;
    }
  }

  window.fetch = async function emperorSeatMapAwareFetch(input, init = {}) {
    const details = requestDetails(input, init);
    const response = await delegatedFetch(input, init);

    if (
      details?.method === "GET" &&
      details.url.origin === API_BASE &&
      /^\/api\/emperor\/movies\/[^/]+\/shows$/.test(details.url.pathname) &&
      response.ok
    ) {
      response.clone().json().then(result => {
        if (result?.ok && result?.data) captureShows(result.data);
      }).catch(() => {});
    }

    return response;
  };

  function activeDateFor(card) {
    if (card.matches(".emperor-showtime-card")) {
      return document.querySelector("[data-emperor-detail-date].active")?.dataset?.emperorDetailDate || null;
    }
    return document.querySelector("[data-provider-compare-date].active")?.dataset?.providerCompareDate || null;
  }

  function cardParts(card) {
    const date = activeDateFor(card);
    const time = card.querySelector(".showtime-time, .provider-compare-show-time")?.textContent?.trim() || "";
    let cinema = "";
    let secondary = "";

    if (card.matches(".emperor-showtime-card")) {
      cinema = card.closest(".cinema-group")?.querySelector(".cinema-group-heading h3")?.textContent?.trim() || "";
      secondary = Array.from(card.querySelectorAll("p"))
        .find(node => !node.classList.contains("emperor-ticket-prices"))
        ?.textContent?.trim() || "";
    } else {
      cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "";
      secondary = card.querySelector(".provider-compare-show-main p")?.textContent?.trim() || "";
    }

    const house = secondary.split(" · ")[0]?.trim() || "";
    return { date, time, cinema, house };
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

  function prepareTrigger(seatNode, card, session) {
    if (!seatNode || !session || seatNode.dataset.emperorSeatmapReady === "true") return;
    const scheduleKey = session?.purchase?.scheduleKey;
    const scheduleId = session?.sourceId;
    const cinemaLinkId = session?.cinema?.sourceId;
    const hallId = session?.house?.sourceId;
    if (!scheduleKey || !scheduleId || !cinemaLinkId || !hallId) return;

    seatNode.dataset.emperorSeatmapReady = "true";
    shared?.prepareTrigger(seatNode, {
      provider: "emperor",
      label: `查看 ${session?.cinema?.name?.zh || "Emperor"} ${session?.time || ""} 座位圖`
    });
    triggerSessions.set(seatNode, session);
  }

  function enhance() {
    scheduled = false;

    document.querySelectorAll(".emperor-showtime-card").forEach(card => {
      const session = findSession(card);
      if (!session) return;
      prepareTrigger(card.querySelector(".seat-pill"), card, session);
    });

    document.querySelectorAll(".provider-compare-show").forEach(card => {
      if (!card.querySelector(".provider-compare-source.emperor")) return;
      const session = findSession(card);
      if (!session) return;
      prepareTrigger(card.querySelector(".provider-compare-seat"), card, session);
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function ensureOverlay() {
    let overlay = document.querySelector("#emperorSeatMapOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "emperorSeatMapOverlay";
    overlay.className = "emperor-seatmap-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="emperor-seatmap-backdrop" data-emperor-seatmap-close></div>
      <aside class="emperor-seatmap-sheet" role="dialog" aria-modal="true" aria-label="Emperor 座位圖">
        <button type="button" class="emperor-seatmap-close" data-emperor-seatmap-close aria-label="關閉座位圖">×</button>
        <div id="emperorSeatMapContent"></div>
      </aside>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function close() {
    generation += 1;
    controller?.abort("close");
    controller = null;
    const overlay = document.querySelector("#emperorSeatMapOverlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("emperor-seatmap-open");
    const focusTarget = returnFocus;
    returnFocus = null;
    if (focusTarget?.isConnected) {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  }

  function cacheKey(session) {
    return [
      session?.sourceId,
      session?.purchase?.scheduleKey,
      session?.cinema?.sourceId,
      session?.house?.sourceId
    ].join("|");
  }

  function cacheGet(key) {
    const entry = seatCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      seatCache.delete(key);
      return null;
    }
    return entry.data;
  }

  function cacheSet(key, data) {
    seatCache.set(key, { savedAt: Date.now(), data });
    while (seatCache.size > 24) {
      seatCache.delete(seatCache.keys().next().value);
    }
  }

  function statusLabel(status) {
    if (status === "available") return "可選";
    if (status === "disabled") return "停用";
    if (status === "isolation") return "隔離／停用";
    return "不可選";
  }

  function typeLabel(type) {
    const labels = {
      general: "一般座位",
      double: "雙人座位",
      deformed: "特別座位",
      vibrate: "動感座位",
      couple: "情侶座位",
      single: "單人扶手椅",
      "double-armchair": "雙人扶手椅",
      "extended-recliner": "特長躺椅",
      wheelchair: "輪椅空間",
      "wheelchair-area": "輪椅分區",
      special: "特別座位"
    };
    return labels[type] || "座位";
  }

  function renderSeat(seat, bounds) {
    const left = Number(seat?.position?.left || 0) - Number(bounds?.minLeft || 0) + 42;
    const top = Number(seat?.position?.top || 0) - Number(bounds?.minTop || 0) + 24;
    const relLeft = Number(seat?.position?.relativeLeftPercent || 0);
    const relTop = Number(seat?.position?.relativeTopPercent || 0);
    const rotate = Number(seat?.position?.rotate || 0);
    const wheelchair = seat.type === "wheelchair" || seat.type === "wheelchair-area";
    const label = wheelchair ? "♿" : (seat.columnName || "");
    const title = [
      seat.name,
      statusLabel(seat.status),
      typeLabel(seat.type),
      seat.areaName
    ].filter(Boolean).join(" · ");

    return `
      <span
        class="emperor-seatmap-seat status-${escapeHtml(seat.status)} type-${escapeHtml(seat.type)}"
        style="left:${left}px;top:${top}px;transform:translate(${relLeft}%,${relTop}%) rotate(${rotate}deg)"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}"
      >${escapeHtml(label)}</span>
    `;
  }

  function renderRows(section) {
    const rows = new Map();
    for (const seat of section.seats || []) {
      if (!seat.rowName) continue;
      const top = Number(seat?.position?.top || 0);
      if (!rows.has(seat.rowName) || top < rows.get(seat.rowName)) rows.set(seat.rowName, top);
    }
    return Array.from(rows.entries()).map(([rowName, rawTop]) => {
      const top = rawTop - Number(section.bounds?.minTop || 0) + 36;
      return `<span class="emperor-seatmap-row-label" style="top:${top}px">${escapeHtml(rowName)}</span>`;
    }).join("");
  }

  function renderAreas(section) {
    const areas = (section.areas || []).filter(area => area.name);
    if (!areas.length) return "";
    return `
      <div class="emperor-seatmap-areas">
        ${areas.map(area => `<span>${escapeHtml(area.name)}${Number.isFinite(area.price) ? ` · $${escapeHtml(area.price)}` : ""}</span>`).join("")}
      </div>
    `;
  }

  function renderSection(section) {
    const width = Math.max(180, Number(section.bounds?.width || 0) + 76);
    const height = Math.max(120, Number(section.bounds?.height || 0) + 64);
    return `
      <section class="emperor-seatmap-section">
        <div class="emperor-seatmap-section-heading">
          <strong>${escapeHtml(section.name || "座位區")}</strong>
          <span>${escapeHtml((section.seats || []).length)} 個座位</span>
        </div>
        ${renderAreas(section)}
        <div class="emperor-seatmap-viewport">
          <div class="emperor-seatmap-scroll" tabindex="0" aria-label="可左右捲動座位圖">
            <div class="emperor-seatmap-canvas" style="width:${width}px;height:${height}px">
              ${(section.seats || []).map(seat => renderSeat(seat, section.bounds)).join("")}
            </div>
          </div>
          <div class="emperor-seatmap-row-labels" style="height:${height}px" aria-hidden="true">
            ${renderRows(section)}
          </div>
        </div>
      </section>
    `;
  }

  function renderLoading(session) {
    const content = ensureOverlay().querySelector("#emperorSeatMapContent");
    content.innerHTML = `
      <header class="emperor-seatmap-header">
        <p class="eyebrow">EMPEROR CINEMAS · SEAT MAP</p>
        <h2>${escapeHtml(session?.cinema?.name?.zh || "Emperor Cinemas")}</h2>
        <p>${escapeHtml([session?.time, session?.house?.name, session?.format].filter(Boolean).join(" · "))}</p>
      </header>
      <div class="emperor-seatmap-state" role="status" aria-live="polite">
        <strong>正在取得座位圖</strong>
        <span>只讀取目前場次，不會鎖位或購票。</span>
      </div>
    `;
  }

  function renderError(session, message) {
    const content = ensureOverlay().querySelector("#emperorSeatMapContent");
    content.innerHTML = `
      <header class="emperor-seatmap-header">
        <p class="eyebrow">EMPEROR CINEMAS · SEAT MAP</p>
        <h2>${escapeHtml(session?.cinema?.name?.zh || "Emperor Cinemas")}</h2>
        <p>${escapeHtml([session?.time, session?.house?.name].filter(Boolean).join(" · "))}</p>
      </header>
      <div class="emperor-seatmap-state" role="alert">
        <strong>暫時無法取得座位圖</strong>
        <span>${escapeHtml(message)}</span>
        <button type="button" data-emperor-seatmap-retry>重新載入</button>
      </div>
    `;
    content.querySelector("[data-emperor-seatmap-retry]")?.addEventListener("click", () => open(session, true), { once: true });
  }

  function renderMap(session, data) {
    const counts = data?.counts || {};
    const content = ensureOverlay().querySelector("#emperorSeatMapContent");
    content.innerHTML = `
      <header class="emperor-seatmap-header">
        <p class="eyebrow">EMPEROR CINEMAS · SEAT MAP</p>
        <h2>${escapeHtml(session?.cinema?.name?.zh || "Emperor Cinemas")}</h2>
        <p>${escapeHtml([session?.time, session?.house?.name, session?.format, session?.language].filter(Boolean).join(" · "))}</p>
      </header>

      <div class="emperor-seatmap-counts">
        <div><strong>${escapeHtml(counts.available ?? "—")}</strong><span>可選</span></div>
        <div><strong>${escapeHtml(counts.unavailable ?? "—")}</strong><span>不可選</span></div>
        <div><strong>${escapeHtml(counts.isolation ?? "—")}</strong><span>隔離／停用</span></div>
        <div><strong>${escapeHtml(counts.total ?? "—")}</strong><span>總座位</span></div>
      </div>

      <div class="emperor-seatmap-legend" aria-label="座位圖例">
        <span><i class="available"></i>可選</span>
        <span><i class="unavailable"></i>不可選</span>
        <span><i class="isolation"></i>隔離／停用</span>
        <span><i class="wheelchair">♿</i>輪椅／特別座位</span>
      </div>

      <div class="emperor-seatmap-screen"><span>SCREEN</span></div>

      ${(data?.sections || []).length
        ? data.sections.map(renderSection).join("")
        : `<div class="emperor-seatmap-state"><strong>此場次沒有座位 geometry</strong><span>保留場次摘要，不建立推測座位圖。</span></div>`}

      ${Array.isArray(data?.popupNotices) && data.popupNotices.length
        ? `<div class="emperor-seatmap-notices">${data.popupNotices.map(note => `<p>${escapeHtml(note)}</p>`).join("")}</div>`
        : ""}

      <p class="emperor-seatmap-note">
        座位位置直接使用 Emperor getSeatMap 的 left/top geometry。綠色代表官方 status=1 可售；其他狀態只標示為不可選、停用或隔離，不推測個別座位是否已售。此座位圖只供查看，不會鎖位或提交訂單。
      </p>
    `;
    shared?.centerAfterRender(content, ".emperor-seatmap-scroll");
  }

  async function fetchSeatMap(session, signal) {
    const scheduleId = String(session?.sourceId || "");
    const scheduleKey = String(session?.purchase?.scheduleKey || "");
    const cinemaLinkId = String(session?.cinema?.sourceId || "");
    const hallId = String(session?.house?.sourceId || "");
    if (!scheduleId || !scheduleKey || !cinemaLinkId || !hallId) {
      throw new Error("此場次缺少 Emperor SeatMap 識別資料");
    }

    const url = new URL(`/api/emperor/shows/${encodeURIComponent(scheduleId)}/seats`, API_BASE);
    url.searchParams.set("scheduleKey", scheduleKey);
    url.searchParams.set("cinemaLinkId", cinemaLinkId);
    url.searchParams.set("hallId", hallId);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal,
      headers: { Accept: "application/json" }
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Emperor SeatMap HTTP ${response.status}`);
    }
    if (!response.ok || !result?.ok || !result?.data) {
      throw new Error(result?.error?.message || `Emperor SeatMap HTTP ${response.status}`);
    }
    return result.data;
  }

  async function open(session, force = false) {
    const overlay = ensureOverlay();
    shared?.announceOpening("emperor");
    if (overlay.hidden && !returnFocus?.isConnected) returnFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("emperor-seatmap-open");

    generation += 1;
    const ownGeneration = generation;
    controller?.abort("superseded");
    controller = new AbortController();
    const requestController = controller;

    renderLoading(session);

    const key = cacheKey(session);
    const cached = force ? null : cacheGet(key);
    if (cached) {
      renderMap(session, cached);
      controller = null;
      requestAnimationFrame(() => overlay.querySelector(".emperor-seatmap-close")?.focus());
      return;
    }

    requestAnimationFrame(() => overlay.querySelector(".emperor-seatmap-close")?.focus());

    const timer = setTimeout(() => requestController.abort("timeout"), REQUEST_TIMEOUT_MS);
    try {
      const data = await fetchSeatMap(session, requestController.signal);
      if (ownGeneration !== generation || requestController.signal.aborted) return;
      cacheSet(key, data);
      renderMap(session, data);
    } catch (error) {
      if (ownGeneration !== generation || requestController.signal.reason === "close") return;
      renderError(session, error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
      if (controller === requestController) controller = null;
    }
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest?.(".emperor-seatmap-launch");
    if (trigger) {
      const session = triggerSessions.get(trigger);
      if (!session) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      returnFocus = trigger;
      open(session);
      return;
    }

    if (event.target.closest?.("[data-emperor-seatmap-close]")) {
      event.preventDefault();
      close();
    }
  }, true);

  document.addEventListener("keydown", event => {
    const overlay = document.querySelector("#emperorSeatMapOverlay");
    if (event.key === "Tab" && overlay && !overlay.hidden) {
      const focusable = Array.from(overlay.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first && (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        last.focus();
        return;
      }
      if (first && (!overlay.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        first.focus();
        return;
      }
    }

    const trigger = event.target.closest?.(".emperor-seatmap-launch");
    if (trigger && shared?.isActivationKey(event)) {
      const session = triggerSessions.get(trigger);
      if (!session) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      returnFocus = trigger;
      open(session);
      return;
    }

    if (event.key === "Escape" && !document.querySelector("#emperorSeatMapOverlay")?.hidden) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  window.addEventListener(shared?.openEvent || "hkcinema:seatmap-opening", event => {
    if (event.detail?.provider === "emperor") return;
    const overlay = document.querySelector("#emperorSeatMapOverlay");
    if (overlay && !overlay.hidden) close();
  });

  const observer = new MutationObserver(scheduleEnhance);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scheduleEnhance();
    }, { once: true });
  }

  window.HKCinemaEmperorSeatMap = {
    open,
    close,
    refresh: scheduleEnhance,
    renderSection,
    getStats() {
      return {
        capturedSessions: sessionStore.size,
        cacheEntries: seatCache.size,
        cacheTtlMs: CACHE_TTL_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS
      };
    }
  };
})();
