(() => {
  const SCALE = 1;
  const SEAT_SIZE = 20;
  const SCREEN_OFFSET = 52;
  const LEFT_GUTTER = 42;
  const RIGHT_GUTTER = 34;
  const SEAT_TOP = 24;
  const ROW_TOP = 36;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function metrics(section, includeScreen = false) {
    const geometryWidth = Math.max(104, finite(section?.bounds?.width));
    const geometryHeight = Math.max(56, finite(section?.bounds?.height));
    const screenOffset = includeScreen ? SCREEN_OFFSET : 0;
    return {
      scale: SCALE,
      seatSize: SEAT_SIZE,
      geometryWidth,
      geometryHeight,
      screenOffset,
      screenWidth: geometryWidth,
      width: Math.round(geometryWidth + LEFT_GUTTER + RIGHT_GUTTER),
      height: Math.round(geometryHeight + 64 + screenOffset)
    };
  }

  function seatGeometry(seat, section, view) {
    const position = seat?.position || {};
    const left = (finite(position.left) - finite(section?.bounds?.minLeft)) + LEFT_GUTTER;
    const top = (finite(position.top) - finite(section?.bounds?.minTop)) + SEAT_TOP + view.screenOffset;
    return {
      left,
      top,
      width: view.seatSize,
      height: view.seatSize,
      relativeLeftPercent: finite(position.relativeLeftPercent),
      relativeTopPercent: finite(position.relativeTopPercent),
      rotate: finite(position.rotate)
    };
  }

  function rowTop(row, section, view) {
    const tops = (row?.seats || []).map(seat => Number(seat?.position?.top)).filter(Number.isFinite);
    if (!tops.length) return null;
    return (Math.min(...tops) - finite(section?.bounds?.minTop)) + ROW_TOP + view.screenOffset;
  }

  function applySeat(node, geometry) {
    if (!node || !geometry) return;
    node.style.left = `${geometry.left}px`;
    node.style.top = `${geometry.top}px`;
    node.style.width = `${geometry.width}px`;
    node.style.height = `${geometry.height}px`;
    node.style.transform = `translate(${geometry.relativeLeftPercent}%,${geometry.relativeTopPercent}%) rotate(${geometry.rotate}deg)`;
  }

  function applyScreen(screen, canvas, view) {
    if (!screen || !canvas) return;
    canvas.prepend(screen);
    screen.classList.add("emperor-positioned-screen");
    screen.style.position = "absolute";
    screen.style.left = `${LEFT_GUTTER}px`;
    screen.style.top = "0px";
    screen.style.width = `${view.screenWidth}px`;
    screen.style.maxWidth = "none";
    screen.style.margin = "0";
  }

  function apply(model, root = document) {
    if (model?.provider?.id !== "emperor" || model?.layoutMode !== "positioned") return false;
    const content = root.querySelector?.('.shared-seatmap-content[data-seatmap-provider="emperor"][data-layout-mode="positioned"]');
    if (!content) return false;
    const sectionNodes = Array.from(content.querySelectorAll(".shared-seatmap-section"));
    const modelSections = (model.sections || []).filter(section => section.seats?.length);
    const shared = window.HKCinemaSeatMapShared;
    const screen = content.querySelector(".shared-seatmap-layout > .shared-seatmap-screen");

    modelSections.forEach((section, index) => {
      const sectionNode = sectionNodes[index];
      if (!sectionNode) return;
      const includeScreen = index === 0;
      const view = metrics(section, includeScreen);
      const viewport = sectionNode.querySelector(".positioned-viewport");
      const scroller = sectionNode.querySelector(".shared-seatmap-scroll");
      const canvas = sectionNode.querySelector(".shared-seatmap-positioned-canvas");
      const rows = sectionNode.querySelector(".shared-seatmap-positioned-rows");
      if (!viewport || !scroller || !canvas || !rows) return;

      canvas.style.width = `${view.width}px`;
      canvas.style.minWidth = `${view.width}px`;
      canvas.style.height = `${view.height}px`;
      rows.style.height = `${view.height}px`;

      const seatNodes = Array.from(canvas.querySelectorAll(":scope > .shared-seat"));
      section.seats.forEach((seat, seatIndex) => applySeat(seatNodes[seatIndex], seatGeometry(seat, section, view)));

      const rowNodes = Array.from(rows.querySelectorAll("span"));
      (section.rows || []).forEach((row, rowIndex) => {
        const top = rowTop(row, section, view);
        if (rowNodes[rowIndex] && Number.isFinite(top)) rowNodes[rowIndex].style.top = `${top}px`;
      });

      if (includeScreen) applyScreen(screen, canvas, view);
      const scrollable = view.width > Number(scroller.clientWidth || viewport.clientWidth || 0) + 4;
      scroller.classList.toggle("is-scrollable", scrollable);
      if (scrollable) shared?.centerHorizontally?.(scroller);
      else scroller.scrollLeft = 0;
    });

    return true;
  }

  window.HKCinemaEmperorSeatMapView = Object.freeze({
    version: "m8a3-1",
    metrics,
    seatGeometry,
    rowTop,
    apply
  });
})();
