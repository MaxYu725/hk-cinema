(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  let scheduled = false;
  let comparisonSnapshot = null;
  let pendingComparisonDate = null;
  let targetedObserver = null;
  const observedTargets = new WeakSet();

  function homeSkeletonCard() {
    return `
      <article class="m9b-movie-skeleton" aria-hidden="true">
        <div class="m9b-movie-skeleton-poster"></div>
        <div class="m9b-movie-skeleton-info">
          <span class="m9b-skeleton-line title"></span>
          <span class="m9b-skeleton-line medium"></span>
          <span class="m9b-skeleton-line short"></span>
        </div>
      </article>
    `;
  }

  function decorateHomeLoading() {
    const grid = document.querySelector("#movieGrid");
    if (!grid) return;
    const loading = grid.dataset.broadwayState === "loading";
    const existing = grid.querySelector(":scope > .m9b-home-skeleton");
    if (!loading) {
      existing?.remove();
      grid.querySelector(":scope > .m9b-home-loading-copy")?.classList.remove("m9b-home-loading-copy");
      return;
    }
    if (existing) return;

    const copy = grid.querySelector(":scope > .empty-state");
    if (!copy) return;
    copy.classList.add("m9b-home-loading-copy");
    copy.setAttribute("role", "status");
    copy.setAttribute("aria-live", "polite");

    const skeleton = document.createElement("div");
    skeleton.className = "m9b-home-skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.innerHTML = Array.from({ length: 6 }, homeSkeletonCard).join("");
    copy.insertAdjacentElement("afterend", skeleton);
  }

  function compareSkeleton() {
    return `
      <div class="m9b-compare-skeleton" aria-hidden="true">
        ${Array.from({ length: 4 }, () => `
          <div class="m9b-compare-skeleton-row">
            <span></span><span></span><span></span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function cleanSnapshot(section) {
    if (!section) return null;
    section.classList.remove("m9b-date-loading");
    section.removeAttribute("aria-busy");
    section.querySelectorAll(".m9b-local-loading-bar").forEach(node => node.remove());
    section.querySelectorAll(".m9b-compare-skeleton").forEach(node => node.remove());
    return section;
  }

  function markSnapshotDate(section, date) {
    if (!section || !date) return;
    section.querySelectorAll("[data-provider-compare-date]").forEach(button => {
      const active = button.dataset.providerCompareDate === date;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "date");
      else button.removeAttribute("aria-current");
    });
  }

  function captureComparisonDate(event) {
    const closeButton = event.target.closest?.("[data-provider-compare-close]");
    if (closeButton) {
      comparisonSnapshot = null;
      pendingComparisonDate = null;
      return;
    }

    const dateButton = event.target.closest?.("[data-provider-compare-date]");
    if (!dateButton) return;
    const root = document.querySelector("#providerCompareContent");
    const timeline = root?.querySelector(".provider-compare-timeline");
    const section = timeline?.closest(".provider-compare-section");
    pendingComparisonDate = String(dateButton.dataset.providerCompareDate || "");
    comparisonSnapshot = section ? cleanSnapshot(section.cloneNode(true)) : null;
    markSnapshotDate(comparisonSnapshot, pendingComparisonDate);
  }

  function restoreComparisonSnapshot(loader) {
    if (!comparisonSnapshot || !pendingComparisonDate) return false;
    const loaderSection = loader.closest(".provider-compare-section");
    if (!loaderSection) return false;

    const restored = cleanSnapshot(comparisonSnapshot.cloneNode(true));
    restored.classList.add("m9b-date-loading");
    restored.setAttribute("aria-busy", "true");
    markSnapshotDate(restored, pendingComparisonDate);

    const notice = document.createElement("div");
    notice.className = "m9b-local-loading-bar";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.textContent = "正在更新所選日期場次；先保留上一批資料。";

    const dateRail = restored.querySelector(".provider-compare-date-rail");
    if (dateRail) dateRail.insertAdjacentElement("afterend", notice);
    else restored.prepend(notice);

    loaderSection.replaceWith(restored);
    return true;
  }

  function decorateComparisonLoading() {
    const root = document.querySelector("#providerCompareContent");
    if (!root) return;
    const overlay = document.querySelector("#providerCompareOverlay");
    if (overlay?.hidden) {
      comparisonSnapshot = null;
      pendingComparisonDate = null;
      return;
    }

    const loaders = Array.from(root.querySelectorAll(".provider-compare-loading"));
    for (const loader of loaders) {
      const copy = loader.textContent || "";
      if (copy.includes("正在整理同日場次") && restoreComparisonSnapshot(loader)) return;
      if (!loader.querySelector(".m9b-compare-skeleton")) {
        loader.insertAdjacentHTML("beforeend", compareSkeleton());
      }
    }

    const freshTimeline = root.querySelector(".provider-compare-timeline");
    if (!loaders.length && freshTimeline && !freshTimeline.closest(".m9b-date-loading")) {
      comparisonSnapshot = null;
      pendingComparisonDate = null;
    }
  }

  function seatMapSkeleton() {
    return `
      <div class="m9b-seatmap-skeleton" aria-hidden="true">
        <div class="m9b-seatmap-skeleton-screen"></div>
        ${Array.from({ length: 8 }, () => '<div class="m9b-seatmap-skeleton-row"></div>').join("")}
      </div>
    `;
  }

  function decorateSeatMapLoading() {
    const content = document.querySelector("#sharedSeatMapContent");
    const state = content?.querySelector(".shared-seatmap-state:not(.error)");
    if (!state?.querySelector(".shared-seatmap-spinner")) return;
    state.classList.add("m9b-seatmap-loading");
    state.setAttribute("aria-busy", "true");
    if (!state.querySelector(".m9b-seatmap-skeleton")) {
      state.insertAdjacentHTML("beforeend", seatMapSkeleton());
    }
  }

  function syncRefreshProgress() {
    const root = document.documentElement;
    const refreshButton = document.querySelector("#refreshButton");
    const loading = Boolean(refreshButton?.classList.contains("is-loading"));
    const next = String(loading);
    if (root.dataset.m9bRefreshing !== next) root.dataset.m9bRefreshing = next;
    const dataHealth = document.querySelector("#dataHealth");
    if (dataHealth) dataHealth.setAttribute("aria-busy", next);
  }

  function observeTarget(selector, attributeFilter) {
    const node = document.querySelector(selector);
    if (!node || observedTargets.has(node) || !targetedObserver) return;
    observedTargets.add(node);
    targetedObserver.observe(node, { attributes: true, attributeFilter });
  }

  function bindTargetObservers() {
    observeTarget("#movieGrid", ["data-broadway-state"]);
    observeTarget("#refreshButton", ["class"]);
    observeTarget("#providerCompareOverlay", ["hidden"]);
    observeTarget("#sharedSeatMapOverlay", ["hidden"]);
  }

  function loadingOwnerNode(node) {
    if (!(node instanceof Element)) return false;
    const selector = "#movieGrid, #providerCompareContent, #sharedSeatMapContent, #dataHealth, #providerCompareOverlay, #sharedSeatMapOverlay";
    return node.matches(selector) || Boolean(node.closest(selector)) || Boolean(node.querySelector(selector));
  }

  function childMutationTouchesLoadingOwner(record) {
    if (loadingOwnerNode(record.target)) return true;
    return [...record.addedNodes, ...record.removedNodes].some(loadingOwnerNode);
  }

  function sync() {
    scheduled = false;
    bindTargetObservers();
    decorateHomeLoading();
    decorateComparisonLoading();
    decorateSeatMapLoading();
    syncRefreshProgress();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function install() {
    window.addEventListener("click", captureComparisonDate, true);
    window.addEventListener("hkcinema:provider-compare-open", () => {
      comparisonSnapshot = null;
      pendingComparisonDate = null;
      schedule();
    });
    window.addEventListener("hkcinema:data-health", schedule);
    window.addEventListener("hkcinema:home-tab", schedule);
    window.addEventListener("hkcinema:seatmap-opening", schedule);

    targetedObserver = new MutationObserver(schedule);
    bindTargetObservers();

    const contentObserver = new MutationObserver(records => {
      if (records.some(childMutationTouchesLoadingOwner)) schedule();
    });
    contentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    sync();
  }

  window.HKCinemaM9BLoadingStates = Object.freeze({
    refresh: schedule,
    getState() {
      return {
        comparisonSnapshot: Boolean(comparisonSnapshot),
        pendingComparisonDate,
        refreshing: document.documentElement.dataset.m9bRefreshing === "true"
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
