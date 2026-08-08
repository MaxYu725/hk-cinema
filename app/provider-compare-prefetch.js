(() => {
  const IDLE_TIMEOUT_MS = 1400;
  const FALLBACK_DELAY_MS = 700;
  const STABLE_DELAY_MS = 350;

  let generation = 0;
  let idleHandle = null;
  let timerHandle = null;
  let observer = null;

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

    if (timerHandle !== null) {
      clearTimeout(timerHandle);
    }
    timerHandle = null;
  }

  function uniqueDates(values) {
    return Array.from(new Set(
      (values || [])
        .map(value => String(value || "").slice(0, 10))
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )).sort();
  }

  function getContext() {
    const compare = window.HKCinemaProviderCompare;
    const cache = window.HKCinemaProviderCompareMainCache;
    if (!compare?.getState || !cache) return null;

    const overlay = document.querySelector("#providerCompareOverlay");
    if (!overlay || overlay.hidden) return null;

    const content = overlay.querySelector("#providerCompareContent");
    if (!content || content.querySelector(".provider-compare-loading")) return null;

    const state = compare.getState();
    const selectedDate = state?.selectedDate;
    const match = state?.match;
    if (!selectedDate || !match) return null;

    const broadwayDates = uniqueDates(state.availableDates?.broadway || []);
    const mclDates = uniqueDates(state.availableDates?.mcl || []);
    const emperorDates = uniqueDates(state.availableDates?.emperor || []);
    const allDates = uniqueDates([...broadwayDates, ...mclDates, ...emperorDates]);
    const index = allDates.indexOf(selectedDate);
    if (index < 0) return null;

    const targets = [allDates[index - 1], allDates[index + 1]].filter(Boolean);
    if (!targets.length) return null;

    return {
      matchId: match.id,
      selectedDate,
      targets,
      broadwayDates,
      mclDates,
      emperorDates,
      broadwayId: String(match.broadway?.sourceId || "").replace(/^broadway:/, ""),
      mclId: String(match.mcl?.sourceId || "").replace(/^mcl:/, ""),
      emperorId: String(match.emperor?.sourceId || "").replace(/^emperor:/, "")
    };
  }

  async function runPrefetch(context, ownGeneration) {
    if (ownGeneration !== generation || !networkAllowsPrefetch()) return;

    const current = getContext();
    if (!current || current.matchId !== context.matchId || current.selectedDate !== context.selectedDate) {
      return;
    }

    const cache = window.HKCinemaProviderCompareMainCache;
    if (!cache) return;

    for (const date of context.targets) {
      if (ownGeneration !== generation) return;
      const work = [];

      if (context.broadwayId && context.broadwayDates.includes(date) && typeof cache.prefetchBroadway === "function") {
        work.push(cache.prefetchBroadway(context.broadwayId, date));
      }
      if (context.mclId && context.mclDates.includes(date) && typeof cache.prefetchMCL === "function") {
        work.push(cache.prefetchMCL(context.mclId, date));
      }
      if (context.emperorId && context.emperorDates.includes(date) && typeof cache.prefetchEmperor === "function") {
        work.push(cache.prefetchEmperor(context.emperorId, date));
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
      runPrefetch(context, ownGeneration).catch(() => {});
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

  installObserver();
})();