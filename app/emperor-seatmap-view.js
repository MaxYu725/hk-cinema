(() => {
  const OPEN_EVENT = "hkcinema:seatmap-opening";
  const SEAT_SIZE = 20;
  const SCREEN_OFFSET = 52;
  const LEFT_GUTTER = 42;
  const RIGHT_GUTTER = 34;
  const RETRY_DELAYS = Object.freeze([0, 50, 150, 400, 900, 1800, 3500, 7000, 11500]);
  let generation = 0;

  function px(value) {
    const number = Number.parseFloat(String(value || ""));
    return Number.isFinite(number) ? number : null;
  }

  function shiftPx(value, offset = SCREEN_OFFSET) {
    const number = px(value);
    return Number.isFinite(number) ? `${number + offset}px` : value;
  }

  function presentation(canvasWidth, includeScreen = false) {
    const width = Math.max(104, Number(canvasWidth) || 0);
    return Object.freeze({
      seatSize: SEAT_SIZE,
      screenOffset: includeScreen ? SCREEN_OFFSET : 0,
      screenWidth: Math.max(104, width - LEFT_GUTTER - RIGHT_GUTTER)
    });
  }

  function applySeatSize(canvas) {
    canvas.querySelectorAll(":scope > .shared-seat").forEach(seat => {
      seat.style.width = `${SEAT_SIZE}px`;
      seat.style.height = `${SEAT_SIZE}px`;
    });
  }

  function shiftFirstSection(section, canvas, rows, screen) {
    const canvasWidth = px(canvas.style.width) || canvas.scrollWidth || canvas.clientWidth || 0;
    const view = presentation(canvasWidth, true);

    canvas.querySelectorAll(":scope > .shared-seat").forEach(seat => {
      seat.style.top = shiftPx(seat.style.top, view.screenOffset);
    });
    rows?.querySelectorAll("span").forEach(label => {
      label.style.top = shiftPx(label.style.top, view.screenOffset);
    });

    const canvasHeight = px(canvas.style.height);
    if (Number.isFinite(canvasHeight)) canvas.style.height = `${canvasHeight + view.screenOffset}px`;
    const rowsHeight = px(rows?.style?.height);
    if (rows && Number.isFinite(rowsHeight)) rows.style.height = `${rowsHeight + view.screenOffset}px`;

    if (screen) {
      canvas.prepend(screen);
      screen.classList.add("emperor-positioned-screen");
      screen.style.position = "absolute";
      screen.style.left = `${LEFT_GUTTER}px`;
      screen.style.top = "0px";
      screen.style.width = `${view.screenWidth}px`;
      screen.style.maxWidth = "none";
      screen.style.margin = "0";
    }

    section.dataset.emperorScreenIntegrated = "true";
  }

  function apply(root = document) {
    const content = root.querySelector?.('.shared-seatmap-content[data-seatmap-provider="emperor"][data-layout-mode="positioned"]');
    if (!content || content.dataset.emperorViewApplied === "true") return false;

    const sections = Array.from(content.querySelectorAll(".shared-seatmap-section"));
    if (!sections.length) return false;
    const screen = content.querySelector(".shared-seatmap-layout > .shared-seatmap-screen");
    const shared = window.HKCinemaSeatMapShared;

    let applied = false;
    sections.forEach((section, index) => {
      const viewport = section.querySelector(".positioned-viewport");
      const scroller = section.querySelector(".shared-seatmap-scroll");
      const canvas = section.querySelector(".shared-seatmap-positioned-canvas");
      const rows = section.querySelector(".shared-seatmap-positioned-rows");
      if (!viewport || !scroller || !canvas) return;

      applySeatSize(canvas);
      if (index === 0) shiftFirstSection(section, canvas, rows, screen);
      if (scroller.classList.contains("is-scrollable")) shared?.centerHorizontally?.(scroller);
      applied = true;
    });

    if (applied) content.dataset.emperorViewApplied = "true";
    return applied;
  }

  function scheduleForOpening(event) {
    generation += 1;
    const ownGeneration = generation;
    if (event?.detail?.provider !== "emperor") return;

    for (const delay of RETRY_DELAYS) {
      setTimeout(() => {
        if (ownGeneration !== generation) return;
        if (apply()) generation += 1;
      }, delay);
    }
  }

  window.addEventListener(OPEN_EVENT, scheduleForOpening);
  window.addEventListener("hkcinema:movie-detail-close", () => { generation += 1; });

  window.HKCinemaEmperorSeatMapView = Object.freeze({
    version: "m8a3-1",
    retryDelays: RETRY_DELAYS,
    seatSize: SEAT_SIZE,
    screenOffset: SCREEN_OFFSET,
    presentation,
    shiftPx,
    apply
  });
})();
