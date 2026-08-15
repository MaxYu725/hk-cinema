(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const EXIT_DEDUPE_MS = 100;
  const CLEANUP_MS = 360;
  const overlayVisibility = new WeakMap();
  const lastExitAt = { comparison: 0, seatmap: 0 };
  let syncQueued = false;

  function reducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function removeSoon(node, delay = CLEANUP_MS) {
    if (!node) return;
    const remove = () => node.remove();
    node.addEventListener("animationend", remove, { once: true });
    window.setTimeout(remove, delay);
  }

  function spawnExitGhost(kind) {
    if (reducedMotion()) return false;
    const now = performance.now();
    if (now - (lastExitAt[kind] || 0) < EXIT_DEDUPE_MS) return false;
    lastExitAt[kind] = now;

    const ghost = document.createElement("div");
    ghost.className = "m9c-exit-ghost";
    ghost.dataset.m9cExitKind = kind;
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = '<div class="m9c-exit-surface"></div>';
    document.body.appendChild(ghost);
    removeSoon(ghost);
    return true;
  }

  function nodeExitKind(node) {
    if (node?.matches?.(".phase8b-recommendation-panel")) return "smart-picks";
    if (node?.matches?.(".phase9b3-filter-group-body")) return "filter-group";
    return "filter-panel";
  }

  function spawnNodeExitGhost(node) {
    if (!node || node.hidden || reducedMotion()) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;

    const ghost = document.createElement("div");
    ghost.className = "m9c-node-exit-ghost";
    ghost.dataset.m9cNodeExitKind = nodeExitKind(node);
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      top: `${Math.round(rect.top)}px`,
      left: `${Math.round(rect.left)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`
    });
    document.body.appendChild(ghost);
    removeSoon(ghost);
    return true;
  }

  function stampEntry(node) {
    if (!node || node.hidden || reducedMotion()) return;
    node.classList.remove("m9c-panel-enter");
    requestAnimationFrame(() => {
      if (!node.isConnected || node.hidden) return;
      node.classList.add("m9c-panel-enter");
      window.setTimeout(() => node.classList.remove("m9c-panel-enter"), 280);
    });
  }

  function stampEntryAfterOwnerRender(resolveNode) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => stampEntry(resolveNode?.()));
    });
  }

  function syncDateCurrent() {
    document.querySelectorAll("#providerCompareContent [data-provider-compare-date]").forEach(button => {
      if (button.classList.contains("active")) button.setAttribute("aria-current", "date");
      else button.removeAttribute("aria-current");
    });
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncDateCurrent();
      scanOverlays();
    });
  }

  function overlayKind(overlay) {
    if (overlay?.id === "providerCompareOverlay") return "comparison";
    if (overlay?.id === "sharedSeatMapOverlay") return "seatmap";
    return null;
  }

  function registerOverlay(overlay) {
    if (!overlay || overlayVisibility.has(overlay)) return;
    overlayVisibility.set(overlay, !overlay.hidden);
  }

  function syncOverlayVisibility(overlay) {
    if (!overlay) return;
    const kind = overlayKind(overlay);
    if (!kind) return;
    const current = !overlay.hidden;
    if (!overlayVisibility.has(overlay)) {
      overlayVisibility.set(overlay, current);
      return;
    }
    const previous = overlayVisibility.get(overlay);
    overlayVisibility.set(overlay, current);
    if (previous && !current) spawnExitGhost(kind);
  }

  function scanOverlays() {
    [
      document.querySelector("#providerCompareOverlay"),
      document.querySelector("#sharedSeatMapOverlay")
    ].filter(Boolean).forEach(overlay => {
      registerOverlay(overlay);
      syncOverlayVisibility(overlay);
    });
  }

  function navigationSource(openButton) {
    return openButton?.closest?.(".movie-card") || null;
  }

  function markNavigationSource(openButton) {
    const card = navigationSource(openButton);
    if (!card) return;
    card.classList.add("m9c-navigation-origin");
    window.setTimeout(() => card.classList.remove("m9c-navigation-origin"), 220);
  }

  function handleClickCapture(event) {
    const compareClose = event.target.closest?.("#providerCompareOverlay [data-provider-compare-close]");
    if (compareClose) {
      spawnExitGhost("comparison");
      return;
    }

    const seatmapClose = event.target.closest?.("#sharedSeatMapOverlay [data-seatmap-close]");
    if (seatmapClose) {
      spawnExitGhost("seatmap");
      return;
    }

    const openButton = event.target.closest?.("[data-compare-open]");
    if (openButton) {
      markNavigationSource(openButton);
      return;
    }

    const filterToggle = event.target.closest?.("[data-provider-filter-toggle]");
    if (filterToggle) {
      const wasOpen = filterToggle.getAttribute("aria-expanded") === "true";
      const controls = filterToggle.closest("[data-provider-insights]")?.querySelector(".phase8c-controls");
      if (wasOpen) spawnNodeExitGhost(controls);
      else requestAnimationFrame(() => stampEntry(document.querySelector("#providerCompareContent .phase8c-controls:not([hidden])")));
      return;
    }

    const groupToggle = event.target.closest?.("[data-phase9b3-group-toggle]");
    if (groupToggle) {
      const group = groupToggle.closest("[data-phase9b3-group]");
      const body = group?.querySelector(":scope > .phase9b3-filter-group-body");
      if (body && !body.hidden) spawnNodeExitGhost(body);
      else requestAnimationFrame(() => stampEntry(group?.querySelector(":scope > .phase9b3-filter-group-body:not([hidden])")));
      return;
    }

    const smartToggle = event.target.closest?.("[data-phase8b-recommendation-toggle]");
    if (smartToggle) {
      const section = smartToggle.closest(".provider-compare-timeline-section");
      const panel = section?.querySelector(".phase8b-recommendation-panel");
      if (panel && !panel.hidden) {
        spawnNodeExitGhost(panel);
      } else {
        stampEntryAfterOwnerRender(() => section?.querySelector(".phase8b-recommendation-panel:not([hidden])"));
      }
    }
  }

  function handleKeyCapture(event) {
    if (event.key !== "Escape") return;
    const seatmap = document.querySelector("#sharedSeatMapOverlay");
    if (seatmap && !seatmap.hidden) {
      spawnExitGhost("seatmap");
      return;
    }
    const comparison = document.querySelector("#providerCompareOverlay");
    if (comparison && !comparison.hidden) spawnExitGhost("comparison");
  }

  function install() {
    scanOverlays();
    syncDateCurrent();

    /* Window capture observes intent before document-level owners mutate hidden/open state. */
    window.addEventListener("click", handleClickCapture, true);
    window.addEventListener("keydown", handleKeyCapture, true);

    [
      "hkcinema:provider-compare-open",
      "hkcinema:provider-compare-lifecycle",
      "hkcinema:seatmap-opening"
    ].forEach(name => window.addEventListener(name, scheduleSync));

    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes" && record.attributeName === "hidden") {
          syncOverlayVisibility(record.target);
        }
      }
      scheduleSync();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  window.HKCinemaM9CTransitions = Object.freeze({
    version: "m9c-1",
    refresh: scheduleSync,
    syncDateCurrent
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
