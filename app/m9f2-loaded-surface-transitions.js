(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const ENTRY_MS = 180;
  const EXIT_MS = 160;
  const EASING = "cubic-bezier(0, 0, .2, 1)";
  const PORTAL_ID = "providerCompareCinemaPortal";

  const observedSeatContents = new WeakSet();
  const observedNotices = new WeakSet();
  const revealedSeatMaps = new WeakSet();
  const enteredPortals = new WeakSet();
  const visibleNotices = new WeakSet();

  let seatObserver = null;
  let noticeObserver = null;
  let bodyObserver = null;

  const stats = {
    seatmapReveals: 0,
    pwaEntries: 0,
    pwaExitGhosts: 0,
    portalEntries: 0,
    portalExitGhosts: 0
  };

  function reducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function animate(element, frames, duration = ENTRY_MS) {
    if (!element || reducedMotion() || typeof element.animate !== "function") return null;
    return element.animate(frames, {
      duration,
      easing: EASING,
      fill: "none"
    });
  }

  function clearGhosts(kind = null) {
    const selector = kind
      ? `.m9f2-exit-ghost[data-m9f2-ghost="${kind}"]`
      : ".m9f2-exit-ghost";
    document.querySelectorAll(selector).forEach(node => node.remove());
  }

  function prepareGhost(source, kind) {
    if (!source || reducedMotion()) return null;
    const ghost = source.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.removeAttribute("role");
    ghost.setAttribute("aria-hidden", "true");
    ghost.classList.add("m9f2-exit-ghost", `m9f2-${kind}-exit-ghost`);
    ghost.dataset.m9f2Ghost = kind;
    ghost.style.pointerEvents = "none";
    ghost.querySelectorAll("button, a, [tabindex]").forEach(node => {
      node.setAttribute("tabindex", "-1");
      node.setAttribute("aria-hidden", "true");
    });
    return ghost;
  }

  function animateGhost(ghost, kind) {
    if (!ghost) return false;
    document.body.appendChild(ghost);
    const frames = kind === "portal"
      ? [
          { opacity: 1, transform: "translateY(0) scale(1)" },
          { opacity: 0, transform: "translateY(-3px) scale(.99)" }
        ]
      : [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(6px)" }
        ];
    const animation = animate(ghost, frames, EXIT_MS);
    if (!animation) {
      ghost.remove();
      return false;
    }
    const remove = () => ghost.remove();
    animation.addEventListener?.("finish", remove, { once: true });
    animation.addEventListener?.("cancel", remove, { once: true });
    window.setTimeout(remove, EXIT_MS + 80);
    return true;
  }

  function revealSeatMap(root = document.querySelector("#sharedSeatMapContent")) {
    const surface = root?.querySelector?.(".shared-seatmap-content");
    if (!surface || revealedSeatMaps.has(surface)) return false;
    revealedSeatMaps.add(surface);
    surface.dataset.m9f2Loaded = "true";
    stats.seatmapReveals += 1;
    animate(surface, [
      { opacity: .76, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" }
    ]);
    return true;
  }

  function observeSeatContent(content) {
    if (!content || observedSeatContents.has(content) || !seatObserver) return;
    observedSeatContents.add(content);
    seatObserver.observe(content, { childList: true, subtree: false });
    revealSeatMap(content);
  }

  function showNotice(notice) {
    if (!notice || notice.hidden) return false;
    clearGhosts("pwa");
    visibleNotices.add(notice);
    notice.dataset.m9f2Visible = "true";
    stats.pwaEntries += 1;
    animate(notice, [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" }
    ]);
    return true;
  }

  function hideNotice(notice) {
    if (!notice || !visibleNotices.has(notice)) return false;
    visibleNotices.delete(notice);
    delete notice.dataset.m9f2Visible;
    clearGhosts("pwa");
    const ghost = prepareGhost(notice, "pwa");
    if (!ghost) return false;
    ghost.hidden = false;
    stats.pwaExitGhosts += 1;
    return animateGhost(ghost, "pwa");
  }

  function observeNotice(notice) {
    if (!notice || observedNotices.has(notice) || !noticeObserver) return;
    observedNotices.add(notice);
    noticeObserver.observe(notice, { attributes: true, attributeFilter: ["hidden"] });
    if (!notice.hidden) showNotice(notice);
  }

  function enterPortal(portal) {
    if (!portal || enteredPortals.has(portal)) return false;
    clearGhosts("portal");
    enteredPortals.add(portal);
    portal.dataset.m9f2Entered = "true";
    stats.portalEntries += 1;
    animate(portal, [
      { opacity: .78, transform: "translateY(4px) scale(.985)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ]);
    return true;
  }

  function exitPortal(portal) {
    if (!portal || !enteredPortals.has(portal)) return false;
    clearGhosts("portal");
    const ghost = prepareGhost(portal, "portal");
    if (!ghost) return false;
    stats.portalExitGhosts += 1;
    return animateGhost(ghost, "portal");
  }

  function nodesMatching(nodes, selector) {
    const matches = [];
    for (const node of nodes || []) {
      if (!(node instanceof Element)) continue;
      if (node.matches(selector)) matches.push(node);
      node.querySelectorAll?.(selector).forEach(match => matches.push(match));
    }
    return matches;
  }

  function bindDynamicTargets() {
    observeSeatContent(document.querySelector("#sharedSeatMapContent"));
    observeNotice(document.querySelector("#pwaNotice"));
  }

  function handleBodyMutations(records) {
    const addedPortals = [];
    const removedPortals = [];

    for (const record of records) {
      nodesMatching(record.addedNodes, `#${PORTAL_ID}`).forEach(node => addedPortals.push(node));
      nodesMatching(record.removedNodes, `#${PORTAL_ID}`).forEach(node => removedPortals.push(node));
    }

    if (addedPortals.length) {
      clearGhosts("portal");
      addedPortals.forEach(enterPortal);
    } else {
      removedPortals.forEach(exitPortal);
    }

    bindDynamicTargets();
  }

  function install() {
    seatObserver = new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length || record.removedNodes.length)) {
        revealSeatMap(recordRoot(records));
      }
    });

    noticeObserver = new MutationObserver(records => {
      for (const record of records) {
        const notice = record.target;
        if (!(notice instanceof HTMLElement)) continue;
        if (notice.hidden) hideNotice(notice);
        else showNotice(notice);
      }
    });

    bodyObserver = new MutationObserver(handleBodyMutations);
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    bindDynamicTargets();
  }

  function recordRoot(records) {
    for (const record of records) {
      const target = record.target;
      if (target instanceof Element && target.id === "sharedSeatMapContent") return target;
      const root = target?.closest?.("#sharedSeatMapContent");
      if (root) return root;
    }
    return document.querySelector("#sharedSeatMapContent");
  }

  window.HKCinemaM9F2LoadedSurfaces = Object.freeze({
    version: "m9f2-1",
    refresh() {
      bindDynamicTargets();
      revealSeatMap();
    },
    clearGhosts,
    getState() {
      return {
        ...stats,
        reducedMotion: reducedMotion(),
        exitGhosts: document.querySelectorAll(".m9f2-exit-ghost").length
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
