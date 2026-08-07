(() => {
  const uiState = {
    provider: "all",
    sort: "time"
  };

  let observer = null;
  let applying = false;

  function parseMoney(value) {
    const match = String(value || "").match(/\$\s*([\d.]+)/);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) ? number : null;
  }

  function timeValue(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function parseCard(card, index) {
    const source = card.querySelector(".provider-compare-source");
    const provider = source?.classList.contains("mcl")
      ? "mcl"
      : "broadway";
    const providerLabel = provider === "mcl" ? "MCL" : "Broadway";
    const time = card.querySelector(".provider-compare-show-time")?.textContent?.trim() || "--:--";
    const cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "戲院";
    const price = parseMoney(
      card.querySelector(".provider-compare-show-price")?.textContent
    );

    return {
      card,
      index,
      provider,
      providerLabel,
      time,
      timeValue: timeValue(time),
      cinema,
      price
    };
  }

  function cheapest(items, provider = null) {
    const eligible = items.filter(item =>
      (!provider || item.provider === provider) &&
      Number.isFinite(item.price)
    );

    if (!eligible.length) return null;

    return eligible.slice().sort((a, b) =>
      a.price - b.price ||
      a.timeValue - b.timeValue ||
      a.index - b.index
    )[0];
  }

  function earliest(items) {
    if (!items.length) return null;
    return items.slice().sort((a, b) =>
      a.timeValue - b.timeValue ||
      a.index - b.index
    )[0];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderSummary(items) {
    const lowest = cheapest(items);
    const first = earliest(items);
    const broadway = cheapest(items, "broadway");
    const mcl = cheapest(items, "mcl");

    let differenceValue = "—";
    let differenceDetail = "兩院線均有票價後顯示";

    if (broadway && mcl) {
      const difference = Math.abs(broadway.price - mcl.price);
      differenceValue = `$${difference}`;

      if (difference === 0) {
        differenceDetail = `兩院線最低成人票價同為 $${broadway.price}`;
      } else if (broadway.price < mcl.price) {
        differenceDetail = `Broadway 最低價便宜 $${difference}`;
      } else {
        differenceDetail = `MCL 最低價便宜 $${difference}`;
      }
    }

    return `
      <div class="provider-compare-insights" data-provider-insights>
        <div class="provider-compare-insight-grid">
          <article class="provider-compare-insight highlight">
            <span>當日最低成人票價</span>
            <strong>${lowest ? `$${escapeHtml(lowest.price)}` : "—"}</strong>
            <small>${lowest ? `${escapeHtml(lowest.providerLabel)} · ${escapeHtml(lowest.time)} · ${escapeHtml(lowest.cinema)}` : "暫無票價資料"}</small>
          </article>

          <article class="provider-compare-insight">
            <span>最早場次</span>
            <strong>${first ? escapeHtml(first.time) : "—"}</strong>
            <small>${first ? `${escapeHtml(first.providerLabel)} · ${escapeHtml(first.cinema)}` : "暫無場次"}</small>
          </article>

          <article class="provider-compare-insight">
            <span>院線最低價差</span>
            <strong>${escapeHtml(differenceValue)}</strong>
            <small>${escapeHtml(differenceDetail)}</small>
          </article>
        </div>

        <div class="provider-compare-controls" aria-label="場次篩選及排序">
          <div class="provider-compare-control-group">
            <span>院線</span>
            <button type="button" data-insight-provider="all" class="${uiState.provider === "all" ? "active" : ""}">全部</button>
            <button type="button" data-insight-provider="broadway" class="${uiState.provider === "broadway" ? "active" : ""}">Broadway</button>
            <button type="button" data-insight-provider="mcl" class="${uiState.provider === "mcl" ? "active" : ""}">MCL</button>
          </div>

          <div class="provider-compare-control-group">
            <span>排序</span>
            <button type="button" data-insight-sort="time" class="${uiState.sort === "time" ? "active" : ""}">時間</button>
            <button type="button" data-insight-sort="price" class="${uiState.sort === "price" ? "active" : ""}">價格</button>
          </div>
        </div>

        <p class="provider-compare-insight-note">
          最低價比較為各院線當日成人票最低值，不代表相同影廳、格式或場次條件。
        </p>
      </div>
    `;
  }

  function applyFilterAndSort(timeline, items) {
    const ordered = items.slice().sort((a, b) => {
      if (uiState.sort === "price") {
        const aPrice = Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
        const bPrice = Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
        return aPrice - bPrice || a.timeValue - b.timeValue || a.index - b.index;
      }

      return a.timeValue - b.timeValue || a.index - b.index;
    });

    for (const item of ordered) {
      item.card.hidden =
        uiState.provider !== "all" &&
        item.provider !== uiState.provider;
      timeline.appendChild(item.card);
    }

    const visible = ordered.filter(item => !item.card.hidden).length;
    const section = timeline.closest(".provider-compare-timeline-section");
    let result = section?.querySelector("[data-insight-result]");

    if (!result && section) {
      result = document.createElement("div");
      result.className = "provider-compare-filter-result";
      result.dataset.insightResult = "true";
      timeline.insertAdjacentElement("beforebegin", result);
    }

    if (result) {
      const filterLabel = uiState.provider === "all"
        ? "全部院線"
        : uiState.provider === "mcl"
          ? "MCL"
          : "Broadway";
      const sortLabel = uiState.sort === "price" ? "價格由低至高" : "時間由早至晚";
      result.textContent = `${filterLabel} · ${visible} 場 · ${sortLabel}`;
    }
  }

  function enhance() {
    if (applying) return;

    const content = document.querySelector("#providerCompareContent");
    const timeline = content?.querySelector(".provider-compare-timeline");
    const section = timeline?.closest(".provider-compare-timeline-section");

    if (!timeline || !section) return;

    applying = true;
    observer?.disconnect();

    try {
      const cards = Array.from(
        timeline.querySelectorAll(":scope > .provider-compare-show")
      );
      const items = cards.map(parseCard);

      section.querySelector("[data-provider-insights]")?.remove();
      section.querySelector("[data-insight-result]")?.remove();

      const heading = section.querySelector(".provider-compare-section-heading");
      if (heading && items.length) {
        heading.insertAdjacentHTML("afterend", renderSummary(items));
      }

      applyFilterAndSort(timeline, items);
    } finally {
      applying = false;
      if (content && observer) {
        observer.observe(content, {
          childList: true,
          subtree: true
        });
      }
    }
  }

  function scheduleEnhance() {
    queueMicrotask(enhance);
  }

  function installObserver() {
    const overlay = document.querySelector("#providerCompareOverlay");
    const content = overlay?.querySelector("#providerCompareContent");

    if (!content) {
      requestAnimationFrame(installObserver);
      return;
    }

    observer = new MutationObserver(() => {
      if (!applying) scheduleEnhance();
    });

    observer.observe(content, {
      childList: true,
      subtree: true
    });

    enhance();
  }

  document.addEventListener("click", event => {
    const providerButton = event.target.closest("[data-insight-provider]");
    if (providerButton) {
      event.preventDefault();
      event.stopPropagation();
      uiState.provider = providerButton.dataset.insightProvider || "all";
      enhance();
      return;
    }

    const sortButton = event.target.closest("[data-insight-sort]");
    if (sortButton) {
      event.preventDefault();
      event.stopPropagation();
      uiState.sort = sortButton.dataset.insightSort || "time";
      enhance();
    }
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installObserver, { once: true });
  } else {
    installObserver();
  }
})();
