(() => {
  let mclCatalogue = window.HKCinemaMCLCatalogue || null;
  let emperorCatalogue = window.HKCinemaEmperorCatalogue || null;

  const grid = document.querySelector("#movieGrid");
  const count = document.querySelector("#movieCount");
  const FILTER_STORAGE_KEY = "hkcinema:home-provider-filter:v1";
  const PROVIDER_OPTIONS = [
    { key: "broadway", label: "Broadway" },
    { key: "mcl", label: "MCL" },
    { key: "emperor", label: "Emperor" }
  ];

  if (!grid || !count) return;

  const matchRecords = new Map();
  const groupRecords = new Map();
  let lastCountMeta = { total: 0, matched: 0, tripleMatched: 0 };

  function loadProviderFilters() {
    try {
      const stored = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "[]");
      const values = Array.isArray(stored)
        ? stored.filter(value => PROVIDER_OPTIONS.some(provider => provider.key === value))
        : [];
      return new Set(values.length === PROVIDER_OPTIONS.length ? [] : values);
    } catch {
      return new Set();
    }
  }

  const selectedProviders = loadProviderFilters();

  window.HKCinemaProviderMatches = {
    get(id) {
      return matchRecords.get(String(id)) || null;
    },
    all() {
      return Array.from(matchRecords.values());
    }
  };

  window.HKCinemaMovieGroups = {
    get(id) {
      return groupRecords.get(String(id)) || null;
    },
    all() {
      return Array.from(groupRecords.values());
    }
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeTitle(value) {
    return window.HKCinemaHomeDiscoveryCore.normalizeTitle(value);
  }

  function parseVariantTitle(value) {
    return window.HKCinemaHomeDiscoveryCore.parseVariantTitle(value);
  }

  function variantSignature(value) {
    return window.HKCinemaHomeDiscoveryCore.variantSignature(value);
  }

  function getActiveTab() {
    return document.querySelector(".tab.active")?.dataset.tab || "now";
  }

  function getMCLMovies() {
    if (!mclCatalogue) return [];
    return getActiveTab() === "coming"
      ? mclCatalogue.coming || []
      : mclCatalogue.now || [];
  }

  function getEmperorMovies() {
    if (!emperorCatalogue) return [];
    return getActiveTab() === "coming"
      ? emperorCatalogue.coming || []
      : emperorCatalogue.now || [];
  }

  function findMCLMovie(sourceId) {
    if (!mclCatalogue) return null;
    return [
      ...(mclCatalogue.now || []),
      ...(mclCatalogue.coming || []),
      ...(mclCatalogue.festival || [])
    ].find(movie => String(movie.sourceId) === String(sourceId)) || null;
  }

  function findEmperorMovie(sourceId) {
    if (!emperorCatalogue) return null;
    return [
      ...(emperorCatalogue.now || []),
      ...(emperorCatalogue.coming || [])
    ].find(movie => String(movie.sourceId) === String(sourceId)) || null;
  }

  function providerBadges(labels, options = {}) {
    const {
      mclSourceId = null,
      emperorSourceId = null,
      matchId = null
    } = options;

    const compareLabel = labels.length >= 3
      ? "比較 Broadway、MCL 與 Emperor 場次及票價"
      : `比較 ${labels.join(" 與 ")} 場次及票價`;

    return `
      <div class="provider-badges" data-multi-provider="true">
        ${labels.map(label => {
          const key = label.toLowerCase();
          let attrs = "";

          if (label === "MCL" && mclSourceId) {
            attrs = ` data-mcl-open="${escapeHtml(mclSourceId)}" title="查看 MCL 場次"`;
          } else if (label === "Emperor" && emperorSourceId) {
            attrs = ` data-emperor-open="${escapeHtml(emperorSourceId)}" title="查看 Emperor 場次"`;
          }

          return `<span class="provider-badge provider-${key}"${attrs}>${escapeHtml(label)}</span>`;
        }).join("")}
        ${matchId
          ? `<button type="button" class="provider-compare" data-compare-open="${escapeHtml(matchId)}" aria-label="${escapeHtml(compareLabel)}">比較</button>`
          : ""}
      </div>
    `;
  }

  function ensureProviderFilters() {
    let filters = document.querySelector("#homeProviderFilters");
    if (filters) return filters;
    const heading = document.querySelector(".section-heading");
    if (!heading) return null;

    filters = document.createElement("section");
    filters.id = "homeProviderFilters";
    filters.className = "home-provider-filters";
    filters.setAttribute("aria-label", "院線篩選");
    filters.innerHTML = `
      <div class="home-provider-filter-heading">
        <strong>院線</strong>
        <span data-home-filter-result>全部院線</span>
      </div>
      <div class="home-provider-filter-options" role="group" aria-label="選擇院線">
        <button type="button" data-home-provider="all" aria-pressed="true">
          全部 <span data-provider-count="all">0</span>
        </button>
        ${PROVIDER_OPTIONS.map(provider => `
          <button type="button" data-home-provider="${provider.key}" aria-pressed="false">
            ${provider.label} <span data-provider-count="${provider.key}">0</span>
          </button>
        `).join("")}
      </div>
    `;
    heading.insertAdjacentElement("afterend", filters);
    return filters;
  }

  function saveProviderFilters() {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(Array.from(selectedProviders)));
    } catch {
      // Storage can be unavailable in restricted/private contexts.
    }
  }

  function setCardProviders(card, labels) {
    const keys = labels
      .map(label => String(label || "").toLowerCase())
      .filter(key => PROVIDER_OPTIONS.some(provider => provider.key === key));
    card.dataset.providers = Array.from(new Set(keys)).join(",");
  }

  function applyProviderFilters() {
    const filters = ensureProviderFilters();
    const cards = Array.from(grid.querySelectorAll(".movie-card:not(.movie-group-member)"));
    const allSelected = selectedProviders.size === 0;
    let visible = 0;

    for (const card of cards) {
      const providers = new Set(String(card.dataset.providers || "").split(",").filter(Boolean));
      const matches = window.HKCinemaHomeDiscoveryCore.filterMatches(providers, selectedProviders);
      card.hidden = !matches;
      if (matches) visible++;
    }

    const providerCounts = Object.fromEntries(PROVIDER_OPTIONS.map(provider => [
      provider.key,
      cards.filter(card => String(card.dataset.providers || "").split(",").includes(provider.key)).length
    ]));

    filters?.querySelectorAll("[data-home-provider]").forEach(button => {
      const key = button.dataset.homeProvider;
      const active = key === "all" ? allSelected : selectedProviders.has(key);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    filters?.querySelector("[data-provider-count='all']")?.replaceChildren(String(cards.length));
    for (const provider of PROVIDER_OPTIONS) {
      filters?.querySelector(`[data-provider-count='${provider.key}']`)?.replaceChildren(String(providerCounts[provider.key]));
    }

    const result = filters?.querySelector("[data-home-filter-result]");
    if (result) {
      result.textContent = allSelected
        ? `全部院線 · ${visible} 部`
        : `${Array.from(selectedProviders).map(key => PROVIDER_OPTIONS.find(provider => provider.key === key)?.label).filter(Boolean).join(" + ")} · ${visible} 部`;
    }

    count.textContent = `${visible} 部`;
    count.title = `合併版本後 ${cards.length} 部 · 跨院線配對 ${lastCountMeta.matched} 部 · 三院線配對 ${lastCountMeta.tripleMatched} 部`;

    let empty = document.querySelector("#homeProviderFilterEmpty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "homeProviderFilterEmpty";
      empty.className = "empty-state home-provider-filter-empty";
      empty.innerHTML = "<strong>這個院線組合暫時沒有電影</strong><span>可選擇其他院線，或切換上映分類。</span>";
      grid.insertAdjacentElement("afterend", empty);
    }
    empty.hidden = visible > 0;
  }

  function toggleProviderFilter(provider) {
    if (provider === "all") {
      selectedProviders.clear();
    } else if (selectedProviders.size === 0) {
      selectedProviders.add(provider);
    } else if (selectedProviders.has(provider)) {
      selectedProviders.delete(provider);
    } else {
      selectedProviders.add(provider);
    }

    if (selectedProviders.size === 0 || selectedProviders.size === PROVIDER_OPTIONS.length) {
      selectedProviders.clear();
    }
    saveProviderFilters();
    applyProviderFilters();
  }

  function movieTitle(movie) {
    return movie?.title?.zh || movie?.title?.en || "未命名電影";
  }

  function renderProviderOnlyCard(movie, provider) {
    const title = movieTitle(movie);
    const isMCL = provider === "mcl";
    const label = isMCL ? "MCL" : "Emperor";
    const providerClass = isMCL ? "mcl-only-card" : "emperor-only-card";
    const openAttr = isMCL
      ? `data-mcl-open="${escapeHtml(movie.sourceId)}"`
      : `data-emperor-open="${escapeHtml(movie.sourceId)}"`;
    const poster = movie.poster
      ? `
        <img
          src="${escapeHtml(movie.poster)}"
          alt="${escapeHtml(title)}"
          loading="lazy"
          onerror="this.style.display='none';this.parentElement.classList.add('poster-error');"
        >
      `
      : "";
    const upcomingBadge = getActiveTab() === "coming"
      ? `
        <div class="movie-badges">
          <span class="movie-badge coming">${label} 即將上映</span>
        </div>
      `
      : "";

    return `
      <article
        class="movie-card ${providerClass}"
        data-provider="${provider}"
        data-source-id="${escapeHtml(movie.sourceId)}"
        data-booking-url="${escapeHtml(movie.bookingUrl || "")}"
        ${openAttr}
        role="button"
        tabindex="0"
        aria-label="查看 ${label} ${escapeHtml(title)} 詳情及場次"
      >
        <div class="movie-poster">
          ${poster}
          ${upcomingBadge}
          <div class="poster-placeholder">${label}</div>
        </div>
        <div class="movie-info">
          <h3>${escapeHtml(title)}</h3>
          ${providerBadges([label], {
            mclSourceId: isMCL ? movie.sourceId : null,
            emperorSourceId: isMCL ? null : movie.sourceId
          })}
        </div>
      </article>
    `;
  }

  function cardProviderData(card) {
    const isMCLOnly = card.classList.contains("mcl-only-card");
    const isEmperorOnly = card.classList.contains("emperor-only-card");

    const broadwaySourceId = !isMCLOnly && !isEmperorOnly
      ? String(card.dataset.sourceId || "").trim()
      : "";
    const mclSourceId = String(
      card.dataset.mclSourceId ||
      (isMCLOnly ? card.dataset.sourceId : "") ||
      ""
    ).trim();
    const emperorSourceId = String(
      card.dataset.emperorSourceId ||
      (isEmperorOnly ? card.dataset.sourceId : "") ||
      ""
    ).trim();

    return {
      broadwaySourceId,
      mclSourceId,
      emperorSourceId
    };
  }

  function cardProviders(card) {
    const data = cardProviderData(card);
    const labels = [];
    if (data.broadwaySourceId) labels.push("Broadway");
    if (data.mclSourceId) labels.push("MCL");
    if (data.emperorSourceId) labels.push("Emperor");
    return labels;
  }

  function buildMatchRecord(card) {
    const data = cardProviderData(card);
    const components = [];

    if (data.broadwaySourceId) {
      components.push(`broadway:${data.broadwaySourceId}`);
    }
    if (data.mclSourceId) {
      components.push(`mcl:${data.mclSourceId}`);
    }
    if (data.emperorSourceId) {
      components.push(`emperor:${data.emperorSourceId}`);
    }

    if (components.length < 2) {
      delete card.dataset.providerMatchId;
      return null;
    }

    const title = card.querySelector("h3")?.textContent?.trim() || "未命名電影";
    const matchId = components.join("|");
    const record = {
      id: matchId,
      title,
      normalizedTitle: normalizeTitle(title),
      matchType: "exact-title",
      confidence: 1,
      broadway: data.broadwaySourceId
        ? {
            provider: "broadway",
            sourceId: data.broadwaySourceId,
            movieId: card.dataset.movieId || null,
            poster: card.querySelector(".movie-poster img")?.src || null
          }
        : null,
      mcl: data.mclSourceId
        ? {
            provider: "mcl",
            sourceId: data.mclSourceId,
            movie: findMCLMovie(data.mclSourceId)
          }
        : null,
      emperor: data.emperorSourceId
        ? {
            provider: "emperor",
            sourceId: data.emperorSourceId,
            movie: findEmperorMovie(data.emperorSourceId)
          }
        : null
    };

    matchRecords.set(matchId, record);
    card.dataset.providerMatchId = matchId;
    return record;
  }

  function refreshCardBadges(card) {
    const info = card.querySelector(".movie-info");
    if (!info) return;

    info.querySelector(".provider-badges[data-multi-provider]")?.remove();
    const labels = cardProviders(card);
    const data = cardProviderData(card);
    const matchId = card.dataset.providerMatchId || null;

    info.insertAdjacentHTML("beforeend", providerBadges(labels, {
      mclSourceId: data.mclSourceId || null,
      emperorSourceId: data.emperorSourceId || null,
      matchId
    }));
  }

  function openMCL(sourceId) {
    const movie = findMCLMovie(sourceId);
    if (!movie) return false;
    const detail = window.HKCinemaMCLDetail;
    if (detail?.open) return detail.open(movie) !== false;
    window.dispatchEvent(new CustomEvent("hkcinema:mcl-open", { detail: { movie } }));
    return true;
  }

  function openEmperor(sourceId) {
    const movie = findEmperorMovie(sourceId);
    if (!movie) return false;

    if (window.HKCinemaEmperorDetail?.open) {
      return window.HKCinemaEmperorDetail.open(movie) !== false;
    }

    const url = movie.bookingUrl || "https://www.emperorcinemas.com/showtimes";
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  function ensureMovieGroupOverlay() {
    let overlay = document.querySelector("#movieGroupOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "movieGroupOverlay";
    overlay.className = "movie-group-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="movie-group-backdrop" data-movie-group-close></div>
      <aside class="movie-group-sheet" role="dialog" aria-modal="true" aria-label="選擇電影版本">
        <button type="button" class="movie-group-close" data-movie-group-close aria-label="關閉版本選單">×</button>
        <div id="movieGroupContent"></div>
      </aside>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeMovieGroup() {
    const overlay = document.querySelector("#movieGroupOverlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("movie-group-open");
  }

  function variantActionButton(provider, variant) {
    const sourceId = variant[`${provider.key}SourceId`];
    if (!sourceId) return "";
    return `
      <button
        type="button"
        class="movie-group-provider-action provider-${provider.key}"
        data-movie-group-provider="${provider.key}"
        data-source-id="${escapeHtml(sourceId)}"
      >
        ${escapeHtml(provider.label)}
      </button>
    `;
  }

  function openMovieGroup(groupId) {
    const group = groupRecords.get(String(groupId));
    if (!group) return false;
    const overlay = ensureMovieGroupOverlay();
    const content = overlay.querySelector("#movieGroupContent");
    content.innerHTML = `
      <div class="movie-group-heading">
        <p class="eyebrow">VERSIONS</p>
        <h1>${escapeHtml(group.title)}</h1>
        <p>已將語言、放映制式及特別場版本集中顯示；請選擇要查看的版本與院線。</p>
      </div>
      <div class="movie-group-variants">
        ${group.variants.map((variant, index) => `
          <section class="movie-group-variant">
            <div class="movie-group-variant-title">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>${escapeHtml(variant.title)}</strong>
                ${variant.tags.length
                  ? `<small>${variant.tags.map(tag => escapeHtml(tag)).join(" · ")}</small>`
                  : "<small>一般版本</small>"}
              </div>
            </div>
            <div class="movie-group-variant-actions">
              ${PROVIDER_OPTIONS.map(provider => variantActionButton(provider, variant)).join("")}
              ${variant.matchId
                ? `<button type="button" class="movie-group-compare-action" data-movie-group-compare="${escapeHtml(variant.matchId)}">比較院線</button>`
                : ""}
            </div>
          </section>
        `).join("")}
      </div>
    `;
    overlay.hidden = false;
    document.body.classList.add("movie-group-open");
    overlay.querySelector(".movie-group-close")?.focus();
    return true;
  }

  function resetVariantGrouping() {
    for (const card of grid.querySelectorAll(".movie-card")) {
      const heading = card.querySelector(".movie-info h3");
      const english = card.querySelector(".movie-title-en");
      if (heading && card.dataset.originalGroupTitle) heading.textContent = card.dataset.originalGroupTitle;
      if (english && card.dataset.originalGroupEnglish) english.textContent = card.dataset.originalGroupEnglish;
      delete card.dataset.originalGroupTitle;
      delete card.dataset.originalGroupEnglish;
      delete card.dataset.movieGroupId;
      delete card.dataset.groupMemberOf;
      card.classList.remove("movie-group-card", "movie-group-member");
      card.querySelector(".movie-variant-summary")?.remove();
      card.hidden = false;
    }
    groupRecords.clear();
  }

  function variantFromCard(card) {
    const title = card.querySelector(".movie-info h3")?.textContent?.trim() || "未命名電影";
    const parsed = parseVariantTitle(title);
    const providerData = cardProviderData(card);
    return {
      card,
      title,
      parsed,
      tags: parsed.tags,
      providers: cardProviders(card),
      broadwaySourceId: providerData.broadwaySourceId || null,
      mclSourceId: providerData.mclSourceId || null,
      emperorSourceId: providerData.emperorSourceId || null,
      broadwayMovieId: card.dataset.movieId || null,
      poster: card.querySelector(".movie-poster img")?.src || null,
      matchId: card.dataset.providerMatchId || null
    };
  }

  function buildVariantMatchRecord(groupId, variant, index) {
    const sources = PROVIDER_OPTIONS
      .map(provider => [provider.key, variant[`${provider.key}SourceId`]])
      .filter(([, sourceId]) => Boolean(sourceId));
    if (sources.length < 2) return null;

    const matchId = `${groupId}:variant:${index + 1}`;
    matchRecords.set(matchId, {
      id: matchId,
      title: variant.title,
      normalizedTitle: normalizeTitle(variant.title),
      matchType: "normalized-variant",
      confidence: 0.96,
      broadway: variant.broadwaySourceId
        ? {
            provider: "broadway",
            sourceId: variant.broadwaySourceId,
            movieId: variant.broadwayMovieId || null,
            poster: variant.poster || null
          }
        : null,
      mcl: variant.mclSourceId
        ? {
            provider: "mcl",
            sourceId: variant.mclSourceId,
            movie: findMCLMovie(variant.mclSourceId)
          }
        : null,
      emperor: variant.emperorSourceId
        ? {
            provider: "emperor",
            sourceId: variant.emperorSourceId,
            movie: findEmperorMovie(variant.emperorSourceId)
          }
        : null
    });
    return matchId;
  }

  function coalesceVariants(groupId, groupTitle, variants) {
    const bySignature = new Map();

    for (const variant of variants) {
      const signature = variantSignature(variant.parsed);
      if (!bySignature.has(signature)) {
        bySignature.set(signature, {
          title: variant.title,
          tags: [...variant.tags],
          providers: [],
          broadwaySourceId: null,
          mclSourceId: null,
          emperorSourceId: null,
          broadwayMovieId: null,
          poster: null,
          matchId: null
        });
      }

      const combined = bySignature.get(signature);
      for (const provider of PROVIDER_OPTIONS) {
        const sourceKey = `${provider.key}SourceId`;
        if (!combined[sourceKey] && variant[sourceKey]) combined[sourceKey] = variant[sourceKey];
      }
      if (!combined.broadwayMovieId && variant.broadwayMovieId) {
        combined.broadwayMovieId = variant.broadwayMovieId;
      }
      if (!combined.poster && variant.poster) combined.poster = variant.poster;
      if (!combined.matchId && variant.matchId) combined.matchId = variant.matchId;
      combined.providers = PROVIDER_OPTIONS
        .filter(provider => Boolean(combined[`${provider.key}SourceId`]))
        .map(provider => provider.label);
    }

    return Array.from(bySignature.values()).map((variant, index) => {
      const label = variant.tags.join(" · ");
      const displayTitle = label ? `${groupTitle}（${label}）` : groupTitle;
      const combined = { ...variant, title: displayTitle };
      combined.matchId = buildVariantMatchRecord(groupId, combined, index);
      return combined;
    });
  }

  function applyVariantGrouping() {
    groupRecords.clear();
    const cards = Array.from(grid.querySelectorAll(".movie-card"));
    const candidates = new Map();

    for (const card of cards) {
      const variant = variantFromCard(card);
      setCardProviders(card, variant.providers);
      if (!variant.parsed.key || variant.parsed.key.length < 3) continue;
      if (!candidates.has(variant.parsed.key)) candidates.set(variant.parsed.key, []);
      candidates.get(variant.parsed.key).push(variant);
    }

    for (const [key, variants] of candidates) {
      if (variants.length < 2 || !variants.some(variant => variant.parsed.hasVariant)) continue;
      const primary = variants[0];
      const groupId = `versions:${key}`;
      const title = variants
        .map(variant => variant.parsed.base)
        .filter(Boolean)
        .sort((a, b) => a.length - b.length)[0] || primary.title;
      const providerLabels = PROVIDER_OPTIONS
        .filter(provider => variants.some(variant => variant.providers.includes(provider.label)))
        .map(provider => provider.label);
      const tags = Array.from(new Set(variants.flatMap(variant => variant.tags)));
      const groupedVariants = coalesceVariants(groupId, title, variants);

      groupRecords.set(groupId, {
        id: groupId,
        title,
        providers: providerLabels,
        variants: groupedVariants
      });

      const heading = primary.card.querySelector(".movie-info h3");
      const english = primary.card.querySelector(".movie-title-en");
      primary.card.dataset.originalGroupTitle = primary.title;
      if (heading) heading.textContent = title;
      if (english) {
        primary.card.dataset.originalGroupEnglish = english.textContent || "";
        english.textContent = parseVariantTitle(english.textContent).base;
      }
      primary.card.dataset.movieGroupId = groupId;
      primary.card.classList.add("movie-group-card");
      primary.card.setAttribute("aria-label", `查看 ${title} 的 ${groupedVariants.length} 個版本`);
      setCardProviders(primary.card, providerLabels);

      const info = primary.card.querySelector(".movie-info");
      info?.querySelector(".provider-badges[data-multi-provider]")?.remove();
      info?.insertAdjacentHTML("beforeend", `
        <div class="movie-variant-summary">
          <strong>${groupedVariants.length} 個版本</strong>
          <span>${escapeHtml(tags.slice(0, 3).join(" · ") || "不同院線版本")}${tags.length > 3 ? ` · +${tags.length - 3}` : ""}</span>
        </div>
        ${providerBadges(providerLabels)}
      `);

      for (const variant of variants.slice(1)) {
        variant.card.classList.add("movie-group-member");
        variant.card.dataset.groupMemberOf = groupId;
        variant.card.hidden = true;
      }
    }
  }

  function applyCatalogue() {
    if (count.textContent.trim() === "—") return;

    observer.disconnect();

    try {
      matchRecords.clear();
      resetVariantGrouping();

      grid.querySelectorAll(".mcl-only-card, .emperor-only-card").forEach(card => card.remove());
      grid.querySelectorAll(".provider-badges[data-multi-provider]").forEach(item => item.remove());
      grid.querySelectorAll("[data-mcl-source-id]").forEach(card => delete card.dataset.mclSourceId);
      grid.querySelectorAll("[data-emperor-source-id]").forEach(card => delete card.dataset.emperorSourceId);
      grid.querySelectorAll("[data-provider-match-id]").forEach(card => delete card.dataset.providerMatchId);

      const broadwayCards = Array.from(grid.querySelectorAll(
        ".movie-card:not(.mcl-only-card):not(.emperor-only-card)"
      ));
      const byTitle = new Map();

      for (const card of broadwayCards) {
        const key = normalizeTitle(card.querySelector("h3")?.textContent);
        if (key && !byTitle.has(key)) byTitle.set(key, card);
      }

      for (const movie of getMCLMovies()) {
        const key = normalizeTitle(movieTitle(movie));
        if (!key) continue;

        const matchingCard = byTitle.get(key);
        if (matchingCard) {
          matchingCard.dataset.mclSourceId = movie.sourceId;
          continue;
        }

        grid.insertAdjacentHTML("beforeend", renderProviderOnlyCard(movie, "mcl"));
        const card = grid.lastElementChild;
        if (card) byTitle.set(key, card);
      }

      for (const movie of getEmperorMovies()) {
        const key = normalizeTitle(movieTitle(movie));
        if (!key) continue;

        const matchingCard = byTitle.get(key);
        if (matchingCard) {
          matchingCard.dataset.emperorSourceId = movie.sourceId;
          continue;
        }

        grid.insertAdjacentHTML("beforeend", renderProviderOnlyCard(movie, "emperor"));
        const card = grid.lastElementChild;
        if (card) byTitle.set(key, card);
      }

      let matched = 0;
      let tripleMatched = 0;

      for (const card of grid.querySelectorAll(".movie-card")) {
        const record = buildMatchRecord(card);
        if (record) {
          matched++;
          if (record.broadway && record.mcl && record.emperor) {
            tripleMatched++;
          }
        }
        refreshCardBadges(card);
      }

      applyVariantGrouping();
      const total = grid.querySelectorAll(".movie-card:not(.movie-group-member)").length;
      lastCountMeta = { total, matched, tripleMatched };
      applyProviderFilters();

      window.dispatchEvent(new CustomEvent("hkcinema:provider-matches", {
        detail: {
          matches: Array.from(matchRecords.values()),
          count: matchRecords.size,
          tripleMatched,
          movieGroups: Array.from(groupRecords.values()),
          movieGroupCount: groupRecords.size
        }
      }));
    } finally {
      observer.observe(grid, { childList: true, subtree: true });
    }
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyCatalogue();
    });
  });

  observer.observe(grid, { childList: true, subtree: true });

  window.addEventListener("hkcinema:mcl-catalogue", event => {
    mclCatalogue = event.detail;
    applyCatalogue();
  });

  window.addEventListener("hkcinema:emperor-catalogue", event => {
    emperorCatalogue = event.detail;
    applyCatalogue();
  });

  document.addEventListener("click", event => {
    const filterButton = event.target.closest("[data-home-provider]");
    if (filterButton) {
      event.preventDefault();
      toggleProviderFilter(filterButton.dataset.homeProvider);
      return;
    }

    if (event.target.closest("[data-movie-group-close]")) {
      event.preventDefault();
      closeMovieGroup();
      return;
    }

    const groupProvider = event.target.closest("[data-movie-group-provider]");
    if (groupProvider) {
      event.preventDefault();
      const provider = groupProvider.dataset.movieGroupProvider;
      const sourceId = groupProvider.dataset.sourceId;
      closeMovieGroup();
      if (provider === "broadway") window.HKCinemaBroadwayApp?.open?.(sourceId);
      else if (provider === "mcl") openMCL(sourceId);
      else if (provider === "emperor") openEmperor(sourceId);
      return;
    }

    const groupCompare = event.target.closest("[data-movie-group-compare]");
    if (groupCompare) {
      event.preventDefault();
      const matchId = groupCompare.dataset.movieGroupCompare;
      closeMovieGroup();
      window.HKCinemaProviderCompare?.open?.(matchId);
      return;
    }

    const groupCard = event.target.closest(".movie-group-card");
    if (groupCard) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openMovieGroup(groupCard.dataset.movieGroupId);
      return;
    }

    const mclTarget = event.target.closest("[data-mcl-open]");
    if (mclTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openMCL(mclTarget.dataset.mclOpen || mclTarget.dataset.sourceId);
      return;
    }

    const emperorTarget = event.target.closest("[data-emperor-open]");
    if (emperorTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openEmperor(emperorTarget.dataset.emperorOpen || emperorTarget.dataset.sourceId);
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.querySelector("#movieGroupOverlay")?.hidden) {
      event.preventDefault();
      closeMovieGroup();
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") return;

    const groupCard = event.target.closest(".movie-group-card");
    if (groupCard) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openMovieGroup(groupCard.dataset.movieGroupId);
      return;
    }

    const mclCard = event.target.closest(".mcl-only-card");
    if (mclCard) {
      event.preventDefault();
      openMCL(mclCard.dataset.sourceId);
      return;
    }

    const emperorCard = event.target.closest(".emperor-only-card");
    if (emperorCard) {
      event.preventDefault();
      openEmperor(emperorCard.dataset.sourceId);
    }
  }, true);

  ensureProviderFilters();
  if (mclCatalogue || emperorCatalogue) applyCatalogue();
})();
