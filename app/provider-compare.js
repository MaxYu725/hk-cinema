(() => {
  const API_BASE =
    "https://hk-cinema-api.max-yu-jp.workers.dev";

  const state = {
    match: null,
    loadingInitial: false,
    loadingDate: false,
    selectedDate: null,
    availableDates: {
      broadway: [],
      mcl: []
    },
    data: {
      broadway: null,
      mcl: null
    },
    errors: {
      broadway: null,
      mcl: null
    }
  };

  let requestToken = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getMatch(matchId) {
    return window.HKCinemaProviderMatches?.get?.(matchId) || null;
  }

  function ensureOverlay() {
    let overlay = document.querySelector("#providerCompareOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "providerCompareOverlay";
    overlay.className = "provider-compare-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="provider-compare-backdrop" data-provider-compare-close></div>
      <aside class="provider-compare-sheet" role="dialog" aria-modal="true" aria-label="院線比較">
        <button type="button" class="provider-compare-close" data-provider-compare-close aria-label="關閉比較">×</button>
        <div id="providerCompareContent"></div>
      </aside>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function close() {
    requestToken++;
    const overlay = document.querySelector("#providerCompareOverlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("provider-compare-open");
    state.match = null;
    state.loadingInitial = false;
    state.loadingDate = false;
    state.selectedDate = null;
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T00:00:00+08:00`);
    if (Number.isNaN(date.getTime())) return dateString;

    return new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  function errorMessage(error) {
    return error instanceof Error
      ? error.message
      : String(error || "未知錯誤");
  }

  function uniqueDates(values) {
    return Array.from(
      new Set(
        (values || [])
          .map(value => String(value || "").slice(0, 10))
          .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
      )
    ).sort();
  }

  function combinedDates() {
    return uniqueDates([
      ...state.availableDates.broadway,
      ...state.availableDates.mcl
    ]);
  }

  function firstPreferredDate() {
    const broadway = new Set(state.availableDates.broadway);
    const shared = state.availableDates.mcl
      .filter(date => broadway.has(date))
      .sort();

    return shared[0] || combinedDates()[0] || null;
  }

  function dateProviders(date) {
    const broadway = state.availableDates.broadway.includes(date);
    const mcl = state.availableDates.mcl.includes(date);

    return {
      broadway,
      mcl,
      label: broadway && mcl
        ? "兩院線"
        : broadway
          ? "Broadway"
          : "MCL",
      className: broadway && mcl
        ? "both"
        : broadway
          ? "broadway"
          : "mcl"
    };
  }

  async function fetchBroadway(match, date = null) {
    const sourceId = String(match.broadway?.sourceId || "")
      .replace(/^broadway:/, "");

    if (!sourceId) {
      throw new Error("Broadway 電影 ID 缺失");
    }

    const query = date
      ? `?date=${encodeURIComponent(date)}`
      : "";

    const response = await fetch(
      `${API_BASE}/api/broadway/movies/${encodeURIComponent(sourceId)}/shows${query}`,
      { cache: "no-store" }
    );

    if (response.status === 404) {
      return {
        availableDates: [],
        selectedDate: date,
        sessions: []
      };
    }

    let result = null;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Broadway HTTP ${response.status}`);
    }

    if (!response.ok || !result?.ok || !result?.data) {
      throw new Error(
        result?.error?.message ||
        `Broadway HTTP ${response.status}`
      );
    }

    return result.data;
  }

  async function fetchMCL(match, date = null) {
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider?.getTicketing) {
      throw new Error("MCL ticketing provider 未能載入");
    }

    const sourceId = String(match.mcl?.sourceId || "")
      .replace(/^mcl:/, "");

    if (!sourceId) {
      throw new Error("MCL 電影 ID 缺失");
    }

    return await provider.getTicketing(sourceId, date);
  }

  function normalizeBroadwaySession(session) {
    const seat = session?.seatSummary || {};
    let seatText = "座位資料暫缺";
    let seatClass = "unknown";

    if (Number.isFinite(seat.available)) {
      seatText = Number.isFinite(seat.total)
        ? `${seat.available}/${seat.total} 可選`
        : `${seat.available} 個可選`;

      if (seat.available <= 0) {
        seatClass = "full";
      } else if (seat.available <= 10) {
        seatClass = "limited";
      } else {
        seatClass = "available";
      }
    }

    return {
      id: `broadway:${session?.sourceId || session?.id || Math.random()}`,
      provider: "broadway",
      providerLabel: "Broadway",
      time: String(session?.time || "--:--"),
      cinemaName:
        session?.cinema?.name?.zh ||
        session?.cinema?.name?.en ||
        "Broadway 戲院",
      secondary: [
        session?.house?.name,
        session?.format,
        session?.language
      ].filter(Boolean).join(" · "),
      price: Number.isFinite(session?.price?.display)
        ? session.price.display
        : null,
      seatText,
      seatClass,
      bookingUrl: session?.bookingUrl || null
    };
  }

  function normalizeMCLSession(session) {
    const occupied = session?.seatSummary?.occupiedPercent;
    let seatText = "座位資料稍後提供";
    let seatClass = "unknown";

    if (Number.isFinite(occupied)) {
      seatText = `約 ${Math.round(occupied)}% 已售`;
      seatClass = occupied >= 90
        ? "full"
        : occupied >= 70
          ? "limited"
          : "available";
    }

    const price = Number.isFinite(session?.price?.adult)
      ? session.price.adult
      : Number.isFinite(session?.price?.display)
        ? session.price.display
        : null;

    return {
      id: `mcl:${session?.sourceId || session?.id || Math.random()}`,
      provider: "mcl",
      providerLabel: "MCL",
      time: String(session?.time || "--:--"),
      cinemaName:
        session?.cinema?.name?.zh ||
        session?.cinema?.name?.en ||
        "MCL 戲院",
      secondary: [
        session?.house?.name,
        session?.format,
        session?.language
      ].filter(Boolean).join(" · "),
      price,
      seatText,
      seatClass,
      bookingUrl: session?.bookingUrl || null
    };
  }

  function timeValue(time) {
    const match = String(time || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function timelineSessions() {
    const items = [];

    if (
      state.data.broadway &&
      state.availableDates.broadway.includes(state.selectedDate)
    ) {
      items.push(
        ...(state.data.broadway.sessions || [])
          .map(normalizeBroadwaySession)
      );
    }

    if (
      state.data.mcl &&
      state.availableDates.mcl.includes(state.selectedDate)
    ) {
      items.push(
        ...(state.data.mcl.sessions || [])
          .map(normalizeMCLSession)
      );
    }

    return items.sort((a, b) => {
      const difference = timeValue(a.time) - timeValue(b.time);
      if (difference) return difference;
      return a.provider.localeCompare(b.provider);
    });
  }

  function providerErrorHtml() {
    const messages = [];

    if (state.errors.broadway) {
      messages.push(`Broadway：${state.errors.broadway}`);
    }

    if (state.errors.mcl) {
      messages.push(`MCL：${state.errors.mcl}`);
    }

    if (!messages.length) return "";

    return `
      <div class="provider-compare-warning">
        <strong>部分院線暫時無法更新</strong>
        ${messages.map(message => `<span>${escapeHtml(message)}</span>`).join("")}
        <button type="button" data-provider-compare-retry>重新載入比較</button>
      </div>
    `;
  }

  function renderDates() {
    const dates = combinedDates();
    if (!dates.length) return "";

    return `
      <section class="provider-compare-section provider-compare-dates-section">
        <div class="provider-compare-section-heading">
          <div>
            <p class="eyebrow">DATES</p>
            <h2>可售日期</h2>
          </div>
          <small>優先選擇兩院線都有場次的日期</small>
        </div>
        <div class="provider-compare-dates">
          ${dates.map(date => {
            const availability = dateProviders(date);
            return `
              <button
                type="button"
                class="provider-compare-date ${date === state.selectedDate ? "active" : ""}"
                data-provider-compare-date="${escapeHtml(date)}"
              >
                <strong>${escapeHtml(formatDate(date))}</strong>
                <span class="${availability.className}">${escapeHtml(availability.label)}</span>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderTimelineItem(item) {
    const content = `
      <div class="provider-compare-show-time">${escapeHtml(item.time)}</div>
      <div class="provider-compare-show-main">
        <div class="provider-compare-show-topline">
          <span class="provider-compare-source ${escapeHtml(item.provider)}">${escapeHtml(item.providerLabel)}</span>
          <strong>${escapeHtml(item.cinemaName)}</strong>
        </div>
        ${item.secondary ? `<p>${escapeHtml(item.secondary)}</p>` : ""}
        <span class="provider-compare-seat ${escapeHtml(item.seatClass)}">${escapeHtml(item.seatText)}</span>
      </div>
      <div class="provider-compare-show-price">
        ${Number.isFinite(item.price) ? `$${escapeHtml(item.price)}` : "—"}
      </div>
    `;

    if (item.bookingUrl) {
      return `
        <a
          class="provider-compare-show"
          href="${escapeHtml(item.bookingUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >${content}</a>
      `;
    }

    return `<div class="provider-compare-show">${content}</div>`;
  }

  function renderTimeline() {
    if (state.loadingDate) {
      return `
        <section class="provider-compare-section">
          <div class="provider-compare-loading">
            <strong>正在整理同日場次</strong>
            <span>正在讀取 Broadway 與 MCL 的場次及票價...</span>
          </div>
        </section>
      `;
    }

    if (!state.selectedDate) return "";

    const sessions = timelineSessions();
    const broadwayCount = state.data.broadway?.sessions?.length || 0;
    const mclCount = state.data.mcl?.sessions?.length || 0;

    return `
      <section class="provider-compare-section provider-compare-timeline-section">
        <div class="provider-compare-section-heading">
          <div>
            <p class="eyebrow">${escapeHtml(formatDate(state.selectedDate))}</p>
            <h2>跨院線時間線</h2>
          </div>
          <small>Broadway ${broadwayCount} 場 · MCL ${mclCount} 場 · 共 ${sessions.length} 場</small>
        </div>

        ${
          sessions.length
            ? `<div class="provider-compare-timeline">${sessions.map(renderTimelineItem).join("")}</div>`
            : `
              <div class="provider-compare-empty">
                <strong>這一天暫時沒有可比較場次</strong>
                <span>可選擇其他日期，或稍後重新載入。</span>
              </div>
            `
        }

        <p class="provider-compare-note">
          場次按時間排序。票價目前顯示成人票價；點場次會前往所屬院線官方購票頁。最便宜、最快及座位比較會在 Phase 5C 加入。
        </p>
      </section>
    `;
  }

  function render() {
    const match = state.match;
    if (!match) return;

    const overlay = ensureOverlay();
    const content = overlay.querySelector("#providerCompareContent");
    const mclMovie = match.mcl?.movie || {};
    const poster = match.broadway?.poster || mclMovie.poster || null;

    const body = state.loadingInitial
      ? `
        <section class="provider-compare-section">
          <div class="provider-compare-loading">
            <strong>正在建立跨院線比較</strong>
            <span>正在同時取得 Broadway 與 MCL 可售日期...</span>
          </div>
        </section>
      `
      : `
        ${providerErrorHtml()}
        ${renderDates()}
        ${renderTimeline()}
      `;

    content.innerHTML = `
      <div class="provider-compare-hero">
        ${
          poster
            ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(match.title)}">`
            : `<div class="provider-compare-poster-placeholder">HK</div>`
        }
        <div>
          <p class="eyebrow">BROADWAY × MCL</p>
          <h1>${escapeHtml(match.title)}</h1>
          <div class="provider-compare-status">
            <span>已配對</span>
            <small>精確標題 · 信心 ${Math.round((match.confidence || 0) * 100)}%</small>
          </div>
        </div>
      </div>

      ${body}
    `;

    overlay.hidden = false;
    document.body.classList.add("provider-compare-open");
  }

  async function loadDate(date, token = requestToken) {
    if (!state.match || !date) return;

    state.selectedDate = date;
    state.loadingDate = true;
    render();

    const hasBroadway = state.availableDates.broadway.includes(date);
    const hasMCL = state.availableDates.mcl.includes(date);

    const broadwayPromise = !hasBroadway
      ? Promise.resolve(null)
      : state.data.broadway?.selectedDate === date
        ? Promise.resolve(state.data.broadway)
        : fetchBroadway(state.match, date);

    const mclPromise = !hasMCL
      ? Promise.resolve(null)
      : state.data.mcl?.selectedDate === date
        ? Promise.resolve(state.data.mcl)
        : fetchMCL(state.match, date);

    const [broadwayResult, mclResult] = await Promise.allSettled([
      broadwayPromise,
      mclPromise
    ]);

    if (token !== requestToken || !state.match) return;

    if (broadwayResult.status === "fulfilled") {
      state.data.broadway = broadwayResult.value;
      if (hasBroadway) state.errors.broadway = null;
    } else {
      state.data.broadway = null;
      state.errors.broadway = errorMessage(broadwayResult.reason);
    }

    if (mclResult.status === "fulfilled") {
      state.data.mcl = mclResult.value;
      if (hasMCL) state.errors.mcl = null;
    } else {
      state.data.mcl = null;
      state.errors.mcl = errorMessage(mclResult.reason);
    }

    state.loadingDate = false;
    render();
  }

  async function loadInitial(match) {
    const token = ++requestToken;

    state.match = match;
    state.loadingInitial = true;
    state.loadingDate = false;
    state.selectedDate = null;
    state.availableDates.broadway = [];
    state.availableDates.mcl = [];
    state.data.broadway = null;
    state.data.mcl = null;
    state.errors.broadway = null;
    state.errors.mcl = null;
    render();

    const [broadwayResult, mclResult] = await Promise.allSettled([
      fetchBroadway(match),
      fetchMCL(match)
    ]);

    if (token !== requestToken || state.match?.id !== match.id) return;

    if (broadwayResult.status === "fulfilled") {
      state.data.broadway = broadwayResult.value;
      state.availableDates.broadway = uniqueDates(
        broadwayResult.value?.availableDates || []
      );
    } else {
      state.errors.broadway = errorMessage(broadwayResult.reason);
    }

    if (mclResult.status === "fulfilled") {
      state.data.mcl = mclResult.value;
      state.availableDates.mcl = uniqueDates(
        mclResult.value?.availableDates || []
      );
    } else {
      state.errors.mcl = errorMessage(mclResult.reason);
    }

    state.loadingInitial = false;
    const preferredDate = firstPreferredDate();

    if (preferredDate) {
      await loadDate(preferredDate, token);
    } else {
      render();
    }
  }

  function open(matchId) {
    const match = getMatch(matchId);
    if (!match) return false;
    loadInitial(match);
    return true;
  }

  window.HKCinemaProviderCompare = {
    open,
    close,
    getState() {
      return {
        match: state.match,
        selectedDate: state.selectedDate,
        availableDates: {
          broadway: [...state.availableDates.broadway],
          mcl: [...state.availableDates.mcl]
        },
        errors: { ...state.errors }
      };
    }
  };

  document.addEventListener("click", event => {
    const openButton = event.target.closest("[data-compare-open]");
    if (openButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      open(openButton.dataset.compareOpen);
      return;
    }

    if (event.target.closest("[data-provider-compare-close]")) {
      event.preventDefault();
      close();
      return;
    }

    const dateButton = event.target.closest("[data-provider-compare-date]");
    if (dateButton) {
      event.preventDefault();
      loadDate(dateButton.dataset.providerCompareDate, requestToken);
      return;
    }

    const retry = event.target.closest("[data-provider-compare-retry]");
    if (retry && state.match) {
      event.preventDefault();
      loadInitial(state.match);
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      !document.querySelector("#providerCompareOverlay")?.hidden
    ) {
      close();
    }
  });
})();
