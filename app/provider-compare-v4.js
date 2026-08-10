(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const TIMEOUTS = { broadway: 12000, mcl: 15000, emperor: 12000 };
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
    availableDates: { broadway: [], mcl: [], emperor: [] },
    criteriaDateDecisions: { broadway: new Map(), mcl: new Map(), emperor: new Map() },
    data: { broadway: null, mcl: null, emperor: null },
    errors: { broadway: null, mcl: null, emperor: null },
    freshness: { broadway: null, mcl: null, emperor: null }
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

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function normalizeSourceId(provider, value) {
    return String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
  }

  function getMatch(matchId) {
    return window.HKCinemaProviderMatches?.get?.(matchId) || null;
  }

  function aggregateForMatch(match = state.match) {
    if (!match?.id) return null;
    const aggregate = window.HKCinemaMovieAggregates?.get?.(match.id) || null;
    return aggregate?.id === match.id ? aggregate : null;
  }

  function providerSourceIds(provider, match = state.match) {
    const aggregate = aggregateForMatch(match);
    if (aggregate) {
      return unique((aggregate.sources?.[provider] || []).map(value => normalizeSourceId(provider, value)));
    }
    const sourceId = normalizeSourceId(provider, match?.[provider]?.sourceId);
    return sourceId ? [sourceId] : [];
  }

  function variantTagsForSource(provider, sourceId, match = state.match) {
    const aggregate = aggregateForMatch(match);
    if (!aggregate) return [];
    const normalized = normalizeSourceId(provider, sourceId);
    return unique((aggregate.variants || [])
      .filter(variant => normalizeSourceId(provider, variant?.sourceIds?.[provider]) === normalized)
      .flatMap(variant => {
        const tags = Array.isArray(variant.tags) ? variant.tags : [];
        if (tags.length) return tags;
        return variant.label && variant.label !== "一般版本" ? [variant.label] : [];
      }));
  }

  function activeProviders(match = state.match) {
    return PROVIDERS.filter(provider => providerSourceIds(provider.key, match).length > 0);
  }

  function providerLabels(match = state.match) {
    return activeProviders(match).map(provider => provider.label);
  }

  function metadataCore() {
    return window.HKCinemaShowtimeMetadata || null;
  }

  function sessionMetadata(session) {
    return metadataCore()?.normalizeSession?.(session) || {
      languages: ["unknown"],
      subtitles: ["unknown"],
      formats: ["unknown"],
      languageLabels: ["語言未提供"],
      subtitleLabels: ["字幕未提供"],
      formatLabels: []
    };
  }

  function usesSessionCriteria(provider, match = state.match) {
    if (aggregateForMatch(match)) return false;
    return Boolean(match?.sessionCriteria && match?.comparisonOnlyProviders?.includes?.(provider));
  }

  function rawSessionMatches(provider, session, match = state.match) {
    if (!usesSessionCriteria(provider, match)) return true;
    return Boolean(metadataCore()?.matchesCriteria?.(sessionMetadata(session), match.sessionCriteria));
  }

  function filteredRawSessions(provider, sessions, match = state.match) {
    return (sessions || []).filter(session => rawSessionMatches(provider, session, match));
  }

  function uniqueDates(values) {
    return Array.from(new Set((values || [])
      .map(value => String(value || "").slice(0, 10))
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))).sort();
  }

  function availableDatesFor(provider, result, match = state.match) {
    if (aggregateForMatch(match)) return uniqueDates(result?.availableDates || []);
    if (!usesSessionCriteria(provider, match) || !Array.isArray(result?.allSessions)) {
      return uniqueDates(result?.availableDates || []);
    }
    return uniqueDates(metadataCore()?.candidateDatesForCriteria?.(
      result,
      match.sessionCriteria,
      state.criteriaDateDecisions[provider]
    ) || result?.availableDates || []);
  }

  function rememberCriteriaDateDecision(provider, result, match = state.match) {
    if (!usesSessionCriteria(provider, match)) return;
    const decision = metadataCore()?.selectedDateDecisionForCriteria?.(result, match.sessionCriteria);
    if (!decision?.date || !["match", "mismatch"].includes(decision.status)) return;
    state.criteriaDateDecisions[provider].set(decision.date, decision.status);
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
      <aside class="provider-compare-sheet" role="dialog" aria-modal="true" aria-label="電影場次比較">
        <button type="button" class="provider-compare-close" data-provider-compare-close aria-label="關閉比較">×</button>
        <div id="providerCompareContent"></div>
      </aside>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function abortActiveRequest(reason = "superseded") {
    if (!activeRequestController) return;
    try { activeRequestController.abort(reason); } catch { activeRequestController.abort(); }
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
    return error instanceof Error ? error.message : String(error || "未知錯誤");
  }

  function combinedDates() {
    return uniqueDates(activeProviders().flatMap(provider => state.availableDates[provider.key] || []));
  }

  function firstPreferredDate() {
    const dates = combinedDates();
    if (!dates.length) return null;
    return dates.map(date => ({
      date,
      count: activeProviders().filter(provider => state.availableDates[provider.key].includes(date)).length
    })).sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))[0]?.date || null;
  }

  function dateProviders(date) {
    const available = activeProviders().filter(provider => state.availableDates[provider.key].includes(date));
    const activeCount = activeProviders().length;
    let label = available.map(provider => provider.label).join(" + ");
    if (available.length === activeCount && activeCount === 3) label = "三院線";
    if (available.length === activeCount && activeCount === 2) label = "兩院線";
    if (!label) label = "暫無院線";
    return { label, className: available.length >= 2 ? "both" : available[0]?.key || "none" };
  }

  function childController(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const onParentAbort = () => {
      try { controller.abort(parentSignal?.reason || "lifecycle"); } catch { controller.abort(); }
    };
    if (parentSignal?.aborted) onParentAbort();
    else parentSignal?.addEventListener?.("abort", onParentAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      try { controller.abort("timeout"); } catch { controller.abort(); }
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
        return { availableDates: [], selectedDate: date, sessions: [], _health: { updatedAt: new Date().toISOString(), source: "network" } };
      }
      let result = null;
      try { result = await response.json(); } catch { throw new Error(`${provider} HTTP ${response.status}`); }
      if (!response.ok || !result?.ok || !result?.data) {
        throw new Error(result?.error?.message || `${provider} HTTP ${response.status}`);
      }
      return {
        ...result.data,
        _health: {
          updatedAt: result.meta?.updatedAt || new Date().toISOString(),
          source: result.meta?.cache ? "cache" : "network"
        }
      };
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

  async function fetchProviderSource(provider, sourceId, date, signal) {
    if (provider !== "mcl") return fetchWorkerShows(provider, sourceId, date, signal);
    const mcl = window.HKCinemaProviders?.mcl;
    if (!mcl?.getTicketing) throw new Error("MCL ticketing provider 未能載入");
    const lifecycle = childController(signal, TIMEOUTS.mcl);
    try {
      const result = await mcl.getTicketing(sourceId, date, { signal: lifecycle.controller.signal });
      if (lifecycle.timedOut()) throw new Error("MCL 場次讀取逾時，請稍後重試。");
      return {
        ...result,
        _health: {
          updatedAt: result?.source?.updatedAt || new Date().toISOString(),
          source: result?.source?.cache ? "cache" : "network"
        }
      };
    } catch (error) {
      if (lifecycle.timedOut()) throw new Error("MCL 場次讀取逾時，請稍後重試。");
      throw error;
    } finally {
      lifecycle.cleanup();
    }
  }

  function enrichSessionWithVariant(provider, sourceId, session, match) {
    const tags = variantTagsForSource(provider, sourceId, match);
    if (!tags.length) return { ...session, _phase8cMovieSourceId: sourceId };
    const versionText = tags.join(" · ");
    return {
      ...session,
      versionName: [session?.versionName, versionText].filter(Boolean).join(" · "),
      _phase8cMovieSourceId: sourceId,
      _phase8cVariantTags: tags
    };
  }

  function mergedHealth(results) {
    const health = results.map(item => item.result?._health).filter(Boolean);
    if (!health.length) return { updatedAt: new Date().toISOString(), source: "network" };
    return health.slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
  }

  async function fetchProvider(provider, match, date, signal) {
    const sourceIds = providerSourceIds(provider, match);
    if (!sourceIds.length) return null;
    const settled = await Promise.allSettled(sourceIds.map(sourceId => fetchProviderSource(provider, sourceId, date, signal)));
    const successes = [];
    const failures = [];
    settled.forEach((result, index) => {
      const sourceId = sourceIds[index];
      if (result.status === "fulfilled") successes.push({ sourceId, result: result.value });
      else failures.push({ sourceId, error: errorMessage(result.reason) });
    });
    if (!successes.length) {
      throw new Error(failures.map(item => item.error).filter(Boolean).join("；") || `${provider} 場次暫不可用`);
    }

    const sessions = successes.flatMap(item =>
      (item.result?.sessions || []).map(session => enrichSessionWithVariant(provider, item.sourceId, session, match))
    );
    const allSessions = successes.flatMap(item =>
      (item.result?.allSessions || []).map(session => enrichSessionWithVariant(provider, item.sourceId, session, match))
    );
    const selectedDates = uniqueDates(successes.map(item => item.result?.selectedDate));
    const metadataComplete = provider !== "mcl" || successes.every(item => item.result?.metadataComplete === true);

    return {
      availableDates: uniqueDates(successes.flatMap(item => item.result?.availableDates || [])),
      selectedDate: date || selectedDates[0] || null,
      sessions,
      allSessions,
      metadataComplete,
      _requestedDate: date || null,
      _health: mergedHealth(successes),
      _sourceIds: sourceIds,
      _partialError: failures.length
        ? `${failures.length}/${sourceIds.length} 個版本來源暫時無法更新`
        : null
    };
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

  function metadataSecondary(session, metadata) {
    const subtitleText = metadata.subtitles?.includes("unknown")
      ? "字幕未提供"
      : `字幕：${metadata.subtitleLabels.join("、")}`;
    return [session?.house?.name, ...metadata.formatLabels, ...metadata.languageLabels, subtitleText]
      .filter(Boolean).join(" · ");
  }

  function normalizedBase(provider, session, seatAvailable, seatTotal, price, bookingUrl, seatText, klass) {
    const metadata = sessionMetadata(session);
    const providerLabel = provider === "mcl" ? "MCL" : provider === "emperor" ? "Emperor" : "Broadway";
    const fallbackCinema = provider === "mcl" ? "MCL 戲院" : provider === "emperor" ? "Emperor Cinemas" : "Broadway 戲院";
    return {
      id: `${provider}:${session?.sourceId || session?.id || Math.random()}`,
      provider,
      providerLabel,
      movieSourceId: session?._phase8cMovieSourceId || null,
      time: String(session?.time || "--:--"),
      cinemaName: session?.cinema?.name?.zh || session?.cinema?.name?.en || fallbackCinema,
      secondary: metadataSecondary(session, metadata),
      metadata,
      price,
      seatText,
      seatClass: klass,
      seatAvailable,
      seatTotal,
      bookingUrl
    };
  }

  function normalizeBroadwaySession(session) {
    const seat = session?.seatSummary || {};
    const available = Number.isFinite(seat.available) ? seat.available : null;
    const total = Number.isFinite(seat.total) ? seat.total : null;
    const seatText = Number.isFinite(available)
      ? Number.isFinite(total) ? `${available}/${total} 可選` : `${available} 個可選`
      : "座位資料暫缺";
    return normalizedBase(
      "broadway", session, available, total,
      Number.isFinite(session?.price?.display) ? session.price.display : null,
      session?.bookingUrl || null,
      seatText, seatClass(available, total)
    );
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
    return normalizedBase("mcl", session, null, null, price, session?.bookingUrl || null, seatText, klass);
  }

  function normalizeEmperorSession(session) {
    const summary = session?.seatSummary || {};
    const available = Number.isFinite(summary.available) ? summary.available : null;
    const total = Number.isFinite(summary.total) ? summary.total : null;
    const seatText = Number.isFinite(available)
      ? Number.isFinite(total) ? `${available}/${total} 未售` : `${available} 未售`
      : "座位資料暫缺";
    return normalizedBase(
      "emperor", session, available, total,
      Number.isFinite(session?.price?.display) ? session.price.display : null,
      session?.bookingUrl || state.match?.emperor?.movie?.bookingUrl || null,
      seatText, seatClass(available, total)
    );
  }

  function normalizeSession(provider, session) {
    if (provider === "mcl") return normalizeMCLSession(session);
    if (provider === "emperor") return normalizeEmperorSession(session);
    return normalizeBroadwaySession(session);
  }

  function timeValue(time) {
    const match = String(time || "").match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function timelineSessions() {
    const items = [];
    for (const provider of activeProviders()) {
      const key = provider.key;
      if (!state.data[key] || !state.availableDates[key].includes(state.selectedDate)) continue;
      items.push(...filteredRawSessions(key, state.data[key].sessions).map(session => normalizeSession(key, session)));
    }
    return items.sort((a, b) => timeValue(a.time) - timeValue(b.time) || a.provider.localeCompare(b.provider));
  }

  function providerErrorHtml() {
    const messages = activeProviders().filter(provider => state.errors[provider.key])
      .map(provider => `${provider.label}：${state.errors[provider.key]}`);
    if (!messages.length) return "";
    return `
      <div class="provider-compare-warning">
        <strong>部分版本或院線暫時無法更新</strong>
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
      <div class="provider-compare-date-rail">
        <span class="provider-compare-date-label">日期</span>
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
      </div>
    `;
  }

  function renderTimelineItem(item) {
    const metadata = item.metadata || sessionMetadata({});
    const cardAttrs = [
      Number.isFinite(item.seatAvailable) ? `data-seat-available="${item.seatAvailable}"` : "",
      Number.isFinite(item.seatTotal) ? `data-seat-total="${item.seatTotal}"` : "",
      item.movieSourceId ? `data-movie-source-id="${escapeHtml(item.movieSourceId)}"` : "",
      `data-show-language="${escapeHtml(metadata.languages.join(","))}"`,
      `data-show-subtitle="${escapeHtml(metadata.subtitles.join(","))}"`,
      `data-show-format="${escapeHtml(metadata.formats.join(","))}"`,
      item.bookingUrl ? `data-booking-url="${escapeHtml(item.bookingUrl)}"` : ""
    ].filter(Boolean).join(" ");
    const bookingAction = item.bookingUrl
      ? `<a class="provider-compare-booking" href="${escapeHtml(item.bookingUrl)}" target="_blank" rel="noopener noreferrer" aria-label="前往 ${escapeHtml(item.providerLabel)} 官方購票：${escapeHtml(item.cinemaName)} ${escapeHtml(item.time)}">購票</a>`
      : "";
    return `
      <article class="provider-compare-show phase6m-show-card phase6o-native-show" ${cardAttrs}>
        <div class="provider-compare-show-time">${escapeHtml(item.time)}</div>
        <div class="provider-compare-show-main">
          <div class="provider-compare-show-topline">
            <span class="provider-compare-source ${escapeHtml(item.provider)}">${escapeHtml(item.providerLabel)}</span>
            <strong>${escapeHtml(item.cinemaName)}</strong>
          </div>
          ${item.secondary ? `<p>${escapeHtml(item.secondary)}</p>` : ""}
          <span class="provider-compare-seat ${escapeHtml(item.seatClass)}">${escapeHtml(item.seatText)}</span>
        </div>
        <div class="provider-compare-show-actions">
          <div class="provider-compare-show-price">${Number.isFinite(item.price) ? `$${escapeHtml(item.price)}` : "—"}</div>
          ${bookingAction}
        </div>
      </article>
    `;
  }

  function renderTimeline() {
    const labels = providerLabels();
    if (state.loadingDate) {
      return `<section class="provider-compare-section"><div class="provider-compare-loading"><strong>正在整理同日場次</strong><span>正在合併 ${escapeHtml(labels.join("、"))} 的所有版本場次...</span></div></section>`;
    }
    if (!state.selectedDate) return "";
    const sessions = timelineSessions();
    const counts = activeProviders().map(provider => `${provider.label} ${sessions.filter(session => session.provider === provider.key).length} 場`);
    return `
      <section class="provider-compare-section provider-compare-timeline-section">
        ${renderDates()}
        <div class="provider-compare-section-heading">
          <div><p class="eyebrow">${escapeHtml(formatDate(state.selectedDate))}</p><h2>全部場次</h2></div>
          <small>${escapeHtml(counts.join(" · "))} · 共 ${sessions.length} 場</small>
        </div>
        ${sessions.length
          ? `<div class="provider-compare-timeline">${sessions.map(renderTimelineItem).join("")}</div>`
          : `<div class="provider-compare-empty"><strong>這一天暫時沒有場次</strong><span>可選擇其他日期，或稍後重新載入。</span></div>`}
        <details class="provider-compare-note">
          <summary>票價及座位說明</summary>
          <p>同一電影的語言版、字幕版及特殊放映版本已合併在此；可使用篩選縮窄結果。票價為院線提供的標準／成人價，未知資料不會推測。</p>
        </details>
      </section>
    `;
  }

  function render() {
    const match = state.match;
    if (!match) return;
    const overlay = ensureOverlay();
    const content = overlay.querySelector("#providerCompareContent");
    const aggregate = aggregateForMatch(match);
    const mclMovie = match.mcl?.movie || {};
    const emperorMovie = match.emperor?.movie || {};
    const poster = aggregate?.posterUrl || match.broadway?.poster || mclMovie.poster || emperorMovie.poster || null;
    const labels = providerLabels(match);
    const body = state.loadingInitial
      ? `<section class="provider-compare-section"><div class="provider-compare-loading"><strong>正在建立電影比較</strong><span>正在同時取得 ${escapeHtml(labels.join("、"))} 所有版本的可售日期...</span></div></section>`
      : `${providerErrorHtml()}${renderTimeline()}`;

    content.innerHTML = `
      <div class="provider-compare-hero">
        ${poster ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(match.title)}">` : `<div class="provider-compare-poster-placeholder">HK</div>`}
        <div>
          <p class="eyebrow">MOVIE</p>
          <h1>${escapeHtml(match.title)}</h1>
          <div class="provider-compare-status">
            <span>${labels.length} 院線</span>
            <small>${aggregate?.variants?.length > 1 ? `${aggregate.variants.length} 個放映版本已合併` : "統一電影場次"}</small>
          </div>
        </div>
      </div>
      ${body}
    `;
    overlay.hidden = false;
    document.body.classList.add("provider-compare-open");
  }

  function assignProviderResult(key, result, match, hasDate = true) {
    state.data[key] = result;
    if (result?._health) state.freshness[key] = { ...result._health };
    state.errors[key] = result?._partialError || null;
    if (hasDate) {
      rememberCriteriaDateDecision(key, result, match);
      state.availableDates[key] = availableDatesFor(key, result, match);
    }
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
      const reusableSelectedDate = state.data[key]?._requestedDate === date && (key !== "mcl" || state.data[key]?.metadataComplete === true);
      if (reusableSelectedDate) return Promise.resolve(state.data[key]);
      return fetchProvider(key, state.match, date, signal);
    });

    const results = await Promise.allSettled(promises);
    if (token !== requestToken || signal.aborted || !state.match || state.selectedDate !== date) return;
    results.forEach((result, index) => {
      const key = providers[index].key;
      const hasDate = state.availableDates[key].includes(date);
      if (result.status === "fulfilled") assignProviderResult(key, result.value, state.match, hasDate);
      else {
        state.data[key] = null;
        state.errors[key] = errorMessage(result.reason);
      }
    });

    if (!combinedDates().includes(state.selectedDate)) {
      const preferredDate = firstPreferredDate();
      if (preferredDate) {
        await loadDate(preferredDate, requestCycle);
        return;
      }
      state.selectedDate = null;
    }
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
      state.criteriaDateDecisions[provider.key].clear();
      state.data[provider.key] = null;
      state.errors[provider.key] = null;
      state.freshness[provider.key] = null;
    }
    render();

    const providers = activeProviders(match);
    const results = await Promise.allSettled(providers.map(provider => fetchProvider(provider.key, match, null, signal)));
    if (token !== requestToken || signal.aborted || state.match?.id !== match.id) return;
    results.forEach((result, index) => {
      const key = providers[index].key;
      if (result.status === "fulfilled") assignProviderResult(key, result.value, match, true);
      else state.errors[key] = errorMessage(result.reason);
    });
    state.loadingInitial = false;
    const preferredDate = firstPreferredDate();
    if (preferredDate) await loadDate(preferredDate, cycle);
    else render();
  }

  function open(matchId) {
    const match = getMatch(matchId);
    if (!match || activeProviders(match).length < 1) return false;
    loadInitial(match);
    window.dispatchEvent(new CustomEvent("hkcinema:provider-compare-open", { detail: { matchId } }));
    return true;
  }

  window.HKCinemaProviderCompare = {
    version: "8c1",
    open,
    close,
    getState() {
      return {
        match: state.match,
        aggregate: aggregateForMatch(state.match),
        selectedDate: state.selectedDate,
        availableDates: {
          broadway: [...state.availableDates.broadway],
          mcl: [...state.availableDates.mcl],
          emperor: [...state.availableDates.emperor]
        },
        sourceIds: Object.fromEntries(PROVIDERS.map(provider => [provider.key, providerSourceIds(provider.key)])),
        errors: { ...state.errors },
        freshness: Object.fromEntries(Object.entries(state.freshness).map(([key, value]) => [key, value ? { ...value } : null])),
        request: { token: requestToken, active: Boolean(activeRequestController && !activeRequestController.signal.aborted) }
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
    if (event.key === "Escape" && !document.querySelector("#providerCompareOverlay")?.hidden) close();
  });
})();