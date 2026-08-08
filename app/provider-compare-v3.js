(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const TIMEOUTS = {
    broadway: 12000,
    mcl: 15000,
    emperor: 12000
  };
  const PROVIDERS = [
    { key: "broadway", label: "Broadway" },
    { key: "mcl", label: "MCL" },
    { key: "emperor", label: "Emperor" }
  ];

  const state = {
    match: null,
    loadingInitial: false,
    loadingDate: false,
    selectedDate: null,
    availableDates: {
      broadway: [],
      mcl: [],
      emperor: []
    },
    data: {
      broadway: null,
      mcl: null,
      emperor: null
    },
    errors: {
      broadway: null,
      mcl: null,
      emperor: null
    }
  };

  let requestToken = 0;
  let activeRequestController = null;

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

  function activeProviders(match = state.match) {
    return PROVIDERS.filter(provider => Boolean(match?.[provider.key]));
  }

  function providerLabels(match = state.match) {
    return activeProviders(match).map(provider => provider.label);
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

  function abortActiveRequest(reason = "superseded") {
    if (!activeRequestController) return;
    try {
      activeRequestController.abort(reason);
    } catch {
      activeRequestController.abort();
    }
    activeRequestController = null;
  }

  function beginRequestCycle() {
    abortActiveRequest("superseded");
    const token = ++requestToken;
    const controller = new AbortController();
    activeRequestController = controller;
    return { token, signal: controller.signal };
  }

  function close() {
    abortActiveRequest("close");
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
    return Array.from(new Set(
      (values || [])
        .map(value => String(value || "").slice(0, 10))
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )).sort();
  }

  function combinedDates() {
    return uniqueDates(
      activeProviders().flatMap(provider => state.availableDates[provider.key] || [])
    );
  }

  function firstPreferredDate() {
    const dates = combinedDates();
    if (!dates.length) return null;

    return dates
      .map(date => ({
        date,
        count: activeProviders().filter(provider =>
          state.availableDates[provider.key].includes(date)
        ).length
      }))
      .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))[0]?.date || null;
  }

  function dateProviders(date) {
    const available = activeProviders().filter(provider =>
      state.availableDates[provider.key].includes(date)
    );
    const activeCount = activeProviders().length;
    let label = available.map(provider => provider.label).join(" + ");

    if (available.length === activeCount && activeCount === 3) label = "三院線";
    if (available.length === activeCount && activeCount === 2) label = "兩院線";
    if (!label) label = "暫無院線";

    return {
      label,
      className: available.length >= 2
        ? "both"
        : available[0]?.key || "none"
    };
  }

  function childController(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const onParentAbort = () => {
      try {
        controller.abort(parentSignal?.reason || "lifecycle");
      } catch {
        controller.abort();
      }
    };
    if (parentSignal?.aborted) onParentAbort();
    else parentSignal?.addEventListener?.("abort", onParentAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort("timeout");
      } catch {
        controller.abort();
      }
    }, timeoutMs);

    return {
      controller,
      timedOut: () => timedOut,
      cleanup() {
        clearTimeout(timer);
        parentSignal?.removeEventListener?.("abort", onParentAbort);
      }
    };
  }

  async function fetchWorkerShows(provider, sourceId, date, parentSignal) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const lifecycle = childController(parentSignal, TIMEOUTS[provider]);

    try {
      const response = await fetch(
        `${API_BASE}/api/${provider}/movies/${encodeURIComponent(sourceId)}/shows${query}`,
        { cache: "no-store", signal: lifecycle.controller.signal }
      );

      if (response.status === 404) {
        return { availableDates: [], selectedDate: date, sessions: [] };
      }

      let result = null;
      try {
        result = await response.json();
      } catch {
        throw new Error(`${provider} HTTP ${response.status}`);
      }

      if (!response.ok || !result?.ok || !result?.data) {
        throw new Error(result?.error?.message || `${provider} HTTP ${response.status}`);
      }
      return result.data;
    } catch (error) {
      if (lifecycle.timedOut()) {
        const label = provider === "emperor" ? "Emperor" : "Broadway";
        throw new Error(`${label} 場次讀取逾時，請稍後重試。`);
      }
      throw error;
    } finally {
      lifecycle.cleanup();
    }
  }

  function guardPromise(promise, signal, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
      };
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      const onAbort = () => {
        const error = new Error("Comparison request cancelled");
        error.name = "AbortError";
        settle(reject, error);
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener?.("abort", onAbort, { once: true });
      timer = setTimeout(() => settle(reject, new Error(timeoutMessage)), timeoutMs);
      Promise.resolve(promise).then(
        value => settle(resolve, value),
        error => settle(reject, error)
      );
    });
  }

  async function fetchProvider(provider, match, date, signal) {
    const entry = match?.[provider];
    if (!entry) return null;
    const sourceId = String(entry.sourceId || "").replace(new RegExp(`^${provider}:`), "");
    if (!sourceId) throw new Error(`${provider} 電影 ID 缺失`);

    if (provider === "mcl") {
      const mcl = window.HKCinemaProviders?.mcl;
      if (!mcl?.getTicketing) throw new Error("MCL ticketing provider 未能載入");
      return await guardPromise(
        mcl.getTicketing(sourceId, date),
        signal,
        TIMEOUTS.mcl,
        "MCL 場次讀取逾時，請稍後重試。"
      );
    }

    return await fetchWorkerShows(provider, sourceId, date, signal);
  }

  function seatClass(available, total = null) {
    if (!Number.isFinite(available)) return "unknown";
    if (available <= 0) return "full";
    if (Number.isFinite(total) && total > 0) {
      const ratio = available / total;
      if (ratio <= 0.08) return "full";
      if (ratio <= 0.25) return "limited";
    }
    if (available <= 10) return "limited";
    return "available";
  }

  function normalizeBroadwaySession(session) {
    const seat = session?.seatSummary || {};
    const available = Number.isFinite(seat.available) ? seat.available : null;
    const total = Number.isFinite(seat.total) ? seat.total : null;
    const seatText = Number.isFinite(available)
      ? Number.isFinite(total) ? `${available}/${total} 可選` : `${available} 個可選`
      : "座位資料暫缺";

    return {
      id: `broadway:${session?.sourceId || session?.id || Math.random()}`,
      provider: "broadway",
      providerLabel: "Broadway",
      time: String(session?.time || "--:--"),
      cinemaName: session?.cinema?.name?.zh || session?.cinema?.name?.en || "Broadway 戲院",
      secondary: [session?.house?.name, session?.format, session?.language].filter(Boolean).join(" · "),
      price: Number.isFinite(session?.price?.display) ? session.price.display : null,
      seatText,
      seatClass: seatClass(available, total),
      seatAvailable: available,
      seatTotal: total,
      bookingUrl: session?.bookingUrl || null
    };
  }

  function normalizeMCLSession(session) {
    const occupied = session?.seatSummary?.occupiedPercent;
    let seatText = "座位資料稍後提供";
    let klass = "unknown";
    if (Number.isFinite(occupied)) {
      seatText = `約 ${Math.round(occupied)}% 已售`;
      klass = occupied >= 90 ? "full" : occupied >= 70 ? "limited" : "available";
    }
    const price = Number.isFinite(session?.price?.adult)
      ? session.price.adult
      : Number.isFinite(session?.price?.display) ? session.price.display : null;

    return {
      id: `mcl:${session?.sourceId || session?.id || Math.random()}`,
      provider: "mcl",
      providerLabel: "MCL",
      time: String(session?.time || "--:--"),
      cinemaName: session?.cinema?.name?.zh || session?.cinema?.name?.en || "MCL 戲院",
      secondary: [session?.house?.name, session?.format, session?.language].filter(Boolean).join(" · "),
      price,
      seatText,
      seatClass: klass,
      seatAvailable: null,
      seatTotal: null,
      bookingUrl: session?.bookingUrl || null
    };
  }

  function normalizeEmperorSession(session) {
    const summary = session?.seatSummary || {};
    const available = Number.isFinite(summary.available) ? summary.available : null;
    const total = Number.isFinite(summary.total) ? summary.total : null;
    const seatText = Number.isFinite(available)
      ? Number.isFinite(total) ? `${available}/${total} 未售` : `${available} 未售`
      : "座位資料暫缺";

    return {
      id: `emperor:${session?.sourceId || session?.id || Math.random()}`,
      provider: "emperor",
      providerLabel: "Emperor",
      time: String(session?.time || "--:--"),
      cinemaName: session?.cinema?.name?.zh || "Emperor Cinemas",
      secondary: [
        session?.house?.name,
        session?.format,
        session?.language,
        session?.subtitle ? `字幕：${session.subtitle}` : null
      ].filter(Boolean).join(" · "),
      price: Number.isFinite(session?.price?.display) ? session.price.display : null,
      seatText,
      seatClass: seatClass(available, total),
      seatAvailable: available,
      seatTotal: total,
      bookingUrl: session?.bookingUrl || state.match?.emperor?.movie?.bookingUrl || null
    };
  }

  function normalizeSession(provider, session) {
    if (provider === "mcl") return normalizeMCLSession(session);
    if (provider === "emperor") return normalizeEmperorSession(session);
    return normalizeBroadwaySession(session);
  }

  function timeValue(time) {
    const match = String(time || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function timelineSessions() {
    const items = [];
    for (const provider of activeProviders()) {
      const key = provider.key;
      if (!state.data[key] || !state.availableDates[key].includes(state.selectedDate)) continue;
      items.push(...(state.data[key].sessions || []).map(session => normalizeSession(key, session)));
    }

    return items.sort((a, b) => {
      const difference = timeValue(a.time) - timeValue(b.time);
      if (difference) return difference;
      return a.provider.localeCompare(b.provider);
    });
  }

  function providerErrorHtml() {
    const messages = activeProviders()
      .filter(provider => state.errors[provider.key])
      .map(provider => `${provider.label}：${state.errors[provider.key]}`);
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
    const activeCount = activeProviders().length;

    return `
      <section class="provider-compare-section provider-compare-dates-section">
        <div class="provider-compare-section-heading">
          <div>
            <p class="eyebrow">DATES</p>
            <h2>可售日期</h2>
          </div>
          <small>優先選擇最多院線同時有場次的日期</small>
        </div>
        <div class="provider-compare-dates" data-provider-count="${activeCount}">
          ${dates.map(date => {
            const availability = dateProviders(date);
            return `
              <button type="button" class="provider-compare-date ${date === state.selectedDate ? "active" : ""}" data-provider-compare-date="${escapeHtml(date)}">
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
    const seatAttrs = [
      Number.isFinite(item.seatAvailable) ? `data-seat-available="${item.seatAvailable}"` : "",
      Number.isFinite(item.seatTotal) ? `data-seat-total="${item.seatTotal}"` : ""
    ].filter(Boolean).join(" ");
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
      <div class="provider-compare-show-price">${Number.isFinite(item.price) ? `$${escapeHtml(item.price)}` : "—"}</div>
    `;

    if (item.bookingUrl) {
      return `<a class="provider-compare-show" ${seatAttrs} href="${escapeHtml(item.bookingUrl)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
    }
    return `<div class="provider-compare-show" ${seatAttrs}>${content}</div>`;
  }

  function renderTimeline() {
    const labels = providerLabels();
    if (state.loadingDate) {
      return `
        <section class="provider-compare-section">
          <div class="provider-compare-loading">
            <strong>正在整理同日場次</strong>
            <span>正在讀取 ${escapeHtml(labels.join("、"))} 的場次及票價...</span>
          </div>
        </section>
      `;
    }
    if (!state.selectedDate) return "";

    const sessions = timelineSessions();
    const counts = activeProviders().map(provider =>
      `${provider.label} ${state.data[provider.key]?.sessions?.length || 0} 場`
    );

    return `
      <section class="provider-compare-section provider-compare-timeline-section">
        <div class="provider-compare-section-heading">
          <div>
            <p class="eyebrow">${escapeHtml(formatDate(state.selectedDate))}</p>
            <h2>跨院線時間線</h2>
          </div>
          <small>${escapeHtml(counts.join(" · "))} · 共 ${sessions.length} 場</small>
        </div>
        ${sessions.length
          ? `<div class="provider-compare-timeline">${sessions.map(renderTimelineItem).join("")}</div>`
          : `<div class="provider-compare-empty"><strong>這一天暫時沒有可比較場次</strong><span>可選擇其他日期，或稍後重新載入。</span></div>`}
        <p class="provider-compare-note">
          場次按時間排序；票價顯示各院線目前提供的標準／成人場次價格。座位數字會在資料齊全時開啟所屬院線唯讀座位圖，其餘位置則前往官方購票頁；MCL 摘要仍會在接近畫面時自動更新。
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
    const emperorMovie = match.emperor?.movie || {};
    const poster = match.broadway?.poster || mclMovie.poster || emperorMovie.poster || null;
    const labels = providerLabels(match);

    const body = state.loadingInitial
      ? `
        <section class="provider-compare-section">
          <div class="provider-compare-loading">
            <strong>正在建立跨院線比較</strong>
            <span>正在同時取得 ${escapeHtml(labels.join("、"))} 可售日期...</span>
          </div>
        </section>
      `
      : `${providerErrorHtml()}${renderDates()}${renderTimeline()}`;

    content.innerHTML = `
      <div class="provider-compare-hero">
        ${poster
          ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(match.title)}">`
          : `<div class="provider-compare-poster-placeholder">HK</div>`}
        <div>
          <p class="eyebrow">${escapeHtml(labels.join(" × ").toUpperCase())}</p>
          <h1>${escapeHtml(match.title)}</h1>
          <div class="provider-compare-status">
            <span>已配對</span>
            <small>精確標題 · ${labels.length} 院線 · 信心 ${Math.round((match.confidence || 0) * 100)}%</small>
          </div>
        </div>
      </div>
      ${body}
    `;

    overlay.hidden = false;
    document.body.classList.add("provider-compare-open");
  }

  async function loadDate(date, cycle = null) {
    if (!state.match || !date) return;
    const requestCycle = cycle || beginRequestCycle();
    const { token, signal } = requestCycle;

    state.selectedDate = date;
    state.loadingDate = true;
    render();

    const providers = activeProviders();
    const promises = providers.map(provider => {
      const key = provider.key;
      const hasDate = state.availableDates[key].includes(date);
      if (!hasDate) return Promise.resolve(null);
      if (state.data[key]?.selectedDate === date) return Promise.resolve(state.data[key]);
      return fetchProvider(key, state.match, date, signal);
    });

    const results = await Promise.allSettled(promises);
    if (token !== requestToken || signal.aborted || !state.match || state.selectedDate !== date) return;

    results.forEach((result, index) => {
      const key = providers[index].key;
      const hasDate = state.availableDates[key].includes(date);
      if (result.status === "fulfilled") {
        state.data[key] = result.value;
        if (hasDate) state.errors[key] = null;
      } else {
        state.data[key] = null;
        state.errors[key] = errorMessage(result.reason);
      }
    });

    state.loadingDate = false;
    render();
  }

  async function loadInitial(match) {
    const cycle = beginRequestCycle();
    const { token, signal } = cycle;

    state.match = match;
    state.loadingInitial = true;
    state.loadingDate = false;
    state.selectedDate = null;
    for (const provider of PROVIDERS) {
      state.availableDates[provider.key] = [];
      state.data[provider.key] = null;
      state.errors[provider.key] = null;
    }
    render();

    const providers = activeProviders(match);
    const results = await Promise.allSettled(
      providers.map(provider => fetchProvider(provider.key, match, null, signal))
    );

    if (token !== requestToken || signal.aborted || state.match?.id !== match.id) return;

    results.forEach((result, index) => {
      const key = providers[index].key;
      if (result.status === "fulfilled") {
        state.data[key] = result.value;
        state.availableDates[key] = uniqueDates(result.value?.availableDates || []);
      } else {
        state.errors[key] = errorMessage(result.reason);
      }
    });

    state.loadingInitial = false;
    const preferredDate = firstPreferredDate();
    if (preferredDate) await loadDate(preferredDate, cycle);
    else render();
  }

  function open(matchId) {
    const match = getMatch(matchId);
    if (!match || activeProviders(match).length < 2) return false;
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
          mcl: [...state.availableDates.mcl],
          emperor: [...state.availableDates.emperor]
        },
        errors: { ...state.errors },
        request: {
          token: requestToken,
          active: Boolean(activeRequestController && !activeRequestController.signal.aborted)
        }
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
      loadDate(dateButton.dataset.providerCompareDate);
      return;
    }

    const retry = event.target.closest("[data-provider-compare-retry]");
    if (retry && state.match) {
      event.preventDefault();
      loadInitial(state.match);
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.querySelector("#providerCompareOverlay")?.hidden) {
      close();
    }
  });
})();
