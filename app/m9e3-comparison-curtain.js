(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const QUIET_FRAMES_REQUIRED = 3;
  const RELEASE_MS = 170;
  const FORCE_RELEASE_MS = 900;

  let content = null;
  let observer = null;
  let bodyObserver = null;
  let mutationVersion = 0;
  let settleRaf = 0;
  let releaseTimer = 0;
  let fallbackTimer = 0;
  let quietFrames = 0;
  let lastCheckedVersion = -1;
  let forceReleasing = false;

  function reducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  function overlayOpen() {
    const overlay = document.querySelector("#providerCompareOverlay");
    return Boolean(overlay && !overlay.hidden);
  }

  function currentContent() {
    return document.querySelector("#providerCompareContent");
  }

  function heroCurtainTop(root) {
    const hero = root?.querySelector(":scope > .provider-compare-hero");
    if (!hero) return 0;
    return Math.max(0, hero.offsetTop + hero.offsetHeight + 18);
  }

  function syncCurtainTop(root = content) {
    if (!root?.hasAttribute("data-m9e3-curtain")) return;
    root.style.setProperty("--m9e3-curtain-top", `${heroCurtainTop(root)}px`);
  }

  function clearTimers() {
    if (settleRaf) cancelAnimationFrame(settleRaf);
    settleRaf = 0;
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    clearTimeout(fallbackTimer);
    fallbackTimer = 0;
  }

  function clearCurtain() {
    clearTimers();
    quietFrames = 0;
    lastCheckedVersion = -1;
    forceReleasing = false;
    const root = currentContent();
    if (!root) return;
    root.removeAttribute("data-m9e3-curtain");
    root.removeAttribute("data-m9e3-curtain-label");
    root.removeAttribute("aria-busy");
  }

  function loadingStillOwned(root = content) {
    if (!root) return true;
    if (root.querySelector(".provider-compare-loading")) return true;
    if (root.querySelector(".m9b-date-loading")) return true;
    return false;
  }

  function finalStructureReady(root = content) {
    if (!root || loadingStillOwned(root)) return false;
    const section = root.querySelector(".provider-compare-timeline-section");
    if (!section) return false;
    if (!section.classList.contains("phase8b-timeline-section")) return false;
    if (!section.querySelector(".provider-compare-date-rail")) return false;
    if (!section.querySelector("[data-provider-insights]")) return false;
    if (!section.querySelector("[data-provider-compare-reset]")) return false;
    if (!section.querySelector(".provider-compare-section-heading")) return false;
    if (!section.querySelector(".provider-compare-timeline, .provider-compare-empty")) return false;
    return true;
  }

  function finalTimelineExists(root = content) {
    if (!root || loadingStillOwned(root)) return false;
    return Boolean(root.querySelector(".provider-compare-timeline-section .provider-compare-timeline, .provider-compare-timeline-section .provider-compare-empty"));
  }

  function finishRelease() {
    releaseTimer = 0;
    const root = currentContent();
    if (!root) return;
    root.removeAttribute("data-m9e3-curtain");
    root.removeAttribute("data-m9e3-curtain-label");
    root.removeAttribute("aria-busy");
    forceReleasing = false;
    quietFrames = 0;
    lastCheckedVersion = -1;
  }

  function releaseCurtain(force = false) {
    const root = currentContent();
    if (!root?.hasAttribute("data-m9e3-curtain") || !overlayOpen()) {
      clearCurtain();
      return;
    }
    forceReleasing = force;
    root.dataset.m9e3Curtain = "releasing";
    clearTimeout(fallbackTimer);
    fallbackTimer = 0;
    if (reducedMotion()) {
      requestAnimationFrame(finishRelease);
      return;
    }
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(finishRelease, RELEASE_MS);
  }

  function armFallback() {
    if (fallbackTimer || !finalTimelineExists()) return;
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = 0;
      if (currentContent()?.hasAttribute("data-m9e3-curtain") && finalTimelineExists()) {
        releaseCurtain(true);
      }
    }, FORCE_RELEASE_MS);
  }

  function checkSettledFrame() {
    settleRaf = 0;
    const root = currentContent();
    if (!root?.hasAttribute("data-m9e3-curtain") || !overlayOpen()) {
      clearCurtain();
      return;
    }

    syncCurtainTop(root);
    if (!finalStructureReady(root)) {
      quietFrames = 0;
      lastCheckedVersion = mutationVersion;
      armFallback();
      return;
    }

    armFallback();
    if (lastCheckedVersion === mutationVersion) quietFrames += 1;
    else {
      lastCheckedVersion = mutationVersion;
      quietFrames = 0;
    }

    if (quietFrames >= QUIET_FRAMES_REQUIRED) {
      releaseCurtain(false);
      return;
    }
    settleRaf = requestAnimationFrame(checkSettledFrame);
  }

  function scheduleSettleCheck() {
    if (settleRaf || !currentContent()?.hasAttribute("data-m9e3-curtain")) return;
    settleRaf = requestAnimationFrame(checkSettledFrame);
  }

  function structuralMutation(record) {
    const target = record.target?.nodeType === Node.ELEMENT_NODE
      ? record.target
      : record.target?.parentElement;
    if (!target?.closest?.("#providerCompareContent")) return false;

    const timeline = target.closest?.(".provider-compare-timeline");
    if (timeline && target !== timeline) return false;
    return true;
  }

  function handleMutations(records) {
    if (!records.some(structuralMutation)) return;
    mutationVersion += 1;
    const root = currentContent();
    if (!root?.hasAttribute("data-m9e3-curtain")) return;

    if (root.dataset.m9e3Curtain === "releasing" && !forceReleasing) {
      clearTimeout(releaseTimer);
      releaseTimer = 0;
      root.dataset.m9e3Curtain = "active";
      quietFrames = 0;
      lastCheckedVersion = -1;
    }
    syncCurtainTop(root);
    scheduleSettleCheck();
  }

  function bindContentObserver() {
    const root = currentContent();
    if (!root || root === content) return;
    observer?.disconnect();
    content = root;
    observer = new MutationObserver(handleMutations);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  }

  function startCurtain(label = "更新場次") {
    bindContentObserver();
    const root = currentContent();
    if (!root || !overlayOpen()) return;

    clearTimers();
    forceReleasing = false;
    quietFrames = 0;
    lastCheckedVersion = -1;
    mutationVersion += 1;
    root.dataset.m9e3Curtain = "active";
    root.dataset.m9e3CurtainLabel = label;
    root.setAttribute("aria-busy", "true");
    syncCurtainTop(root);
    scheduleSettleCheck();
  }

  function dateLabel(button) {
    const text = button?.querySelector("strong")?.textContent?.trim();
    return text ? `更新 ${text} 場次` : "更新場次";
  }

  function handleClickCapture(event) {
    if (event.target.closest?.("[data-provider-compare-close]")) {
      clearCurtain();
      return;
    }

    const date = event.target.closest?.("[data-provider-compare-date]");
    if (date) {
      startCurtain(dateLabel(date));
      return;
    }

    if (event.target.closest?.("[data-provider-compare-retry]")) {
      startCurtain("重新整理場次");
    }
  }

  function install() {
    window.addEventListener("click", handleClickCapture, true);
    window.addEventListener("keydown", event => {
      if (event.key === "Escape") clearCurtain();
    }, true);

    bindContentObserver();
    bodyObserver = new MutationObserver(() => {
      bindContentObserver();
      if (!overlayOpen()) clearCurtain();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.HKCinemaM9E3ComparisonCurtain = Object.freeze({
    refresh() {
      bindContentObserver();
      syncCurtainTop();
      scheduleSettleCheck();
    },
    getState() {
      const root = currentContent();
      return {
        active: Boolean(root?.hasAttribute("data-m9e3-curtain")),
        phase: root?.dataset?.m9e3Curtain || "idle",
        label: root?.dataset?.m9e3CurtainLabel || "",
        mutationVersion,
        quietFrames
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
