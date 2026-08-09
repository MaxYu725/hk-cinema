(() => {
  const PROVIDER_LABELS = {
    broadway: "Broadway",
    mcl: "MCL",
    emperor: "Emperor"
  };
  const PROVIDER_ORDER = { broadway: 0, mcl: 1, emperor: 2 };
  const DEFAULT_FILTERS = Object.freeze({
    provider: "all",
    language: "all",
    subtitle: "all",
    format: "all",
    region: "all",
    cinema: "all",
    period: "all",
    sort: "time"
  });
  const FILTER_LABELS = Object.freeze({
    region: { hk: "港島", kln: "九龍", "nt-islands": "新界/離島" },
    period: { morning: "早場", afternoon: "下午", evening: "晚場" },
    sort: { price: "價格排序", seats: "座位排序" }
  });
  const METADATA_ORDER = Object.freeze({
    language: ["cantonese", "english", "japanese", "mandarin", "korean", "thai", "french", "german", "spanish", "hindi", "original", "unknown"],
    subtitle: ["chinese", "english", "japanese", "none", "unknown"],
    format: ["2d", "3d", "imax", "4dx", "mx4d", "d-box", "screenx", "luxe", "dolby", "35mm", "4k", "unknown"]
  });
  const METADATA_UNKNOWN_LABELS = Object.freeze({
    language: "語言未提供",
    subtitle: "字幕未提供",
    format: "制式未提供"
  });

  const uiState = {
    provider: "all",
    language: "all",
    subtitle: "all",
    format: "all",
    region: "all",
    cinema: "all",
    period: "all",
    sort: "time",
    expanded: false
  };

  let observer = null;
  let applying = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  function metadataCore() {
    return window.HKCinemaShowtimeMetadata || null;
  }

  function metadataValues(card, key) {
    return String(card?.dataset?.[key] || "unknown")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
  }

  function metadataLabel(kind, key) {
    if (key === "unknown") return METADATA_UNKNOWN_LABELS[kind] || "未提供";
    return metadataCore()?.labels?.[kind]?.[key] || key;
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

    const text = card.querySelector(".provider-compare-seat")?.textContent?.trim() || "";
    const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*(?:個)?(?:可選|未售)/);
    if (!match) return null;
    const available = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(available) || !Number.isFinite(total) || total <= 0 || available < 0 || available > total) {
      return null;
    }
    return { available, total, ratio: available / total };
  }

  function detectProvider(card) {
    const source = card.querySelector(".provider-compare-source");
    if (source?.classList.contains("emperor")) return "emperor";
    if (source?.classList.contains("mcl")) return "mcl";
    return "broadway";
  }

  function cinemaKey(provider, cinemaMeta, cinema) {
    const registry = window.HKCinemaCinemaRegistry;
    const canonical = cinemaMeta?.canonical || cinema || "未知戲院";
    const normalized = registry?.normalize?.(canonical) || String(canonical).normalize("NFKC").toLowerCase().trim();
    return `${provider}:${normalized}`;
  }

  function parseCard(card, index) {
    const provider = detectProvider(card);
    const providerLabel = PROVIDER_LABELS[provider];
    const time = card.querySelector(".provider-compare-show-time")?.textContent?.trim() || "--:--";
    const cinema = card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "戲院";
    const price = parseMoney(card.querySelector(".provider-compare-show-price")?.textContent);
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
    if (cinemaMeta.district) card.dataset.cinemaDistrict = cinemaMeta.district;
    else delete card.dataset.cinemaDistrict;

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
      languages: metadataValues(card, "showLanguage"),
      subtitles: metadataValues(card, "showSubtitle"),
      formats: metadataValues(card, "showFormat"),
      seats,
      seatAvailable: seats?.available ?? null,
      seatRatio: seats?.ratio ?? null
    };
  }

  function matchesPeriod(item) {
    if (!Number.isFinite(item.timeValue)) return false;
    if (uiState.period === "morning") return item.timeValue < 12 * 60;
    if (uiState.period === "afternoon") return item.timeValue >= 12 * 60 && item.timeValue < 18 * 60;
    if (uiState.period === "evening") return item.timeValue >= 18 * 60;
    return true;
  }

  function matchesProviderAndRegion(item) {
    return (
      (uiState.provider === "all" || item.provider === uiState.provider) &&
      (uiState.region === "all" || item.region === uiState.region)
    );
  }

  function matchesMetadataFilters(item) {
    return (
      (uiState.language === "all" || item.languages.includes(uiState.language)) &&
      (uiState.subtitle === "all" || item.subtitles.includes(uiState.subtitle)) &&
      (uiState.format === "all" || item.formats.includes(uiState.format))
    );
  }

  function matchesFilters(item) {
    return (
      matchesProviderAndRegion(item) &&
      matchesMetadataFilters(item) &&
      (uiState.cinema === "all" || item.cinemaKey === uiState.cinema) &&
      matchesPeriod(item)
    );
  }

  function getCinemaOptions(items) {
    const map = new Map();
    for (const item of items) {
      if (!matchesProviderAndRegion(item) || !matchesMetadataFilters(item)) continue;
      const periodMatches = matchesPeriod(item);
      const existing = map.get(item.cinemaKey);
      if (existing) {
        existing.totalShows += 1;
        if (periodMatches) existing.shows += 1;
        continue;
      }
      map.set(item.cinemaKey, {
        key: item.cinemaKey,
        provider: item.provider,
        providerLabel: item.providerLabel,
        canonical: item.canonicalCinema,
        district: item.district,
        region: item.region,
        shows: periodMatches ? 1 : 0,
        totalShows: 1
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      (PROVIDER_ORDER[a.provider] ?? 99) - (PROVIDER_ORDER[b.provider] ?? 99) ||
      a.canonical.localeCompare(b.canonical, "zh-HK", { numeric: true, sensitivity: "base" })
    );
  }

  function ensureCinemaSelection(items) {
    if (uiState.cinema === "all") return;
    if (!getCinemaOptions(items).some(option => option.key === uiState.cinema)) {
      uiState.cinema = "all";
    }
  }

  function metadataOptions(items, kind) {
    const field = kind === "language" ? "languages" : kind === "subtitle" ? "subtitles" : "formats";
    const keys = Array.from(new Set(items.flatMap(item => item[field] || [])));
    const order = METADATA_ORDER[kind] || [];
    return keys
      .map(key => ({ key, label: metadataLabel(kind, key) }))
      .sort((a, b) => {
        const aOrder = order.indexOf(a.key);
        const bOrder = order.indexOf(b.key);
        return (aOrder < 0 ? 99 : aOrder) - (bOrder < 0 ? 99 : bOrder) || a.label.localeCompare(b.label, "zh-HK");
      });
  }

  function ensureMetadataSelections(items) {
    for (const kind of ["language", "subtitle", "format"]) {
      if (uiState[kind] === "all") continue;
      if (!metadataOptions(items, kind).some(option => option.key === uiState[kind])) {
        uiState[kind] = "all";
      }
    }
  }

  function selectedMetadataLabel(kind) {
    return uiState[kind] === "all" ? "" : metadataLabel(kind, uiState[kind]);
  }

  function selectedCinemaLabel(items) {
    if (uiState.cinema === "all") return "全部戲院";
    return getCinemaOptions(items).find(entry => entry.key === uiState.cinema)?.canonical || "指定戲院";
  }

  function activeFilters(items) {
    const filters = [];
    if (uiState.provider !== DEFAULT_FILTERS.provider) {
      filters.push({ key: "provider", label: PROVIDER_LABELS[uiState.provider] || uiState.provider });
    }
    for (const kind of ["language", "subtitle", "format"]) {
      if (uiState[kind] !== DEFAULT_FILTERS[kind]) {
        filters.push({ key: kind, label: selectedMetadataLabel(kind) });
      }
    }
    if (uiState.region !== DEFAULT_FILTERS.region) {
      filters.push({ key: "region", label: FILTER_LABELS.region[uiState.region] || uiState.region });
    }
    if (uiState.cinema !== DEFAULT_FILTERS.cinema) {
      filters.push({ key: "cinema", label: selectedCinemaLabel(items) });
    }
    if (uiState.period !== DEFAULT_FILTERS.period) {
      filters.push({ key: "period", label: FILTER_LABELS.period[uiState.period] || uiState.period });
    }
    if (uiState.sort !== DEFAULT_FILTERS.sort) {
      filters.push({ key: "sort", label: FILTER_LABELS.sort[uiState.sort] || uiState.sort });
    }
    return filters;
  }

  function renderActiveFilters(items) {
    const filters = activeFilters(items);
    if (!filters.length) return "";
    return `
      <div class="phase6m-active-filters" data-phase6m-active-filters aria-label="目前生效的比較條件">
        <span class="phase6m-active-filter-count">${filters.length} 個條件</span>
        <div class="phase6m-active-filter-chips">
          ${filters.map(filter => `
            <button type="button" class="phase6m-filter-chip" data-insight-clear-filter="${escapeHtml(filter.key)}" aria-label="清除${escapeHtml(filter.label)}篩選">${escapeHtml(filter.label)} ×</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function cheapest(items, provider = null) {
    return items
      .filter(item => (!provider || item.provider === provider) && Number.isFinite(item.price))
      .slice()
      .sort((a, b) => a.price - b.price || a.timeValue - b.timeValue || a.index - b.index)[0] || null;
  }

  function earliest(items) {
    return items.slice().sort((a, b) => a.timeValue - b.timeValue || a.index - b.index)[0] || null;
  }

  function mostAvailable(items) {
    return items
      .filter(item => Number.isFinite(item.seatAvailable))
      .slice()
      .sort((a, b) => b.seatAvailable - a.seatAvailable || a.timeValue - b.timeValue || a.index - b.index)[0] || null;
  }

  function providerMinima(items) {
    return Object.keys(PROVIDER_LABELS)
      .map(provider => cheapest(items, provider))
      .filter(Boolean);
  }

  function renderCinemaOptions(allItems) {
    const options = getCinemaOptions(allItems);
    const allLabel = options.length ? `全部戲院 (${options.length})` : "全部戲院";
    return `
      <option value="all" ${uiState.cinema === "all" ? "selected" : ""}>${escapeHtml(allLabel)}</option>
      ${options.map(option => {
        const providerPrefix = uiState.provider === "all" ? `${option.providerLabel} · ` : "";
        const districtSuffix = option.district && !String(option.canonical).includes(option.district)
          ? ` · ${option.district}`
          : "";
        return `<option value="${escapeHtml(option.key)}" ${uiState.cinema === option.key ? "selected" : ""}>${escapeHtml(`${providerPrefix}${option.canonical}${districtSuffix} · ${option.shows} 場`)}</option>`;
      }).join("")}
    `;
  }

  function renderMetadataControl(items, kind, label) {
    const options = metadataOptions(items, kind);
    if (!options.length) return "";
    return `
      <div class="provider-compare-control-group provider-compare-metadata-control" data-metadata-filter="${escapeHtml(kind)}">
        <span>${escapeHtml(label)}</span>
        <button type="button" data-insight-${escapeHtml(kind)}="all" class="${uiState[kind] === "all" ? "active" : ""}" aria-pressed="${uiState[kind] === "all"}">全部</button>
        ${options.map(option => `
          <button type="button" data-insight-${escapeHtml(kind)}="${escapeHtml(option.key)}" class="${uiState[kind] === option.key ? "active" : ""}" aria-pressed="${uiState[kind] === option.key}">${escapeHtml(option.label)}</button>
        `).join("")}
      </div>
    `;
  }

  function renderSummary(items, allItems) {
    const lowest = cheapest(items);
    const first = earliest(items);
    const seats = mostAvailable(items);
    const minima = providerMinima(items);
    const unknownCount = allItems.filter(item => item.region === "unknown").length;

    let differenceValue = "—";
    let differenceDetail = "目前篩選結果未同時包含兩個以上院線票價";
    if (minima.length >= 2) {
      const sorted = minima.slice().sort((a, b) => a.price - b.price);
      const low = sorted[0];
      const high = sorted[sorted.length - 1];
      const difference = high.price - low.price;
      differenceValue = `$${difference}`;
      differenceDetail = difference === 0
        ? `${minima.length} 個院線最低票價相同`
        : `${low.providerLabel} 最低 $${low.price} · ${high.providerLabel} 最低 $${high.price}`;
    }

    const unknownNote = unknownCount
      ? `另有 ${unknownCount} 場戲院名稱尚未匹配 registry，只會在「全部地區」顯示。`
      : "目前場次的戲院均已匹配 cinema registry。";
    const providerLabel = uiState.provider === "all" ? "全部院線" : PROVIDER_LABELS[uiState.provider] || "全部院線";
    const regionLabel = uiState.region === "hk" ? "港島" : uiState.region === "kln" ? "九龍" : uiState.region === "nt-islands" ? "新界/離島" : "全港";
    const periodLabel = uiState.period === "morning" ? "早場" : uiState.period === "afternoon" ? "下午" : uiState.period === "evening" ? "晚場" : "全日";
    const selectedCinema = uiState.cinema === "all" ? "" : ` · ${selectedCinemaLabel(allItems)}`;
    const metadataSummary = [
      selectedMetadataLabel("language"),
      selectedMetadataLabel("subtitle"),
      selectedMetadataLabel("format")
    ].filter(Boolean);
    const activeFilterSummary = `${providerLabel}${metadataSummary.length ? ` · ${metadataSummary.join(" · ")}` : ""} · ${regionLabel}${selectedCinema} · ${periodLabel}`;

    return `
      <div class="provider-compare-insights" data-provider-insights>
        <div class="provider-compare-insight-grid">
          <article class="provider-compare-insight highlight">
            <span>目前最低票價</span>
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
            <span>目前最多可用座位</span>
            <strong>${seats ? `${escapeHtml(seats.seatAvailable)} 個` : "—"}</strong>
            <small>${seats ? `${escapeHtml(seats.providerLabel)} · ${escapeHtml(seats.time)} · ${escapeHtml(seats.cinema)}` : "只比較目前已取得可靠座位數的場次"}</small>
          </article>
        </div>

        <div class="provider-compare-filter-bar ${activeFilters(allItems).length ? "phase6m-has-active" : ""}">
          <button type="button" class="provider-compare-filter-toggle" data-provider-filter-toggle aria-expanded="${uiState.expanded}">
            <span>篩選</span>
            <strong>${escapeHtml(activeFilterSummary)}</strong>
            <em aria-hidden="true">⌄</em>
          </button>
          <button type="button" class="provider-compare-reset" data-provider-compare-reset aria-label="重設比較篩選">重設</button>
        </div>

        ${renderActiveFilters(allItems)}

        <div class="provider-compare-controls" aria-label="場次篩選及排序" ${uiState.expanded ? "" : "hidden"}>
          <div class="provider-compare-control-group">
            <span>院線</span>
            <button type="button" data-insight-provider="all" class="${uiState.provider === "all" ? "active" : ""}">全部</button>
            <button type="button" data-insight-provider="broadway" class="${uiState.provider === "broadway" ? "active" : ""}">Broadway</button>
            <button type="button" data-insight-provider="mcl" class="${uiState.provider === "mcl" ? "active" : ""}">MCL</button>
            <button type="button" data-insight-provider="emperor" class="${uiState.provider === "emperor" ? "active" : ""}">Emperor</button>
          </div>

          ${renderMetadataControl(allItems, "language", "語言")}
          ${renderMetadataControl(allItems, "subtitle", "字幕")}
          ${renderMetadataControl(allItems, "format", "制式")}

          <div class="provider-compare-control-group">
            <span>地區</span>
            <button type="button" data-insight-region="all" class="${uiState.region === "all" ? "active" : ""}">全部</button>
            <button type="button" data-insight-region="hk" class="${uiState.region === "hk" ? "active" : ""}">港島</button>
            <button type="button" data-insight-region="kln" class="${uiState.region === "kln" ? "active" : ""}">九龍</button>
            <button type="button" data-insight-region="nt-islands" class="${uiState.region === "nt-islands" ? "active" : ""}">新界/離島</button>
          </div>

          <label class="provider-compare-cinema-control">
            <span>戲院</span>
            <select data-insight-cinema aria-label="指定戲院">${renderCinemaOptions(allItems)}</select>
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
          <details class="provider-compare-insight-note">
            <summary>篩選定義</summary>
            <p>語言、字幕及制式只顯示當日實際存在的選項；未能從院線確認的資料會明確標示為未提供。戲院及場次數會跟隨所有條件即時重算。早場為 12:00 前、下午為 12:00–17:59、晚場為 18:00 起。${escapeHtml(unknownNote)}</p>
          </details>
        </div>
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
        const aHas = Number.isFinite(a.seatRatio);
        const bHas = Number.isFinite(b.seatRatio);
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (aHas && bHas) {
          return b.seatRatio - a.seatRatio || b.seatAvailable - a.seatAvailable || a.timeValue - b.timeValue || a.index - b.index;
        }
      }
      return a.timeValue - b.timeValue || a.index - b.index;
    });

    for (const item of ordered) {
      item.card.hidden = !matchesFilters(item);
      timeline.appendChild(item.card);
    }

    const visibleItems = ordered.filter(item => !item.card.hidden);
    const section = timeline.closest(".provider-compare-timeline-section");
    let result = section?.querySelector("[data-insight-result]");
    if (!result && section) {
      result = document.createElement("div");
      result.className = "provider-compare-filter-result";
      result.dataset.insightResult = "true";
      timeline.insertAdjacentElement("beforebegin", result);
    }

    if (result) {
      const providerLabel = uiState.provider === "all" ? "全部院線" : PROVIDER_LABELS[uiState.provider] || "全部院線";
      const regionLabel = uiState.region === "hk" ? "港島" : uiState.region === "kln" ? "九龍" : uiState.region === "nt-islands" ? "新界/離島" : "全部地區";
      const cinemaPart = uiState.cinema === "all" ? "" : ` · ${selectedCinemaLabel(items)}`;
      const metadataPart = [
        selectedMetadataLabel("language"),
        selectedMetadataLabel("subtitle"),
        selectedMetadataLabel("format")
      ].filter(Boolean).map(label => ` · ${label}`).join("");
      const periodLabel = uiState.period === "morning" ? "早場" : uiState.period === "afternoon" ? "下午" : uiState.period === "evening" ? "晚場" : "全日";
      const sortLabel = uiState.sort === "price" ? "價格由低至高" : uiState.sort === "seats" ? "可用比例由高至低" : "時間由早至晚";
      result.textContent = `${providerLabel}${metadataPart} · ${regionLabel}${cinemaPart} · ${periodLabel} · ${visibleItems.length} 場 · ${sortLabel}`;
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
      const cards = Array.from(timeline.querySelectorAll(":scope > .provider-compare-show"));
      const items = cards.map(parseCard);
      ensureMetadataSelections(items);
      ensureCinemaSelection(items);
      section.querySelector("[data-provider-insights]")?.remove();
      section.querySelector("[data-insight-result]")?.remove();
      const visibleItems = items.filter(matchesFilters);
      const heading = section.querySelector(".provider-compare-section-heading");
      if (heading && items.length) heading.insertAdjacentHTML("afterend", renderSummary(visibleItems, items));
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

  function mutationTouchesTimeline(record) {
    const target = record.target?.nodeType === Node.ELEMENT_NODE
      ? record.target
      : record.target?.parentElement;
    if (record.type === "attributes" || record.type === "characterData") {
      return Boolean(target?.closest?.(".provider-compare-show"));
    }
    if (record.type !== "childList") return false;
    if (target?.matches?.(".provider-compare-timeline") || target?.closest?.(".provider-compare-timeline")) {
      return true;
    }
    return [...record.addedNodes, ...record.removedNodes].some(node =>
      node.nodeType === Node.ELEMENT_NODE && (
        node.matches?.(".provider-compare-timeline, .provider-compare-show") ||
        node.querySelector?.(".provider-compare-timeline, .provider-compare-show")
      )
    );
  }

  function installObserver() {
    const content = document.querySelector("#providerCompareContent");
    if (!content) {
      requestAnimationFrame(installObserver);
      return;
    }
    observer = new MutationObserver(records => {
      if (applying || !records.some(mutationTouchesTimeline)) return;
      queueMicrotask(enhance);
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

  window.HKCinemaProviderCompareFilters = {
    setCinema(value) {
      uiState.cinema = String(value || "all");
      enhance();
      return uiState.cinema;
    },
    setFilter(key, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, key) || key === "cinema") return null;
      uiState[key] = String(value || DEFAULT_FILTERS[key]);
      enhance();
      return uiState[key];
    },
    getState() {
      return { ...uiState };
    },
    refresh() {
      enhance();
    }
  };

  document.addEventListener("click", event => {
    const clearButton = event.target.closest("[data-insight-clear-filter]");
    if (clearButton) {
      event.preventDefault();
      event.stopPropagation();
      const key = clearButton.dataset.insightClearFilter;
      if (Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, key)) {
        uiState[key] = DEFAULT_FILTERS[key];
      }
      enhance();
      return;
    }
    const filterToggle = event.target.closest("[data-provider-filter-toggle]");
    if (filterToggle) {
      event.preventDefault();
      event.stopPropagation();
      uiState.expanded = !uiState.expanded;
      enhance();
      return;
    }
    const providerButton = event.target.closest("[data-insight-provider]");
    if (providerButton) {
      event.preventDefault();
      event.stopPropagation();
      uiState.provider = providerButton.dataset.insightProvider || "all";
      enhance();
      return;
    }
    for (const kind of ["language", "subtitle", "format"]) {
      const metadataButton = event.target.closest(`[data-insight-${kind}]`);
      if (!metadataButton) continue;
      event.preventDefault();
      event.stopPropagation();
      uiState[kind] = metadataButton.dataset[`insight${kind[0].toUpperCase()}${kind.slice(1)}`] || "all";
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
    window.HKCinemaProviderCompareFilters.setCinema(cinemaSelect.value || "all");
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installObserver, { once: true });
  } else {
    installObserver();
  }
})();
