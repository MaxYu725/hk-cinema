(() => {
  const OPEN_EVENT = "hkcinema:seatmap-opening";

  function prepareTrigger(node, { provider, label } = {}) {
    if (!node) return null;

    const normalizedProvider = String(provider || "").trim().toLowerCase();
    node.classList.add("seatmap-launch");
    if (normalizedProvider) {
      node.classList.add(`${normalizedProvider}-seatmap-launch`);
      node.dataset.seatmapProvider = normalizedProvider;
    }
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    if (label) node.setAttribute("aria-label", String(label));
    return node;
  }

  function isActivationKey(event) {
    return event?.key === "Enter" || event?.key === " ";
  }

  function centerHorizontally(scroller) {
    if (!scroller) return 0;
    const maximumScroll = Math.max(
      0,
      Number(scroller.scrollWidth || 0) - Number(scroller.clientWidth || 0)
    );
    const target = Math.round(maximumScroll / 2);
    scroller.scrollLeft = target;
    return target;
  }

  function centerAfterRender(root, selector) {
    if (!root || !selector) return;
    requestAnimationFrame(() => {
      root.querySelectorAll(selector).forEach(centerHorizontally);
    });
  }

  function announceOpening(provider) {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, {
      detail: { provider: String(provider || "").trim().toLowerCase() }
    }));
  }

  window.HKCinemaSeatMapShared = Object.freeze({
    openEvent: OPEN_EVENT,
    prepareTrigger,
    isActivationKey,
    centerHorizontally,
    centerAfterRender,
    announceOpening
  });
})();
