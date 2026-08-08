(() => {
  const uiState = {
    provider: "all",
    region: "all",
    cinema: "all",
    period: "all",
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

  function parseSeats(card) {
    const dataAvailable = Number(card?.dataset?.seatAvailable);
    const dataTotal = Number(card?.dataset?.seatTotal);

    if (
      Number.isFinite(dataAvailable) &&
      Number.isFinite(dataTotal) &&
      dataTotal > 0 &&
      dataAvailable >= 0 &&
      dataAvailable <= dataTotal
    ) {
      return {
        available: dataAvailable,
        total: dataTotal,
        ratio: dataAvailable / dataTotal
      };
    }

    const text = card
      .querySelector(".provider-compare-seat")
      ?.textContent
      ?.trim() || "";
    const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*(?:個)?可選/);
    if (!match) return null;

    const available = Number(match[1]);
    const total = Number(match[2]);

    if (
      !Number.isFinite(available) ||
      !Number.isFinite(total) ||
      total <= 0 ||
      available < 0 ||
      available > total
    ) {
      return null;
    }

    return {
      available,
      total,
      ratio: available / total
    };
  }

  function cinemaKey(provider, cinemaMeta, cinema) {
    const registry = window.HKCinemaCinemaRegistry;
    const canonical = cinemaMeta?.canonical || cinema || "未知戲院";
    const normalized = registry?.normalize?.(canonical) ||
      String(canonical).normalize("NFKC").toLowerCase().trim();
    return `${provider}:${normalized}`;
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
    const seats = parseSeats(card);
    const registry = window.HKCinemaCinemaRegistry;
    const cinemaMeta = registry?.resolve?.(provider, cinema) || {
      canonical: cinema,
      region: "unknown",
      district: null
    };
    const key = cinemaKey(provider, cinemaMeta, cinema);

    card.dataset.cinemaRegion = cinemaMeta.region || "unknown";
    card.dataset.cinemaKey = key;
    if (cinemaMeta.district) {
      card.dataset.cinemaDistrict = cinemaMeta.district;
    } else {
      delete card.dataset.cinemaDistrict;
    }

    return {
      card,
      index,
      provider,
      providerLabel,
      time,
      timeValue: timeValue(time),
      cinema,
      cinemaMeta,
      cinemaKey: key,
      canonicalCinema: cinemaMeta.canonical || cinema,
      region: cinemaMeta.region || "unknown",
      district: cinemaMeta.district || null,
      price,
      seats,
      seatAvailable: seats?.available ?? null,
      seatRatio: seats?.ratio ?? null
    };
  }

  function matchesPeriod(item) {
    if (!Number.isFinite(item.timeValue)) return false;

    if (uiState.period === "morning") {
      return item.timeValue < 12 * 60;
    }

    if (uiState.period === "afternoon") {
      return item.timeValue >= 12 * 60 && item.timeValue < 18 * 60;
    }

    if (uiState.period === "evening") {
      return item.timeValue >= 18 * 60;
    }

    return true;
  }

  function matchesProviderAndRegion(item) {
    const providerMatches =
      uiState.provider === "all" ||
      item.provider === uiState.provider;
    const regionMatches =
      uiState.region === "all" ||
      item.region === uiState.region;

    return providerMatches && regionMatches;
  }

  function matchesFilters(item) {
    const cinemaMatches =
      uiState.cinema === "all" ||
      item.cinemaKey === uiState.cinema;

    return (
      matchesProviderAndRegion(item) &&
      cinemaMatches &&
      matchesPeriod(item)
    );
  }

  function getCinemaOptions(items) {
    const map = new Map();

    for (const item of items) {
      if (!matchesProviderAndRegion(item)) continue;

      const existing = map.get(item.cinemaKey);
      if (existing) {
        existing.shows += 1;
        continue;
      }

      map.set(item.cinemaKey, {
        key: item.cinemaKey,
        provider: item.provider,
        providerLabel: item.providerLabel,
        canonical: item.canonicalCinema,
        district: item.district,
        region: item.region,
        shows: 1
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider === "broadway" ? -1 : 1;
      }
      return a.canonical.localeCompare(b.canonical, "zh-HK", {
        numeric: true,
        sensitivity: "base"
      });
    });
  }

  function ensureCinemaSelection(items) {
    if (uiState.cinema === "all") return;

    const valid = getCinemaOptions(items)
      .some(option => option.key === uiState.cinema);

    if (!valid) {
      uiState.cinema = "all";
    }
  }

  function selectedCinemaLabel(items) {
    if (uiState.cinema === "all") return "全部戲院";
    const option = getCinemaOptions(items)
      .find(entry => entry.key === uiState.cinema);
    return option?.canonical || "指定戲院";
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

  function mostAvailable(items) {
    const eligible = items.filter(item =>
      Number.isFinite(item.seatAvailable)
    );

    if (!eligible.length) return null;

    return eligible.slice().sort((a, b) =>
      b.seatAvailable - a.seatAvailable ||
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

  function renderCinemaOptions(allItems) {
    const options = getCinemaOptions(allItems);
    const allLabel = options.length
      ? `全部戲院 (${options.length})`
      : "全部戲院";

    return `
      <option value="all" ${uiState.cinema === "all" ? "selected" : ""}>
        ${escapeHtml(allLabel)}
      </option>
      ${options.map(option => {
        const providerPrefix = uiState.provider === "all"
          ? `${option.providerLabel} · `
          : "";
        const districtSuffix = option.district &&
          !String(option.canonical).includes(option.district)
          ? ` · ${option.district}`
          : "";
        const showsSuffix = ` · ${option.shows} 場`;
        return `
          <option
            value="${escapeHtml(option.key)}"
            ${uiState.cinema === option.key ? "selected" : ""}
          >${escapeHtml(`${providerPrefix}${option.canonical}${districtSuffix}${showsSuffix}`)}</option>
        `;
      }).join("")}
    `;
  }

  function renderSummary(items, allItems) {
    const lowest = cheapest(items);
    const first = earliest(items);
    const broadway = cheapest(items, "broadway");
    const mcl = cheapest(items, "mcl");
    const seats = mostAvailable(items);
    const unknownCount = allItems.filter(item => item.region === "unknown").length;

    let differenceValue = "—";
    let differenceDetail = "目前篩選結果未同時包含兩院線票價";

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

    const unknownNote = unknownCount
      ? `另有 ${unknownCount} 場戲院名稱尚未匹配 registry，只會在「全部地區」顯示。`
      : "目前場次的戲院均已匹配 cinema registry。";

    return `
      <div class="provider-compare-insights" data-provider-insights>
        <div class="provider-compare-insight-grid">
          <article class="provider-compare-insight highlight">
            <span>目前最低成人票價</span>
            <strong>${lowest ? `$${escapeHtml(lowest.price)}` : "—"}</strong>
            <small>${lowest ? `${escapeHtml(lowest.providerLabel)} · ${escapeHtml(lowest.time)} · ${escapeHtml(lowest.cinema)}` : "目前篩選沒有票價資料"}</small>
          </article>

          <article class="provider-compare-insight">
            <span>目前最早場次</span>
            <strong>${first ? escapeHtml(first.time) : "—"}</strong>
            <small>${first ? `${escapeHtml(first.providerLabel)} · ${escapeHtml(first.cinema)}` : "目前篩選沒有場次"}</small>
          </article>

          <article class="provider-compare-insight">
            <span>院線最低價差</span>
            <strong>${escapeHtml(differenceValue)}</strong>
            <small>${escapeHtml(differenceDetail)}</small>
          </article>

          <article class="provider-compare-insight seat-insight">
            <span>目前最多可選座位</span>
            <strong>${seats ? `${escapeHtml(seats.seatAvailable)} 個` : "—"}</strong>
            <small>${seats ? `${escapeHtml(seats.providerLabel)} · ${escapeHtml(seats.time)} · ${escapeHtml(seats.cinema)}` : "只比較目前已取得座位資料的場次"}</small>
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
            <span>地區</span>
            <button type="button" data-insight-region="all" class="${uiState.region === "all" ? "active" : ""}">全部</button>
            <button type="button" data-insight-region="hk" class="${uiState.region === "hk" ? "active" : ""}">港島</button>
            <button type="button" data-insight-region="kln" class="${uiState.region === "kln" ? "active" : ""}">九龍</button>
            <button type="button" data-insight-region="nt-islands" class="${uiState.region === "nt-islands" ? "active" : ""}">新界/離島</button>
          </div>

          <label class="provider-compare-cinema-control">
            <span>戲院</span>
            <select data-insight-cinema aria-label="指定戲院">
              ${renderCinemaOptions(allItems)}
            </select>
          </label>

          <div class="provider-compare-control-group">
            <span>時段</span>
            <button type="button" data-insight-period="all" class="${uiState.period === "all" ? "active" : ""}">全日</button>
            <button type="button" data-insight-period="morning" class="${uiState.period === "morning" ? "active" : ""}">早場</button>
            <button type="button" data-insight-period="afternoon" class="${uiState.period === "afternoon" ? "active" : ""}">下午</button>
            <button type="button" data-insight-period="evening" class="${uiState.period === "evening" ? "active" : ""}">晚場</button>
          </div>

          <div class="provider-compare-control-group">
            <span>排序</span>
            <button type="button" data-insight-sort="time" class="${uiState.sort === "time" ? "active" : ""}">時間</button>
            <button type="button" data-insight-sort="price" class="${uiState.sort === "price" ? "active" : ""}">價格</button>
            <button type="button" data-insight-sort="seats" class="${uiState.sort === "seats" ? "active" : ""}">座位</button>
          </div>
        </div>

        <p class="provider-compare-insight-note">
          戲院選單只列出目前電影及日期、院線與地區下實際有場次的戲院；切換院線或地區後會自動更新。地區按 Broadway 與 MCL 官方戲院位置建立；東涌屬離島，因此與新界合併為「新界/離島」。時段：早場為 12:00 前、下午為 12:00–17:59、晚場為 18:00 起。摘要、推薦、場次數及排序均按目前篩選結果重新計算。${escapeHtml(unknownNote)}
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

      if (uiState.sort === "seats") {
        const aHasSeats = Number.isFinite(a.seatRatio);
        const bHasSeats = Number.isFinite(b.seatRatio);

        if (aHasSeats !== bHasSeats) {
          return aHasSeats ? -1 : 1;
        }

        if (aHasSeats && bHasSeats) {
          return (
            b.seatRatio - a.seatRatio ||
            b.seatAvailable - a.seatAvailable ||
            a.timeValue - b.timeValue ||
            a.index - b.index
          );
        }
      }

      return a.timeValue - b.timeValue || a.index - b.index;
    });

    for (const item of ordered) {
      item.card.hidden = !matchesFilters(item);
      timeline.appendChild(item.card);
    }

    const visibleItems = ordered.filter(item => !item.card.hidden);
    const visible = visibleItems.length;
    const section = timeline.closest(".provider-compare-timeline-section");
    let result = section?.querySelector("[data-insight-result]");

    if (!result && section) {
      result = document.createElement("div");
      result.className = "provider-compare-filter-result";
      result.dataset.insightResult = "true";
      timeline.insertAdjacentElement("beforebegin", result);
    }

    if (result) {
      const providerLabel = uiState.provider === "all"
        ? "全部院線"
        : uiState.provider === "mcl"
          ? "MCL"
          : "Broadway";
      const regionLabel = uiState.region === "hk"
        ? "港島"
        : uiState.region === "kln"
          ? "九龍"
          : uiState.region === "nt-islands"
            ? "新界/離島"
            : "全部地區";
      const cinemaLabel = selectedCinemaLabel(items);
      const periodLabel = uiState.period === "morning"
        ? "早場"
        : uiState.period === "afternoon"
          ? "下午"
          : uiState.period === "evening"
            ? "晚場"
            : "全日";
      const sortLabel = uiState.sort === "price"
        ? "價格由低至高"
        : uiState.sort === "seats"
          ? "可選比例由高至低"
          : "時間由早至晚";
      const cinemaPart = uiState.cinema === "all"
        ? ""
        : ` · ${cinemaLabel}`;
      result.textContent = `${providerLabel} · ${regionLabel}${cinemaPart} · ${periodLabel} · ${visible} 場 · ${sortLabel}`;
    }

    return visibleItems;
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

      ensureCinemaSelection(items);

      section.querySelector("[data-provider-insights]")?.remove();
      section.querySelector("[data-insight-result]")?.remove();

      const visibleItems = items.filter(matchesFilters);
      const heading = section.querySelector(".provider-compare-section-heading");
      if (heading && items.length) {
        heading.insertAdjacentHTML("afterend", renderSummary(visibleItems, items));
      }

      applyFilterAndSort(timeline, items);
    } finally {
      applying = false;
      if (content && observer) {
        observer.observe(content, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["data-seat-available", "data-seat-total"]
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
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-seat-available", "data-seat-total"]
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

    const regionButton = event.target.closest("[data-insight-region]");
    if (regionButton) {
      event.preventDefault();
      event.stopPropagation();
      uiState.region = regionButton.dataset.insightRegion || "all";
      enhance();
      return;
    }

    const periodButton = event.target.closest("[data-insight-period]");
    if (periodButton) {
      event.preventDefault();
      event.stopPropagation();
      uiState.period = periodButton.dataset.insightPeriod || "all";
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

  document.addEventListener("change", event => {
    const cinemaSelect = event.target.closest("[data-insight-cinema]");
    if (!cinemaSelect) return;

    event.stopPropagation();
    uiState.cinema = cinemaSelect.value || "all";
    enhance();
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installObserver, { once: true });
  } else {
    installObserver();
  }
})();