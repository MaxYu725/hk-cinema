(() => {
  const MOBILE_QUERY = "(max-width: 640px)";
  const MIN_ENTER_BUFFER = 64;
  const EXIT_BUFFER = 8;
  let latched = false;
  let anchor = null;
  let queued = false;

  function tools() {
    return document.querySelector("#homeLibraryTools");
  }

  function documentFlowTop(element) {
    let top = 0;
    let node = element;
    while (node) {
      top += Number(node.offsetTop) || 0;
      node = node.offsetParent;
    }
    return top;
  }

  function stickyTop(element) {
    const value = Number.parseFloat(getComputedStyle(element).top);
    return Number.isFinite(value) ? value : 8;
  }

  function enterBuffer(element) {
    const primary = element.querySelector(".home-library-primary");
    const expandedHeight = element.offsetHeight;
    const compactHeight = primary?.offsetHeight || 0;
    return Math.max(MIN_ENTER_BUFFER, expandedHeight - compactHeight + 16);
  }

  function resetAnchor() {
    const element = tools();
    anchor = element ? documentFlowTop(element) : null;
  }

  function setLatched(element, next) {
    if (latched === next) return;
    latched = next;
    element.classList.toggle("is-stuck-latched", latched);
  }

  function sync() {
    const element = tools();
    if (!element) return;

    if (!window.matchMedia(MOBILE_QUERY).matches) {
      setLatched(element, false);
      anchor = documentFlowTop(element);
      return;
    }

    if (!Number.isFinite(anchor)) resetAnchor();
    if (!Number.isFinite(anchor)) return;

    const edge = window.scrollY + stickyTop(element);
    if (!latched) {
      if (edge >= anchor + enterBuffer(element)) setLatched(element, true);
      return;
    }

    if (edge <= anchor - EXIT_BUFFER) setLatched(element, false);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  }

  function resetForLayoutChange() {
    const element = tools();
    if (element) setLatched(element, false);
    anchor = null;
    requestAnimationFrame(() => {
      resetAnchor();
      sync();
    });
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", resetForLayoutChange, { passive: true });
  window.addEventListener("hkcinema:home-tab", resetForLayoutChange);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });

  requestAnimationFrame(() => {
    resetAnchor();
    sync();
  });

  window.HKCinemaHomeStickyScroll = Object.freeze({
    version: "9d0-scroll1",
    sync,
    resetForLayoutChange,
    getState() {
      return { anchor, latched };
    }
  });
})();
