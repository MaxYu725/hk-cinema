(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const DURATION_MS = 180;
  const EASING = "cubic-bezier(0, 0, .2, 1)";
  const grid = document.querySelector("#movieGrid");
  let activeAnimation = null;
  let surfaceToken = 0;
  let searchToken = 0;

  function reducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function resultSurface() {
    const empty = document.querySelector("#homeLibraryEmpty");
    if (empty && !empty.hidden) return empty;
    return grid;
  }

  function currentViewState() {
    return window.HKCinemaHomeLibrary?.getState?.() || null;
  }

  function emptyVisible() {
    const empty = document.querySelector("#homeLibraryEmpty");
    return Boolean(empty && !empty.hidden);
  }

  function framesFor(kind) {
    if (kind === "next") {
      return [
        { opacity: .78, transform: "translateX(8px)" },
        { opacity: 1, transform: "translateX(0)" }
      ];
    }
    if (kind === "previous") {
      return [
        { opacity: .78, transform: "translateX(-8px)" },
        { opacity: 1, transform: "translateX(0)" }
      ];
    }
    return [
      { opacity: .8, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" }
    ];
  }

  function animateResult(kind = "refine") {
    if (reducedMotion()) return false;
    const surface = resultSurface();
    if (!surface || typeof surface.animate !== "function") return false;

    try {
      activeAnimation?.cancel?.();
    } catch {
      // A finished animation may already be detached from its effect.
    }

    const animation = surface.animate(framesFor(kind), {
      duration: DURATION_MS,
      easing: EASING,
      fill: "none"
    });
    activeAnimation = animation;

    const clear = () => {
      if (activeAnimation === animation) activeAnimation = null;
    };
    animation.addEventListener?.("finish", clear, { once: true });
    animation.addEventListener?.("cancel", clear, { once: true });
    return true;
  }

  function queueAfterOwner(kind) {
    const token = ++surfaceToken;
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (token !== surfaceToken) return;
        animateResult(kind);
      });
    });
  }

  function tabDirection(nextTab) {
    const currentTab = document.querySelector(".tab.active")?.dataset.tab || "now";
    if (nextTab === currentTab) return null;
    if (currentTab === "now" && nextTab === "coming") return "next";
    if (currentTab === "coming" && nextTab === "now") return "previous";
    return "refine";
  }

  function handleClickCapture(event) {
    const tab = event.target.closest?.(".tab[data-tab]");
    if (tab) {
      const direction = tabDirection(tab.dataset.tab);
      if (direction) queueAfterOwner(direction);
      return;
    }

    const view = event.target.closest?.("[data-home-library-view]");
    if (view) {
      const current = currentViewState();
      if (current && current.view !== view.dataset.homeLibraryView) queueAfterOwner("refine");
      return;
    }

    const clearSearch = event.target.closest?.("[data-home-search-clear]");
    if (clearSearch) {
      queueAfterOwner("refine");
      return;
    }

    const favorite = event.target.closest?.("[data-movie-favorite]");
    if (favorite && currentViewState()?.view === "favorites") {
      queueAfterOwner("refine");
      return;
    }

    if (event.target.closest?.("[data-home-recent-clear]")) {
      queueAfterOwner("refine");
    }
  }

  function handleChangeCapture(event) {
    const sort = event.target.closest?.("[data-home-movie-sort]");
    if (!sort) return;
    const current = currentViewState();
    if (current && current.sort !== sort.value) queueAfterOwner("refine");
  }

  function handleSearchInputCapture(event) {
    if (!event.target.matches?.("[data-home-movie-search]")) return;
    const beforeEmpty = emptyVisible();
    const token = ++searchToken;

    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (token !== searchToken) return;
        const afterEmpty = emptyVisible();
        if (beforeEmpty !== afterEmpty) animateResult("refine");
      });
    });
  }

  function install() {
    window.addEventListener("click", handleClickCapture, true);
    window.addEventListener("change", handleChangeCapture, true);
    window.addEventListener("input", handleSearchInputCapture, true);
  }

  window.HKCinemaM9F1HomeContinuity = Object.freeze({
    version: "m9f1-1",
    animate: animateResult,
    getState() {
      return {
        animating: Boolean(activeAnimation),
        reducedMotion: reducedMotion()
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
