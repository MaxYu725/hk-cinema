(() => {
  const PROVIDER_LABELS = { broadway: "Broadway", mcl: "MCL", emperor: "Emperor" };
  const PROVIDER_ORDER = { broadway: 0, mcl: 1, emperor: 2 };
  const DEFAULT_FILTERS = Object.freeze({
    provider: "all",
    language: "all",
    subtitle: "all",
    format: "all",
    region: "all",
    district: "all",
    cinema: "all",
    period: "all",
    price: "all",
    seats: "all",
    sort: "time"
  });
  const FILTER_LABELS = Object.freeze({
    region: { hk: "港島", kln: "九龍", "nt-islands": "新界/離島" },
    period: { morning: "早場", afternoon: "下午", evening: "晚場", next2h: "未來 2 小時" },
    seats: { known: "有可靠座位數", available: "仍有座位", roomy: "座位較充裕" },
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
    format: "放映方式未提供"
  });

  const uiState = { ...DEFAULT_FILTERS, expanded: false };
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
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function metadataCore() {
    return window.HKCinemaShowtimeMetadata || null;
  }

  function metadataValues(card, key) {
    return String(card?.dataset?.[key] || "unknown").split(",").map(value => value.trim()).filter(Boolean);
  }

  function metadataLabel(kind, key) {
    if (key === "unknown") return METADATA_UNKNOWN_LABELS[kind] || "未提供";
    return metadataCore()?.labels?.[kind]?.[key] || key;
  }

  function parseSeats(card) {
    const available = Number(card?.dataset?.seatAvailable);
    const total = Number(card?.dataset?.seatTotal);
    if (Number.isFinite(available) && Number.isFinite(total) && total > 0 && available >= 0 && available <= total) {
      return { available, total, ratio: available / total };
    }
    const text = card.querySelector(".provider-compare-seat")?.textContent?.trim() || "";
    const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*(?:個)?(?:可選|未售)/);
    if (!match) return null;
    const parsedAvailable = Number(match[1]);
    const parsedTotal = Number(match[2]);
    if (!Number.isFinite(parsedAvailable) || !Number.isFinite(parsedTotal) || parsedTotal <= 0 || parsedAvailable < 0 || parsedAvailable > parsedTotal) return null;
    return { available: parsedAvailable, total: parsedTotal, ratio: parsedAvailable / parsedTotal };
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
    const cinemaMeta = registry?.resolve?.(provider, cinema) || { canonical: cinema, region: "unknown", district: null };
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

  function hongKongNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      date: `${value.year}-${value.month}-${value.day}`,
      minutes: Number(value.hour) * 60 + Number(value.minute)
    };
  }

  function selectedDate() {
    return window.HKCinemaProviderCompare?.getState?.()?.selectedDate || null;
  }

  function next2hAvailable() {
    return selectedDate() === hongKongNow().date;
  }

  function matchesPeriod(item) {
    if (!Number.isFinite(item.timeValue)) return false;
    if (uiState.period === "morning") return item.timeValue < 12 * 60;
    if (uiState.period === "afternoon") return item.timeValue >= 12 * 60 && item.timeValue < 18 * 60;
    if (uiState.period === "evening") return item.timeValue >= 18 * 60;
    if (uiState.period === "next2h") {
      if (!next2hAvailable()) return false;
      const now = hongKongNow().minutes;
      return item.timeValue >= now && item.timeValue <= now + 120;
    }
    return true;
  }

  function priceLimit() {
    const match = String(uiState.price || "").match(/^lte-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function matchesPrice(item) {
    const limit = priceLimit();
    if (!Number.isFinite(limit)) return true;
    return Number.isFinite(item.price) && item.price <= limit;
  }

  function matchesSeats(item) {
    if (uiState.seats === "known") return Boolean(item.seats);
    if (uiState.seats === "available") return Boolean(item.seats && item.seats.available > 0);
    if (uiState.seats === "roomy") return Boolean(item.seats && item.seats.available > 0 && item.seats.ratio >= 0.5);
    return true;
  }

  function matchesFilters(item, ignore = new Set()) {
    return (
      (ignore.has("provider") || uiState.provider === "all" || item.provider === uiState.provider) &&
      (ignore.has("language") || uiState.language === "all" || item.languages.includes(uiState.language)) &&
      (ignore.has("subtitle") || uiState.subtitle === "all" || item.subtitles.includes(uiState.subtitle)) &&
      (ignore.has("format") || uiState.format === "all" || item.formats.includes(uiState.format)) &&
      (ignore.has("region") || uiState.region === "all" || item.region === uiState.region) &&
      (ignore.has("district") || uiState.district === "all" || item.district === uiState.district) &&
      (ignore.has("cinema") || uiState.cinema === "all" || item.cinemaKey === uiState.cinema) &&
      (ignore.has("period") || matchesPeriod(item)) &&
      (ignore.has("price") || matchesPrice(item)) &&
      (ignore.has("seats") || matchesSeats(item))
    );
  }

  function metadataOptions(items, kind) {
    const field = kind === "language" ? "languages" : kind === "subtitle" ? "subtitles" : "formats";
    const keys = Array.from(new Set(items.flatMap(item => item[field] || [])));
    const order = METADATA_ORDER[kind] || [];
    return keys.map(key => ({ key, label: metadataLabel(kind, key) })).sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.label.localeCompare(b.label, "zh-HK");
    });
  }

  function ensureMetadataSelections(items) {
    for (const kind of ["language", "subtitle", "format"]) {
      if (uiState[kind] === "all") continue;
      if (!metadataOptions(items, kind).some(option => option.key === uiState[kind])) uiState[kind] = "all";
    }
  }

  function districtOptions(items) {
    const scoped = items.filter(item => matchesFilters(item, new Set(["district", "cinema", "period", "price", "seats"])));
    return Array.from(new Set(scoped.map(item => item.district).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-HK"));
  }

  function ensureDistrictSelection(items) {
    if (uiState.district === "all") return;
    if (!districtOptions(items).includes(uiState.district)) {
      uiState.district = "all";
      uiState.cinema = "all";
    }
  }

  function priceOptions(items) {
    const prices = items.map(item => item.price).filter(Number.isFinite);
    if (!prices.length) return [];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const standard = [100, 120, 150, 200].filter(limit => min <= limit && max > limit);
    if (standard.length) return standard;
    if (max <= min) return [];
    const midpoint = Math.ceil(((min + max) / 2) / 10) * 10;
    return midpoint > min && midpoint < max ? [midpoint] : [];
  }

  function ensurePriceSelection(items) {
    if (uiState.price === "all") return;
    const limit = priceLimit();
    if (!Number.isFinite(limit) || !items.some(item => Number.isFinite(item.price))) uiState.price = "all";
  }

  function ensureSeatSelection(items) {
    if (uiState.seats === "all") return;
    if (!items.some(item => item.seats)) uiState.seats = "all";
  }

  function getCinemaOptions(items) {
    const map = new Map();
    for (const item of items) {
      if (!matchesFilters(item, new Set(["cinema"]))) continue;
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
    return Array.from(map.values()).sort((a, b) =>
      (PROVIDER_ORDER[a.provider] ?? 99) - (PROVIDER_ORDER[b.provider] ?? 99) ||
      a.canonical.localeCompare(b.canonical, "zh-HK", { numeric: true, sensitivity: "base" })
    );
  }

  function ensureCinemaSelection(items) {
    if (uiState.cinema === "all") return;
    if (!getCinemaOptions(items).some(option => option.key === uiState.cinema)) uiState.cinema = "all";
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
    if (uiState.provider !== "all") filters.push({ key: "provider", label: PROVIDER_LABELS[uiState.provider] || uiState.provider });
    for (const kind of ["language", "subtitle", "format"]) {
      if (uiState[kind] !== "all") filters.push({ key: kind, label: selectedMetadataLabel(kind) });
    }
    if (uiState.region !== "all") filters.push({ key: "region", label: FILTER_LABELS.region[uiState.region] || uiState.region });
    if (uiState.district !== "all") filters.push({ key: "district", label: uiState.district });
    if (uiState.cinema !== "all") filters.push({ key: "cinema", label: selectedCinemaLabel(items) });
    if (uiState.period !== "all") filters.push({ key: "period", label: FILTER_LABELS.period[uiState.period] || uiState.period });
    if (uiState.price !== "all") filters.push({ key: "price", label: `$${priceLimit()} 或以下` });
    if (uiState.seats !== "all") filters.push({ key: "seats", label: FILTER_LABELS.seats[uiState.seats] || uiState.seats });
    if (uiState.sort !== "time") filters.push({ key: "sort", label: FILTER_LABELS.sort[uiState.sort] || uiState.sort });
    return filters;
  }

  function activeFilterSummary(items) {
    const filters = activeFilters(items).filter(filter => filter.key !== "sort");
    return filters.length ? filters.map(filter => filter.label).join(" · ") : "全部院線 · 全部版本 · 全港 · 全日";
  }

  function renderActiveFilters(items) {
    const filters = activeFilters(items);
    if (!filters.length) return "";
    return `
      <div class="phase6m-active-filters phase8c-active-filters" data-phase6m-active-filters aria-label="目前生效的比較條件">
        <span class="phase6m-active-filter-count">${filters.length} 個條件</span>
        <div class="phase6m-active-filter-chips">
          ${filters.map(filter => `<button type="button" class="phase6m-filter-chip" data-insight-clear-filter="${escapeHtml(filter.key)}" aria-label="清除${escapeHtml(filter.label)}篩選">${escapeHtml(filter.label)} ×</button>`).join("")}
        </div>
      </div>
    `;
  }

  function renderMetadataControl(items, kind, label) {
    const options = metadataOptions(items, kind);
    if (!options.length) return "";
    return `
      <div class="provider-compare-control-group provider-compare-metadata-control" data-metadata-filter="${escapeHtml(kind)}">
        <span>${escapeHtml(label)}</span>
        <button type="button" data-insight-${escapeHtml(kind)}="all" class="${uiState[kind] === "all" ? "active" : ""}" aria-pressed="${uiState[kind] === "all"}">全部</button>
        ${options.map(option => `<button type="button" data-insight-${escapeHtml(kind)}="${escapeHtml(option.key)}" class="${uiState[kind] === option.key ? "active" : ""}" aria-pressed="${uiState[kind] === option.key}">${escapeHtml(option.label)}</button>`).join("")}
      </div>
    `;
  }

  function renderCinemaOptions(items) {
    const options = getCinemaOptions(items);
    return `
      <option value="all" ${uiState.cinema === "all" ? "selected" : ""}>${escapeHtml(options.length ? `全部戲院 (${options.length})` : "全部戲院")}</option>
      ${options.map(option => {
        const prefix = uiState.provider === "all" ? `${option.providerLabel} · ` : "";
        const district = option.district && !String(option.canonical).includes(option.district) ? ` · ${option.district}` : "";
        return `<option value="${escapeHtml(option.key)}" ${uiState.cinema === option.key ? "selected" : ""}>${escapeHtml(`${prefix}${option.canonical}${district} · ${option.shows} 場`)}</option>`;
      }).join("")}
    `;
  }

  function renderControls(items) {
    const districts = districtOptions(items);
    const prices = priceOptions(items);
    const hasSeats = items.some(item => item.seats);
    return `
      <div class="provider-compare-controls phase8c-controls" aria-label="場次篩選及排序" ${uiState.expanded ? "" : "hidden"}>
        <div class="provider-compare-control-group">
          <span>院線</span>
          <button type="button" data-insight-provider="all" class="${uiState.provider === "all" ? "active" : ""}">全部</button>
          <button type="button" data-insight-provider="broadway" class="${uiState.provider === "broadway" ? "active" : ""}">Broadway</button>
          <button type="button" data-insight-provider="mcl" class="${uiState.provider === "mcl" ? "active" : ""}">MCL</button>
          <button type="button" data-insight-provider="emperor" class="${uiState.provider === "emperor" ? "active" : ""}">Emperor</button>
        </div>

        ${renderMetadataControl(items, "language", "語言")}
        ${renderMetadataControl(items, "subtitle", "字幕")}
        ${renderMetadataControl(items, "format", "放映方式")}

        <div class="provider-compare-control-group">
          <span>地區</span>
          <button type="button" data-insight-region="all" class="${uiState.region === "all" ? "active" : ""}">全部</button>
          <button type="button" data-insight-region="hk" class="${uiState.region === "hk" ? "active" : ""}">港島</button>
          <button type="button" data-insight-region="kln" class="${uiState.region === "kln" ? "active" : ""}">九龍</button>
          <button type="button" data-insight-region="nt-islands" class="${uiState.region === "nt-islands" ? "active" : ""}">新界/離島</button>
        </div>

        ${districts.length ? `
          <div class="provider-compare-control-group phase8c-district-control">
            <span>分區</span>
            <button type="button" data-insight-district="all" class="${uiState.district === "all" ? "active" : ""}">全部</button>
            ${districts.map(district => `<button type="button" data-insight-district="${escapeHtml(district)}" class="${uiState.district === district ? "active" : ""}">${escapeHtml(district)}</button>`).join("")}
          </div>
        ` : ""}

        <label class="provider-compare-cinema-control">
          <span>戲院</span>
          <select data-insight-cinema aria-label="指定戲院">${renderCinemaOptions(items)}</select>
        </label>

        <div class="provider-compare-control-group">
          <span>時段</span>
          <button type="button" data-insight-period="all" class="${uiState.period === "all" ? "active" : ""}">全日</button>
          ${next2hAvailable() ? `<button type="button" data-insight-period="next2h" class="${uiState.period === "next2h" ? "active" : ""}">未來 2 小時</button>` : ""}
          <button type="button" data-insight-period="morning" class="${uiState.period === "morning" ? "active" : ""}">早場</button>
          <button type="button" data-insight-period="afternoon" class="${uiState.period === "afternoon" ? "active" : ""}">下午</button>
          <button type="button" data-insight-period="evening" class="${uiState.period === "evening" ? "active" : ""}">晚場</button>
        </div>

        ${prices.length ? `
          <div class="provider-compare-control-group phase8c-price-control">
            <span>價格</span>
            <button type="button" data-insight-price="all" class="${uiState.price === "all" ? "active" : ""}">不限</button>
            ${prices.map(limit => `<button type="button" data-insight-price="lte-${limit}" class="${uiState.price === `lte-${limit}` ? "active" : ""}">≤ $${limit}</button>`).join("")}
          </div>
        ` : ""}

        ${hasSeats ? `
          <div class="provider-compare-control-group phase8c-seat-control">
            <span>座位</span>
            <button type="button" data-insight-seats="all" class="${uiState.seats === "all" ? "active" : ""}">全部</button>
            <button type="button" data-insight-seats="available" class="${uiState.seats === "available" ? "active" : ""}">仍有座位</button>
            <button type="button" data-insight-seats="roomy" class="${uiState.seats === "roomy" ? "active" : ""}">較充裕</button>
            <button type="button" data-insight-seats="known" class="${uiState.seats === "known" ? "active" : ""}">可靠座位數</button>
          </div>
        ` : ""}

        <div class="provider-compare-control-group">
          <span>排序</span>
          <button type="button" data-insight-sort="time" class="${uiState.sort === "time" ? "active" : ""}">時間</button>
          <button type="button" data-insight-sort="price" class="${uiState.sort === "price" ? "active" : ""}">價格</button>
          <button type="button" data-insight-sort="seats" class="${uiState.sort === "seats" ? "active" : ""}">座位</button>
        </div>

        <details class="provider-compare-insight-note">
          <summary>篩選定義</summary>
          <p>語言、字幕及放映方式由合併後的實際場次動態產生；「座位較充裕」只使用已取得可靠總座位數、且目前可用比例至少 50% 的場次。未知資料不會推測。</p>
        </details>
      </div>
    `;
  }

  function renderFilterPanel(items) {
    const filters = activeFilters(items);
    return `
      <div class="provider-compare-insights phase8c-insights" data-provider-insights>
        <div class="provider-compare-filter-bar ${filters.length ? "phase6m-has-active" : ""}">
          <button type="button" class="provider-compare-filter-toggle" data-provider-filter-toggle aria-expanded="${uiState.expanded}">
            <span>篩選</span>
            <strong>${escapeHtml(activeFilterSummary(items))}</strong>
            <em aria-hidden="true">⌄</em>
          </button>
          <button type="button" class="provider-compare-reset" data-provider-compare-reset aria-label="重設比較篩選">重設</button>
        </div>
        ${renderActiveFilters(items)}
        ${renderControls(items)}
      </div>
    `;
  }

  function applyFilterAndSort(timeline, items) {
    const ordered = items.slice().sort((a, b) => {
      if (uiState.sort === "price") {
        const ap = Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
        const bp = Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
        return ap - bp || a.timeValue - b.timeValue || a.index - b.index;
      }
      if (uiState.sort === "seats") {
        const ah = Number.isFinite(a.seatRatio);
        const bh = Number.isFinite(b.seatRatio);
        if (ah !== bh) return ah ? -1 : 1;
        if (ah && bh) return b.seatRatio - a.seatRatio || b.seatAvailable - a.seatAvailable || a.timeValue - b.timeValue || a.index - b.index;
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
      const sortLabel = uiState.sort === "price" ? "價格由低至高" : uiState.sort === "seats" ? "可用比例由高至低" : "時間由早至晚";
      result.textContent = `${activeFilterSummary(items)} · ${visibleItems.length} 場 · ${sortLabel}`;
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
      ensureDistrictSelection(items);
      ensurePriceSelection(items);
      ensureSeatSelection(items);
      ensureCinemaSelection(items);
      if (uiState.period === "next2h" && !next2hAvailable()) uiState.period = "all";
      section.querySelector("[data-provider-insights]")?.remove();
      section.querySelector("[data-insight-result]")?.remove();
      const heading = section.querySelector(".provider-compare-section-heading");
      if (heading && items.length) heading.insertAdjacentHTML("afterend", renderFilterPanel(items));
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
    const target = record.target?.nodeType === Node.ELEMENT_NODE ? record.target : record.target?.parentElement;
    if (record.type === "attributes" || record.type === "characterData") return Boolean(target?.closest?.(".provider-compare-show"));
    if (record.type !== "childList") return false;
    if (target?.matches?.(".provider-compare-timeline") || target?.closest?.(".provider-compare-timeline")) return true;
    return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (
      node.matches?.(".provider-compare-timeline, .provider-compare-show") || node.querySelector?.(".provider-compare-timeline, .provider-compare-show")
    ));
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

  function clearFilter(key) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, key)) return;
    uiState[key] = DEFAULT_FILTERS[key];
    if (["provider", "language", "subtitle", "format", "region", "district", "period", "price", "seats"].includes(key)) uiState.cinema = "all";
  }

  window.HKCinemaProviderCompareFilters = {
    version: "8c1",
    setCinema(value) {
      uiState.cinema = String(value || "all");
      enhance();
      return uiState.cinema;
    },
    setFilter(key, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, key) || key === "cinema") return null;
      uiState[key] = String(value || DEFAULT_FILTERS[key]);
      if (["provider", "language", "subtitle", "format", "region", "district", "period", "price", "seats"].includes(key)) uiState.cinema = "all";
      enhance();
      return uiState[key];
    },
    reset() {
      Object.assign(uiState, DEFAULT_FILTERS);
      enhance();
    },
    getState() { return { ...uiState }; },
    refresh() { enhance(); }
  };

  document.addEventListener("click", event => {
    const clearButton = event.target.closest("[data-insight-clear-filter]");
    if (clearButton) {
      event.preventDefault();
      event.stopPropagation();
      clearFilter(clearButton.dataset.insightClearFilter);
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

    const mappings = [
      ["provider", "insightProvider"],
      ["language", "insightLanguage"],
      ["subtitle", "insightSubtitle"],
      ["format", "insightFormat"],
      ["region", "insightRegion"],
      ["district", "insightDistrict"],
      ["period", "insightPeriod"],
      ["price", "insightPrice"],
      ["seats", "insightSeats"],
      ["sort", "insightSort"]
    ];
    for (const [kind, datasetKey] of mappings) {
      const button = event.target.closest(`[data-insight-${kind}]`);
      if (!button) continue;
      event.preventDefault();
      event.stopPropagation();
      uiState[kind] = button.dataset[datasetKey] || DEFAULT_FILTERS[kind];
      if (["provider", "language", "subtitle", "format", "region", "district", "period", "price", "seats"].includes(kind)) uiState.cinema = "all";
      enhance();
      return;
    }
  }, true);

  document.addEventListener("change", event => {
    const cinemaSelect = event.target.closest("[data-insight-cinema]");
    if (!cinemaSelect) return;
    event.stopPropagation();
    window.HKCinemaProviderCompareFilters.setCinema(cinemaSelect.value || "all");
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installObserver, { once: true });
  else installObserver();
})();