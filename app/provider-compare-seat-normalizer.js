(() => {
  let observer = null;
  let applying = false;

  function count(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    return Math.round(number);
  }

  function seatClass(available, total) {
    if (!Number.isFinite(available)) return "unknown";
    if (available <= 0) return "full";
    if (available <= 10) return "limited";

    if (Number.isFinite(total) && total > 0) {
      const ratio = available / total;
      if (ratio <= 0.08) return "limited";
    }

    return "available";
  }

  function normalizeCard(card) {
    if (
      !card?.isConnected ||
      !card.querySelector(".provider-compare-source.mcl") ||
      card.dataset.seatLoaded !== "true"
    ) {
      return;
    }

    const available = count(card.dataset.seatAvailable);
    const rawTotal = count(card.dataset.seatTotal);
    const sold = count(card.dataset.seatSold);
    const blocked = count(card.dataset.seatBlocked);
    const seat = card.querySelector(".provider-compare-seat");

    if (!seat || !Number.isFinite(available)) return;

    const knownComponents = [available, sold, blocked]
      .filter(Number.isFinite);
    const componentTotal = knownComponents.length >= 2
      ? knownComponents.reduce((sum, value) => sum + value, 0)
      : null;

    let total = rawTotal;

    if (Number.isFinite(componentTotal)) {
      total = Number.isFinite(rawTotal)
        ? Math.max(rawTotal, componentTotal, available)
        : Math.max(componentTotal, available);
    } else if (Number.isFinite(rawTotal) && rawTotal < available) {
      total = null;
    }

    const signature = [
      available,
      Number.isFinite(total) ? total : "na",
      Number.isFinite(sold) ? sold : "na",
      Number.isFinite(blocked) ? blocked : "na"
    ].join(":");

    if (card.dataset.seatNormalizedSignature === signature) {
      return;
    }

    applying = true;

    try {
      seat.classList.remove(
        "unknown",
        "available",
        "limited",
        "full",
        "loading"
      );
      seat.classList.add(seatClass(available, total));
      seat.textContent = Number.isFinite(total)
        ? `${available}/${total} 可選`
        : `${available} 個可選`;

      if (Number.isFinite(total)) {
        card.dataset.seatTotal = String(total);
      } else {
        delete card.dataset.seatTotal;
      }

      card.dataset.seatNormalizedSignature = signature;
      card.dataset.seatTotalNormalized =
        rawTotal !== total ? "true" : "false";

      window.dispatchEvent(
        new CustomEvent("hkcinema:compare-seat-summary-normalized", {
          detail: {
            provider: "mcl",
            available,
            total: Number.isFinite(total) ? total : null,
            sold: Number.isFinite(sold) ? sold : null,
            blocked: Number.isFinite(blocked) ? blocked : null,
            corrected: rawTotal !== total
          }
        })
      );
    } finally {
      applying = false;
    }
  }

  function scan() {
    if (applying) return;

    const content = document.querySelector("#providerCompareContent");
    if (!content) return;

    content
      .querySelectorAll(".provider-compare-show")
      .forEach(normalizeCard);
  }

  function install() {
    const content = document.querySelector("#providerCompareContent");

    if (!content) {
      requestAnimationFrame(install);
      return;
    }

    observer = new MutationObserver(() => {
      if (!applying) queueMicrotask(scan);
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "data-seat-loaded",
        "data-seat-available",
        "data-seat-total",
        "data-seat-sold",
        "data-seat-blocked"
      ]
    });

    window.addEventListener(
      "hkcinema:compare-seat-summary",
      () => queueMicrotask(scan)
    );

    scan();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
