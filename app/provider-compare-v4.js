(() => {
  const DEFAULT_TIMEOUT_MS = 12000;
  const PROVIDER_TIMEOUTS = Object.freeze({ mcl: 15000 });
  const sharedCore = window.HKCinemaProviderSharedCore || null;

  function comparisonStore() {
    return window.HKCinemaComparisonStore || null;
  }

  function registryProviders() {
    return (window.HKCinemaProviderRegistry?.providers || []).map(descriptor => ({
      key: descriptor.id,
      label: descriptor.displayName || descriptor.healthLabel || descriptor.id,
      descriptor
    }));
  }

  const PROVIDERS = sharedCore?.providers?.() || registryProviders();
  const providerMap = factory => sharedCore?.providerMap?.(factory) || Object.fromEntries(
    PROVIDERS.map(provider => [provider.key, factory(provider.key, provider.descriptor || null)])
  );

  function labelForProvider(provider) {
    return sharedCore?.label?.(provider) ||
      PROVIDERS.find(item => item.key === provider)?.label ||
      String(provider || "").trim() ||
      "院線";
  }

  function timeoutForProvider(provider) {
    return PROVIDER_TIMEOUTS[provider] || DEFAULT_TIMEOUT_MS;
  }

  const COMPARISON_ADAPTERS = Object.freeze({
    broadway: Object.freeze({
      normalizeSession: normalizeBroadwaySession
    }),
    mcl: Object.freeze({
      fetchShows: fetchMCLShows,
      normalizeSession: normalizeMCLSession,
      metadataComplete(successes) {
        return successes.every(item => item.result?.metadataComplete === true);
      },
      canReuse(result) {
        return result?.metadataComplete === true;
      }
    }),
    emperor: Object.freeze({
      normalizeSession: normalizeEmperorSession
    })
  });

  function comparisonAdapter(provider) {
    const builtIn = COMPARISON_ADAPTERS[provider] || null;
    const runtime = window.HKCinemaProviders?.[provider]?.comparison || null;
    return builtIn || runtime
      ? { ...(builtIn || {}), ...(runtime || {}) }
      : null;
  }

  const state = {
    match: null,
    loadingInitial: false,
    loadingDate: false,
    selectedDate: null,
    availableDates: providerMap(() => []),
    criteriaDateDecisions: providerMap(() => new Map()),
    data: providerMap(() => null),
    errors: providerMap(() => null),
    freshness: providerMap(() => null)
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
    return sharedCore?.normalizeSourceId?.(provider, value) ||
      String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
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
      return sharedCore?.aggregateSourceIds?.(aggregate, provider) ||
        unique((aggregate.sources?.[provider] || []).map(value => normalizeSourceId(provider, value)));
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
    state.criteriaDateDecisions[provider]?.set(decision.date, decision.status);
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
    comparisonStore()?.publish?.({ matchId: null, selectedDate: null, sessions: [] });
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
    if (available.length === activeCount && activeCount > 1) {
      label = sharedCore?.allProviderLabel?.(activeCount) || `${activeCount} 院線`;
    }
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
    const lifecycle = childController(parentSignal, timeoutForProvider(provider));
    try {
      const comparisonCache = window.HKCinemaProviderCompareMainCache;
      const result = comparisonCache?.getWorkerShows
        ? await comparisonCache.getWorkerShows(provider, sourceId, date, {
            signal: lifecycle.controller.signal
          })
        : await window.HKCinemaApiClient?.get?.(
            `/api/${provider}/movies/${encodeURIComponent(sourceId)}/shows`,
            { query: { date }, signal: lifecycle.controller.signal, timeoutMs: 0 }
          );
      if (!result?.data) throw new Error("Comparison request service is unavailable");
      return {
        ...result.data,
        _health: {
          updatedAt: result.meta?.updatedAt || new Date().toISOString(),
          source: result.meta?.cache || /cache/i.test(result.meta?.cacheState || "") ? "cache" : "network"
        }
      };
    } catch (error) {
      if (Number(error?.status) === 404) {
        return { availableDates: [], selectedDate: date, sessions: [], _health: { updatedAt: new Date().toISOString(), source: "network" } };
      }
      if (lifecycle.timedOut()) {
        throw new Error(`${labelForProvider(provider)} 場次讀取逾時，請稍後重試。`);
      }
      throw error;
    } finally {
      lifecycle.cleanup();
    }
  }

  async function fetchMCLShows(provider, sourceId, date, signal) {
    const providerAdapter = window.HKCinemaProviders?.[provider];
    if (!providerAdapter?.getTicketing) throw new Error(`${labelForProvider(provider)} ticketing provider 未能載入`);
    const lifecycle = childController(signal, timeoutForProvider(provider));
    try {
      const result = await providerAdapter.getTicketing(sourceId, date, { signal: lifecycle.controller.signal });
      if (lifecycle.timedOut()) throw new Error(`${labelForProvider(provider)} 場次讀取逾時，請稍後重試。`);
      return {
        ...result,
        _health: {
          updatedAt: result?.source?.updatedAt || new Date().toISOString(),
          source: result?.source?.cache ? "cache" : "network"
        }
      };
    } catch (error) {
      if (lifecycle.timedOut()) throw new Error(`${labelForProvider(provider)} 場次讀取逾時，請稍後重試。`);
      throw error;
    } finally {
      lifecycle.cleanup();
    }
  }

  async function fetchProviderSource(provider, sourceId, date, signal) {
    const handler = comparisonAdapter(provider)?.fetchShows || fetchWorkerShows;
    return handler(provider, sourceId, date, signal);
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
    const completenessPolicy = comparisonAdapter(provider)?.metadataComplete;
    const metadataComplete = typeof completenessPolicy === "function"
      ? Boolean(completenessPolicy(successes))
      : true;

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
    const providerLabel = labelForProvider(provider);
    const fallbackCinema = `${providerLabel} 戲院`;
    const sourceId = String(session?.sourceId || session?.id || "") || null;
    const fallbackId = [
      provider,
      session?._phase8cMovieSourceId || "movie",
      state.selectedDate || session?.date || "date",
      session?.time || "--:--",
      session?.cinema?.name?.zh || session?.cinema?.name?.en || session?.cinema?.name || fallbackCinema
    ].map(value => String(value).normalize("NFKC").trim()).join(":");
    return {
      id: sourceId ? `${provider}:${sourceId}` : fallbackId,
      sourceId,
      provider,
      providerLabel,
      movieSourceId: session?._phase8cMovieSourceId || null,
      time: String(session?.time || "--:--"),
      cinemaName: session?.cinema?.name?.zh || session?.cinema?.name?.en || session?.cinema?.name || fallbackCinema,
      secondary: metadataSecondary(session, metadata),
      metadata,
      price,
      pricePayload: session?.price || (Number.isFinite(price) ? { display: price } : null),
      seatSummary: session?.seatSummary || null,
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

  function normalizeGenericSession(provider, session) {
    const summary = session?.seatSummary || {};
    const available = Number.isFinite(summary.available) ? summary.available : null;
    const total = Number.isFinite(summary.total) ? summary.total : null;
    const price = Number.isFinite(session?.price?.adult)
      ? session.price.adult
      : Number.isFinite(session?.price?.display) ? session.price.display : null;
    const seatText = Number.isFinite(available)
      ? Number.isFinite(total) ? `${available}/${total} 可選` : `${available} 個可選`
      : "座位資料暫缺";
    return normalizedBase(
      provider,
      session,
      available,
      total,
      price,
      session?.bookingUrl || null,
      seatText,
      seatClass(available, total)
    );
  }

  function normalizeSession(provider, session) {
    const normalizer = comparisonAdapter(provider)?.normalizeSession;
    return typeof normalizer === "function"
      ? normalizer(session)
      : normalizeGenericSession(provider, session);
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
    const seen = new Map();
    return items
      .sort((a, b) => timeValue(a.time) - timeValue(b.time) || a.provider.localeCompare(b.provider))
      .map(item => {
        const count = seen.get(item.id) || 0;
        seen.set(item.id, count + 1);
        return count ? { ...item, id: `${item.id}:${count}` } : item;
      });
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
    const capabilities = sharedCore?.showtimeCapabilities?.(item.provider, item) || {
      price: { availability: "unknown" },
      seatSummary: { availability: "unknown" },
      booking: { availability: item.bookingUrl ? "available" : "unknown" }
    };
    const seatText = capabilities.seatSummary.availability === "unsupported"
      ? "座位資料不提供"
      : item.seatText;
    const priceText = capabilities.price.availability === "unsupported"
      ? "不提供"
      : Number.isFinite(item.price) ? `$${escapeHtml(item.price)}` : "—";
    const cineArtSeatMap = item.provider === "cineart" &&
      Boolean(item.sourceId) &&
      window.HKCinemaProviderRegistry?.hasCapability?.("cineart", "seatMap");
    const cardAttrs = [
      `data-comparison-session-id="${escapeHtml(item.id)}"`,
      Number.isFinite(item.seatAvailable) ? `data-seat-available="${item.seatAvailable}"` : "",
      Number.isFinite(item.seatTotal) ? `data-seat-total="${item.seatTotal}"` : "",
      item.sourceId ? `data-showtime-id="${escapeHtml(item.sourceId)}"` : "",
      item.movieSourceId ? `data-movie-source-id="${escapeHtml(item.movieSourceId)}"` : "",
      `data-provider="${escapeHtml(item.provider)}"`,
      `data-price-capability="${escapeHtml(capabilities.price.availability)}"`,
      `data-seat-capability="${escapeHtml(capabilities.seatSummary.availability)}"`,
      `data-booking-capability="${escapeHtml(capabilities.booking.availability)}"`,
      `data-show-language="${escapeHtml(metadata.languages.join(","))}"`,
      `data-show-subtitle="${escapeHtml(metadata.subtitles.join(","))}"`,
      `data-show-format="${escapeHtml(metadata.formats.join(","))}"`,
      item.bookingUrl ? `data-booking-url="${escapeHtml(item.bookingUrl)}"` : ""
    ].filter(Boolean).join(" ");
    const bookingAction = capabilities.booking.availability === "available" && item.bookingUrl
      ? `<a class="provider-compare-booking" href="${escapeHtml(item.bookingUrl)}" target="_blank" rel="noopener noreferrer" aria-label="前往 ${escapeHtml(item.providerLabel)} 官方購票：${escapeHtml(item.cinemaName)} ${escapeHtml(item.time)}">購票</a>`
      : "";
    const seatAttrs = cineArtSeatMap
      ? ` role="button" tabindex="0" aria-label="查看 ${escapeHtml(item.cinemaName)} ${escapeHtml(item.time)} CineArt 座位圖"`
      : "";
    const seatClassName = capabilities.seatSummary.availability === "unsupported"
      ? "unknown"
      : `${item.seatClass}${cineArtSeatMap ? " seatmap-launch cineart-seatmap-launch" : ""}`;
    return `
      <article class="provider-compare-show phase6m-show-card phase6o-native-show" ${cardAttrs}>
        <div class="provider-compare-show-time">${escapeHtml(item.time)}</div>
        <div class="provider-compare-show-main">
          <div class="provider-compare-show-topline">
            <span class="provider-compare-source ${escapeHtml(item.provider)}">${escapeHtml(item.providerLabel)}</span>
            <strong>${escapeHtml(item.cinemaName)}</strong>
          </div>
          ${item.secondary ? `<p>${escapeHtml(item.secondary)}</p>` : ""}
          <span class="provider-compare-seat ${escapeHtml(seatClassName)}"${seatAttrs}>${escapeHtml(seatText)}</span>
        </div>
        <div class="provider-compare-show-actions">
          <div class="provider-compare-show-price">${priceText}</div>
          ${bookingAction}
        </div>
      </article>
    `;
  }

  function renderTimeline(sessions = timelineSessions()) {
    const labels = providerLabels();
    if (state.loadingDate) {
      return `<section class="provider-compare-section"><div class="provider-compare-loading"><strong>正在整理同日場次</strong><span>正在合併 ${escapeHtml(labels.join("、"))} 的所有版本場次...</span></div></section>`;
    }
    if (!state.selectedDate) return "";
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

  function posterForMatch(match, aggregate) {
    if (aggregate?.posterUrl) return aggregate.posterUrl;
    for (const provider of PROVIDERS) {
      const entry = match?.[provider.key] || null;
      const movie = entry?.movie || null;
      const poster = entry?.poster || movie?.poster || movie?.posterUrl || null;
      if (poster) return poster;
    }
    return null;
  }

  function render() {
    const match = state.match;
    if (!match) return;
    const overlay = ensureOverlay();
    const content = overlay.querySelector("#providerCompareContent");
    const aggregate = aggregateForMatch(match);
    const poster = posterForMatch(match, aggregate);
    const labels = providerLabels(match);
    const sessions = state.loadingInitial || state.loadingDate || !state.selectedDate ? [] : timelineSessions();
    const body = state.loadingInitial
      ? `<section class="provider-compare-section"><div class="provider-compare-loading"><strong>正在建立電影比較</strong><span>正在同時取得 ${escapeHtml(labels.join("、"))} 所有版本的可售日期...</span></div></section>`
      : `${providerErrorHtml()}${renderTimeline(sessions)}`;

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
    comparisonStore()?.publish?.({
      matchId: match.id,
      selectedDate: state.selectedDate,
      sessions
    });
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
      const reusePolicy = comparisonAdapter(key)?.canReuse;
      const reusableSelectedDate = state.data[key]?._requestedDate === date &&
        (typeof reusePolicy !== "function" || reusePolicy(state.data[key]));
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
      state.criteriaDateDecisions[provider.key] ??= new Map();
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
    version: "m7p1g-1",
    open,
    close,
    getState() {
      return {
        match: state.match,
        aggregate: aggregateForMatch(state.match),
        selectedDate: state.selectedDate,
        availableDates: Object.fromEntries(PROVIDERS.map(provider => [
          provider.key,
          [...(state.availableDates[provider.key] || [])]
        ])),
        sourceIds: Object.fromEntries(PROVIDERS.map(provider => [provider.key, providerSourceIds(provider.key)])),
        errors: { ...state.errors },
        freshness: Object.fromEntries(Object.entries(state.freshness).map(([key, value]) => [key, value ? { ...value } : null])),
        sessions: comparisonStore()?.getState?.().sessions || [],
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
