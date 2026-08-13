(() => {
  const IDLE_TIMEOUT_MS = 1400;
  const FALLBACK_DELAY_MS = 700;
  const STABLE_DELAY_MS = 350;
  const sharedCore = window.HKCinemaProviderSharedCore || null;

  let generation = 0;
  let idleHandle = null;
  let timerHandle = null;
  let activeController = null;
  let observer = null;

  function providerIds() {
    const shared = sharedCore?.providerIds?.();
    if (Array.isArray(shared)) return shared;
    return (window.HKCinemaProviderRegistry?.providers || [])
      .map(provider => String(provider?.id || "").trim().toLowerCase())
      .filter(Boolean);
  }

  function normalizeSourceId(provider, value) {
    return sharedCore?.normalizeSourceId?.(provider, value) ||
      String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
  }

  function networkAllowsPrefetch() {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (!connection) return true;
    if (connection.saveData) return false;

    const type = String(connection.effectiveType || "").toLowerCase();
    return type !== "slow-2g" && type !== "2g";
  }

  function cancelScheduled() {
    generation += 1;

    if (idleHandle !== null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleHandle);
    }
    idleHandle = null;

    if (timerHandle !== null) clearTimeout(timerHandle);
    timerHandle = null;

    if (activeController) {
      try { activeController.abort("superseded"); } catch { activeController.abort(); }
      activeController = null;
    }
  }

  function uniqueDates(values) {
    return Array.from(new Set(
      (values || [])
        .map(value => String(value || "").slice(0, 10))
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )).sort();
  }

  function sourceIdsFor(provider, match) {
    const aggregate = match?.id ? window.HKCinemaMovieAggregates?.get?.(match.id) : null;
    if (aggregate) {
      const sourceIds = sharedCore?.aggregateSourceIds?.(aggregate, provider) ||
        (aggregate.sources?.[provider] || []).map(value => normalizeSourceId(provider, value));
      return Array.from(new Set(sourceIds.filter(Boolean)));
    }
    const sourceId = normalizeSourceId(provider, match?.[provider]?.sourceId);
    return sourceId ? [sourceId] : [];
  }

  function getContext() {
    const compare = window.HKCinemaProviderCompare;
    const cache = window.HKCinemaProviderCompareMainCache;
    if (!compare?.getState || !cache?.prefetchProvider) return null;

    const overlay = document.querySelector("#providerCompareOverlay");
    if (!overlay || overlay.hidden) return null;

    const content = overlay.querySelector("#providerCompareContent");
    if (!content || content.querySelector(".provider-compare-loading")) return null;

    const state = compare.getState();
    const selectedDate = state?.selectedDate;
    const match = state?.match;
    if (!selectedDate || !match) return null;

    const providers = providerIds().map(provider => ({
      provider,
      dates: uniqueDates(state.availableDates?.[provider] || []),
      sourceIds: sourceIdsFor(provider, match)
    })).filter(entry => entry.dates.length && entry.sourceIds.length);
    const allDates = uniqueDates(providers.flatMap(entry => entry.dates));
    const index = allDates.indexOf(selectedDate);
    if (index < 0) return null;

    const targets = [allDates[index - 1], allDates[index + 1]].filter(Boolean);
    if (!targets.length) return null;

    return {
      matchId: match.id,
      selectedDate,
      targets,
      providers
    };
  }

  async function runPrefetch(context, ownGeneration, signal) {
    if (ownGeneration !== generation || signal?.aborted || !networkAllowsPrefetch()) return;

    const current = getContext();
    if (!current || current.matchId !== context.matchId || current.selectedDate !== context.selectedDate) return;

    const cache = window.HKCinemaProviderCompareMainCache;
    if (!cache?.prefetchProvider) return;

    for (const date of context.targets) {
      if (ownGeneration !== generation || signal?.aborted) return;
      const work = [];

      for (const entry of context.providers) {
        if (!entry.dates.includes(date)) continue;
        for (const sourceId of entry.sourceIds) {
          work.push(cache.prefetchProvider(entry.provider, sourceId, date, signal));
        }
      }

      if (work.length) await Promise.allSettled(work);
    }
  }

  function schedule() {
    cancelScheduled();
    if (!networkAllowsPrefetch()) return;
    const context = getContext();
    if (!context) return;
    const ownGeneration = generation;

    const start = () => {
      idleHandle = null;
      timerHandle = null;
      const controller = new AbortController();
      activeController = controller;
      runPrefetch(context, ownGeneration, controller.signal)
        .catch(() => {})
        .finally(() => {
          if (activeController === controller) activeController = null;
        });
    };

    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
    } else {
      timerHandle = setTimeout(start, FALLBACK_DELAY_MS);
    }
  }

  function scheduleAfterStableRender() {
    if (timerHandle !== null) clearTimeout(timerHandle);
    timerHandle = setTimeout(() => {
      timerHandle = null;
      schedule();
    }, STABLE_DELAY_MS);
  }

  function installObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      const overlay = document.querySelector("#providerCompareOverlay");
      const content = overlay?.querySelector("#providerCompareContent");
      if (!overlay || overlay.hidden || content?.querySelector(".provider-compare-loading")) {
        cancelScheduled();
        return;
      }
      scheduleAfterStableRender();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener("hkcinema:provider-compare-lifecycle", event => {
    const type = event.detail?.type;
    if (type === "open" || type === "close" || type === "date-change" || type === "reload") {
      cancelScheduled();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelScheduled();
  });

  window.HKCinemaProviderComparePrefetch = Object.freeze({
    version: "m7r6-1",
    getContext,
    cancel: cancelScheduled,
    schedule
  });

  installObserver();
})();
