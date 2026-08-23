(() => {
  const ACK_MS = 180;
  const PRESS_CANCEL_DISTANCE = 10;
  const SEAT_HINT_KEY = "hkcinema:m9d-seat-scroll-hint-seen";
  const ackTimers = new WeakMap();
  let pressedCard = null;
  let seatHintSeen = readSeatHintSeen();
  let seatObserver = null;
  let observedSeatContent = null;
  let seatSyncQueued = false;

  function readSeatHintSeen() {
    try {
      return window.localStorage?.getItem(SEAT_HINT_KEY) === "1";
    } catch {
      return false;
    }
  }

  function persistSeatHintSeen() {
    try {
      window.localStorage?.setItem(SEAT_HINT_KEY, "1");
    } catch {
      // Storage can be unavailable in restricted/private contexts; session state still works.
    }
  }

  function syncSeatHintRootState() {
    document.documentElement.dataset.m9dSeatHintSeen = seatHintSeen ? "true" : "false";
  }

  function markSeatHintSeen() {
    if (seatHintSeen) return false;
    seatHintSeen = true;
    persistSeatHintSeen();
    syncSeatHintRootState();
    document.querySelectorAll(".shared-seatmap-scroll-hint").forEach(hint => {
      hint.hidden = true;
    });
    return true;
  }

  function pulseAck(node) {
    if (!node) return;
    const existing = ackTimers.get(node);
    if (existing) window.clearTimeout(existing);
    node.classList.add("m9d-control-ack");
    const timer = window.setTimeout(() => {
      node.classList.remove("m9d-control-ack");
      ackTimers.delete(node);
    }, ACK_MS);
    ackTimers.set(node, timer);
  }

  function clearPressedCard() {
    if (!pressedCard) return;
    pressedCard.card?.classList.remove("m9d-pressed");
    pressedCard = null;
  }

  function handlePointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest?.(".movie-favorite-button")) return;
    const card = event.target.closest?.(".movie-card");
    if (!card) return;
    clearPressedCard();
    pressedCard = {
      card,
      x: Number(event.clientX) || 0,
      y: Number(event.clientY) || 0
    };
    card.classList.add("m9d-pressed");
  }

  function handlePointerMove(event) {
    if (!pressedCard) return;
    const dx = Math.abs((Number(event.clientX) || 0) - pressedCard.x);
    const dy = Math.abs((Number(event.clientY) || 0) - pressedCard.y);
    if (Math.max(dx, dy) > PRESS_CANCEL_DISTANCE) clearPressedCard();
  }

  function clickAckTarget(event) {
    return event.target.closest?.([
      ".home-library-filter-options > button",
      "[data-provider-compare-date]",
      "[data-provider-filter-toggle]",
      "[data-phase9b3-group-toggle]",
      ".provider-compare-control-group button",
      ".phase8d-smart-pick",
      ".movie-favorite-button"
    ].join(", ")) || null;
  }

  function handleClickCapture(event) {
    pulseAck(clickAckTarget(event));
  }

  function handleChangeCapture(event) {
    const homeSort = event.target.closest?.(".home-movie-sort select");
    if (homeSort) {
      pulseAck(homeSort.closest(".home-movie-sort"));
      return;
    }

    const comparisonSort = event.target.closest?.(".shared-sort-control select");
    if (comparisonSort) {
      pulseAck(comparisonSort.closest(".shared-sort-control"));
      return;
    }

    const cinema = event.target.closest?.("[data-insight-cinema]");
    if (cinema) pulseAck(cinema.closest(".provider-compare-cinema-control"));
  }

  function decorateSeatScroller(scroller) {
    if (!scroller || scroller.dataset.m9dHintBound === "true") return;
    scroller.dataset.m9dHintBound = "true";

    const layout = scroller.closest(".shared-seatmap-layout");
    const hint = layout?.querySelector(".shared-seatmap-scroll-hint") || null;
    if (!hint) return;

    if (seatHintSeen) {
      hint.hidden = true;
      return;
    }

    hint.hidden = false;
    hint.classList.add("m9d-first-use-hint");
    hint.setAttribute("role", "note");

    let pointerArmed = false;
    let startScrollLeft = Number(scroller.scrollLeft || 0);

    scroller.addEventListener("pointerdown", () => {
      pointerArmed = true;
      startScrollLeft = Number(scroller.scrollLeft || 0);
    }, { passive: true });

    scroller.addEventListener("pointercancel", () => {
      pointerArmed = false;
    }, { passive: true });

    scroller.addEventListener("pointerup", () => {
      if (pointerArmed && Math.abs(Number(scroller.scrollLeft || 0) - startScrollLeft) > 4) {
        markSeatHintSeen();
      }
      pointerArmed = false;
    }, { passive: true });

    scroller.addEventListener("scroll", () => {
      if (!pointerArmed) return;
      if (Math.abs(Number(scroller.scrollLeft || 0) - startScrollLeft) > 4) markSeatHintSeen();
    }, { passive: true });

    scroller.addEventListener("wheel", event => {
      if (Math.abs(Number(event.deltaX || 0)) > 1) markSeatHintSeen();
    }, { passive: true });

    scroller.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") markSeatHintSeen();
    });
  }

  function decorateSeatHints() {
    seatSyncQueued = false;
    syncSeatHintRootState();
    document.querySelectorAll("#sharedSeatMapOverlay .shared-seatmap-scroll.is-scrollable")
      .forEach(decorateSeatScroller);
  }

  function scheduleSeatHintSync() {
    if (seatSyncQueued) return;
    seatSyncQueued = true;
    requestAnimationFrame(decorateSeatHints);
  }

  function bindSeatObserver() {
    const content = document.querySelector("#sharedSeatMapContent");
    if (!content) return;
    if (content === observedSeatContent) {
      scheduleSeatHintSync();
      return;
    }

    seatObserver?.disconnect();
    observedSeatContent = content;
    seatObserver = new MutationObserver(scheduleSeatHintSync);
    seatObserver.observe(content, { childList: true, subtree: true });
    scheduleSeatHintSync();
  }

  function install() {
    syncSeatHintRootState();

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: true });
    window.addEventListener("pointerup", clearPressedCard, true);
    window.addEventListener("pointercancel", clearPressedCard, true);
    window.addEventListener("click", handleClickCapture, true);
    window.addEventListener("change", handleChangeCapture, true);

    window.addEventListener("hkcinema:seatmap-opening", () => {
      requestAnimationFrame(bindSeatObserver);
    });

    bindSeatObserver();
  }

  window.HKCinemaM9DMicroInteractions = Object.freeze({
    version: "m9d-1",
    refreshSeatHint: scheduleSeatHintSync,
    markSeatHintSeen,
    getState() {
      return { seatHintSeen };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
