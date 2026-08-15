(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const HEALTH_EXIT_MS = 140;
  const HEALTH_GHOST_CLEANUP_MS = HEALTH_EXIT_MS + 90;
  const POSTER_REVEAL_MS = 160;
  const EASING = "cubic-bezier(0, 0, .2, 1)";

  const decoratedPosters = new WeakSet();
  let gridObserver = null;

  const stats = {
    posterDecorated: 0,
    posterReveals: 0,
    healthExitGhosts: 0
  };

  function reducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function clearHealthGhosts() {
    document.querySelectorAll(".m9f3-data-health-exit-ghost").forEach(node => node.remove());
  }

  function spawnHealthExitGhost() {
    if (reducedMotion()) return false;
    const panel = document.querySelector("#dataHealth");
    const body = panel?.querySelector(":scope > .data-health-body");
    if (!panel?.open || !body || typeof body.getBoundingClientRect !== "function") return false;

    const rect = body.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;

    clearHealthGhosts();
    const ghost = body.cloneNode(true);
    ghost.classList.add("m9f3-data-health-exit-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    ghost.querySelectorAll("button, a, input, select, textarea, [tabindex]").forEach(node => {
      node.setAttribute("tabindex", "-1");
      node.setAttribute("aria-hidden", "true");
    });
    Object.assign(ghost.style, {
      top: `${Math.round(rect.top)}px`,
      left: `${Math.round(rect.left)}px`,
      right: "auto",
      bottom: "auto",
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      zIndex: "80",
      pointerEvents: "none",
      transformOrigin: "center top"
    });
    document.body.appendChild(ghost);

    if (typeof ghost.animate !== "function") {
      ghost.remove();
      return false;
    }

    stats.healthExitGhosts += 1;
    const animation = ghost.animate([
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(-3px) scale(.99)" }
    ], {
      duration: HEALTH_EXIT_MS,
      easing: EASING,
      fill: "none"
    });

    const remove = () => ghost.remove();
    animation.addEventListener?.("finish", remove, { once: true });
    animation.addEventListener?.("cancel", remove, { once: true });
    window.setTimeout(remove, HEALTH_GHOST_CLEANUP_MS);
    return true;
  }

  function markPosterLoaded(image) {
    if (!image || !image.isConnected) return false;
    if (!image.classList.contains("m9f3-poster-loaded")) {
      image.classList.add("m9f3-poster-loaded");
      stats.posterReveals += 1;
    }
    return true;
  }

  function decoratePoster(image) {
    if (!(image instanceof HTMLImageElement) || decoratedPosters.has(image)) return false;
    decoratedPosters.add(image);
    stats.posterDecorated += 1;
    image.classList.add("m9f3-poster-media");

    if (reducedMotion() || (image.complete && image.naturalWidth > 0)) {
      markPosterLoaded(image);
      return true;
    }

    image.addEventListener("load", () => {
      requestAnimationFrame(() => markPosterLoaded(image));
    }, { once: true });
    image.addEventListener("error", () => {
      image.classList.add("m9f3-poster-loaded");
    }, { once: true });
    return true;
  }

  function scanPosters(root = document.querySelector("#movieGrid")) {
    if (!root) return 0;
    let count = 0;
    if (root.matches?.(".movie-poster img")) count += decoratePoster(root) ? 1 : 0;
    root.querySelectorAll?.(".movie-poster img").forEach(image => {
      if (decoratePoster(image)) count += 1;
    });
    return count;
  }

  function handleGridMutations(records) {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (node instanceof Element) scanPosters(node);
      }
    }
  }

  function handleClickCapture(event) {
    const panel = document.querySelector("#dataHealth");
    if (!panel) return;

    const summary = event.target.closest?.("#dataHealth > summary");
    if (summary) {
      if (panel.open) spawnHealthExitGhost();
      else clearHealthGhosts();
      return;
    }

    if (panel.open && !panel.contains(event.target)) spawnHealthExitGhost();
  }

  function handleKeyCapture(event) {
    if (event.key !== "Escape") return;
    const panel = document.querySelector("#dataHealth");
    if (panel?.open) spawnHealthExitGhost();
  }

  function install() {
    const grid = document.querySelector("#movieGrid");
    scanPosters(grid);
    if (grid) {
      gridObserver = new MutationObserver(handleGridMutations);
      gridObserver.observe(grid, { childList: true });
    }

    window.addEventListener("click", handleClickCapture, true);
    window.addEventListener("keydown", handleKeyCapture, true);
  }

  window.HKCinemaM9F3FinalPolish = Object.freeze({
    version: "m9f3-1",
    posterRevealMs: POSTER_REVEAL_MS,
    refresh() {
      scanPosters();
    },
    clearHealthGhosts,
    getState() {
      return {
        ...stats,
        reducedMotion: reducedMotion(),
        healthGhosts: document.querySelectorAll(".m9f3-data-health-exit-ghost").length
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
