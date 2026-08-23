(() => {
  const NAV_KEY = "__hkCinemaNavigation";
  const VERSION = "c2-1";
  const SESSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const LAYERS = Object.freeze({
    providerCompareOverlay: "compare",
    sharedSeatMapOverlay: "seatmap"
  });

  let reconciling = false;
  let traversalPending = false;
  let traversalFallback = null;
  let closeSyncQueued = false;

  const attached = new WeakSet();
  const stats = {
    pushes: 0,
    traversals: 0,
    popstates: 0,
    overlayOpens: 0,
    overlayCloses: 0
  };

  function stateObject(state = history.state) {
    return state && typeof state === "object" ? { ...state } : {};
  }

  function navigationState(state = history.state) {
    const nav = state?.[NAV_KEY];
    if (!nav || nav.version !== VERSION || nav.session !== SESSION || !Array.isArray(nav.stack)) return null;
    return nav;
  }

  function withNavigationState(state, stack) {
    return {
      ...stateObject(state),
      [NAV_KEY]: {
        version: VERSION,
        session: SESSION,
        stack: [...stack]
      }
    };
  }

  function sameStack(a = [], b = []) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function isPrefix(prefix = [], value = []) {
    return prefix.length <= value.length && prefix.every((item, index) => value[index] === item);
  }

  function overlayVisible(id) {
    const overlay = document.getElementById(id);
    return Boolean(overlay && !overlay.hidden);
  }

  function visibleStack() {
    const stack = overlayVisible("providerCompareOverlay") ? ["compare"] : [];
    if (overlayVisible("sharedSeatMapOverlay")) stack.push("seatmap");
    return stack;
  }

  function replaceCurrent(stack) {
    history.replaceState(withNavigationState(history.state, stack), "", window.location.href);
  }

  function pushLayer(layer) {
    if (reconciling || traversalPending) return false;
    const current = navigationState()?.stack || [];
    const next = layer === "seatmap"
      ? [...current.filter(item => item !== "seatmap"), "seatmap"]
      : [layer];
    if (sameStack(current, next)) return false;
    history.pushState(withNavigationState(history.state, next), "", window.location.href);
    stats.pushes += 1;
    return true;
  }

  function clearTraversalFallback() {
    if (traversalFallback !== null) window.clearTimeout(traversalFallback);
    traversalFallback = null;
  }

  function scheduleCloseSync() {
    if (reconciling || closeSyncQueued) return;
    closeSyncQueued = true;
    queueMicrotask(() => {
      closeSyncQueued = false;
      if (reconciling || traversalPending) return;

      const current = navigationState()?.stack || [];
      const actual = visibleStack();
      if (sameStack(current, actual)) return;

      if (current.length > actual.length && isPrefix(actual, current)) {
        const steps = current.length - actual.length;
        traversalPending = true;
        stats.traversals += 1;
        history.go(-steps);
        clearTraversalFallback();
        traversalFallback = window.setTimeout(() => {
          traversalPending = false;
          replaceCurrent(visibleStack());
        }, 800);
        return;
      }

      replaceCurrent(actual);
    });
  }

  function handleVisibility(layer, visible) {
    if (visible) {
      stats.overlayOpens += 1;
      pushLayer(layer);
    } else {
      stats.overlayCloses += 1;
      scheduleCloseSync();
    }
  }

  function attachOverlay(overlay) {
    if (!(overlay instanceof HTMLElement) || attached.has(overlay)) return;
    const layer = LAYERS[overlay.id];
    if (!layer) return;
    attached.add(overlay);

    const observer = new MutationObserver(records => {
      if (!records.some(record => record.type === "attributes" && record.attributeName === "hidden")) return;
      handleVisibility(layer, !overlay.hidden);
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ["hidden"] });

    if (!overlay.hidden) handleVisibility(layer, true);
  }

  function scanAddedNode(node) {
    if (!(node instanceof HTMLElement)) return;
    if (LAYERS[node.id]) attachOverlay(node);
  }

  function closeLayer(layer) {
    if (layer === "seatmap") {
      window.HKCinemaSeatMapShared?.close?.();
      return;
    }
    if (layer === "compare") {
      window.HKCinemaProviderCompare?.close?.();
    }
  }

  function reconcileTo(target = []) {
    const actual = visibleStack();
    for (let index = actual.length - 1; index >= 0; index -= 1) {
      const layer = actual[index];
      if (!target.includes(layer)) closeLayer(layer);
    }
  }

  function handlePopState(event) {
    const target = event.state?.[NAV_KEY];
    if (!target || target.version !== VERSION || target.session !== SESSION || !Array.isArray(target.stack)) return;

    stats.popstates += 1;
    clearTraversalFallback();
    traversalPending = false;
    reconciling = true;
    reconcileTo(target.stack);

    window.setTimeout(() => {
      const actual = visibleStack();
      if (!sameStack(actual, target.stack)) replaceCurrent(actual);
      reconciling = false;
    }, 0);
  }

  function install() {
    replaceCurrent([]);
    Object.keys(LAYERS).forEach(id => {
      const overlay = document.getElementById(id);
      if (overlay) attachOverlay(overlay);
    });

    const bodyObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes || []) scanAddedNode(node);
      }
    });
    bodyObserver.observe(document.body, { childList: true });
    window.addEventListener("popstate", handlePopState);
  }

  window.HKCinemaPWABackNavigation = Object.freeze({
    version: VERSION,
    getState() {
      return {
        stack: [...(navigationState()?.stack || [])],
        visibleStack: visibleStack(),
        reconciling,
        traversalPending,
        stats: { ...stats }
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
