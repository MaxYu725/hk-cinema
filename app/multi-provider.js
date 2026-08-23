(() => {
  const sharedCore = window.HKCinemaProviderSharedCore || null;
  const PROVIDERS = Object.freeze(sharedCore?.providers?.() || []);
  const grid = document.querySelector("#movieGrid");
  const count = document.querySelector("#movieCount");

  if (!grid || !count || !sharedCore || !PROVIDERS.length) return;

  const matchRecords = new Map();
  const groupRecords = new Map();

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

  function metadataValues(value) {
    let source = value;
    if (typeof source === "string" && source.trim().startsWith("[")) {
      try {
        source = JSON.parse(source);
      } catch {
        source = [source];
      }
    }

    const values = Array.isArray(source) ? source : [source];
    return Array.from(new Set(values
      .flatMap(item => String(item || "").split(/[、,，/;；]+/))
      .map(item => item.trim())
      .filter(Boolean)));
  }

  function metadataAttribute(value) {
    return escapeHtml(JSON.stringify(metadataValues(value)));
  }

  function readCardMetadata(card, key) {
    return metadataValues(card?.dataset?.[key] || []);
  }

  function writeCardMetadata(card, key, values) {
    if (!card) return;
    card.dataset[key] = JSON.stringify(metadataValues(values));
  }

  function mergeMovieMetadata(card, movie) {
    if (!card || !movie) return;

    writeCardMetadata(card, "homeLanguages", [
      ...readCardMetadata(card, "homeLanguages"),
      ...metadataValues(movie.language || movie.languages)
    ]);

    writeCardMetadata(card, "homeFormats", [
      ...readCardMetadata(card, "homeFormats"),
      ...metadataValues(movie.formats || movie.format)
    ]);

    if (!card.dataset.homeReleaseDate && movie.releaseDate) {
      card.dataset.homeReleaseDate = String(movie.releaseDate).slice(0, 10);
    }
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

  function showtimeMetadata() {
    return window.HKCinemaShowtimeMetadata || null;
  }

  function getActiveTab() {
    return document.querySelector(".tab.active")?.dataset.tab || "now";
  }

  function providerIds() {
    return PROVIDERS.map(provider => provider.key);
  }

  function providerLabel(provider) {
    return sharedCore.label?.(provider) || provider;
  }

  function providerDatasetKey(provider) {
    return /^[a-z][a-z0-9]*$/i.test(provider) ? `${provider}SourceId` : null;
  }

  function normalizeSourceId(provider, value) {
    return sharedCore.normalizeSourceId?.(provider, value) ||
      String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
  }

  function parseProviderSources(card) {
    try {
      const parsed = JSON.parse(card?.dataset?.providerSources || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function directProvider(card) {
    return sharedCore.registeredProviderId?.(card?.dataset?.provider) || null;
  }

  function baseProvider() {
    const explicit = sharedCore.registeredProviderId?.(grid.dataset.homeBaseProvider);
    if (explicit) return explicit;

    for (const card of grid.querySelectorAll(".movie-card:not(.provider-only-card)")) {
      const provider = directProvider(card);
      if (provider) return provider;
    }
    return PROVIDERS[0]?.key || null;
  }

  function cardProviderSources(card) {
    const sources = {};
    const explicit = parseProviderSources(card);

    for (const provider of PROVIDERS) {
      const key = provider.key;
      const datasetKey = providerDatasetKey(key);
      const value = normalizeSourceId(
        key,
        explicit[key] || (datasetKey ? card?.dataset?.[datasetKey] : "")
      );
      if (value) sources[key] = value;
    }

    const direct = directProvider(card);
    const directSourceId = direct
      ? normalizeSourceId(direct, card?.dataset?.sourceId)
      : "";
    if (direct && directSourceId) sources[direct] = directSourceId;

    if (!direct) {
      const base = baseProvider();
      const sourceId = base
        ? normalizeSourceId(base, card?.dataset?.sourceId)
        : "";
      if (base && sourceId && !card?.dataset?.providerOnly) sources[base] = sourceId;
    }

    return sources;
  }

  function writeProviderSources(card, sources) {
    if (!card) return;
    const normalized = {};

    for (const provider of PROVIDERS) {
      const key = provider.key;
      const sourceId = normalizeSourceId(key, sources?.[key]);
      const datasetKey = providerDatasetKey(key);

      if (datasetKey) {
        if (sourceId) card.dataset[datasetKey] = sourceId;
        else delete card.dataset[datasetKey];
      }
      if (sourceId) normalized[key] = sourceId;
    }

    card.dataset.providerSources = JSON.stringify(normalized);
    card.dataset.providers = Object.keys(normalized).join(",");
  }

  function setCardProviderSource(card, provider, sourceId) {
    const key = sharedCore.registeredProviderId?.(provider);
    const normalized = key ? normalizeSourceId(key, sourceId) : "";
    if (!key || !normalized) return false;
    const sources = cardProviderSources(card);
    sources[key] = normalized;
    writeProviderSources(card, sources);
    return true;
  }

  function resetCardProviderSources(card) {
    const direct = directProvider(card);
    const base = direct || baseProvider();
    const sourceId = base ? normalizeSourceId(base, card?.dataset?.sourceId) : "";
    writeProviderSources(card, base && sourceId ? { [base]: sourceId } : {});
  }

  function cardProviders(card) {
    const sources = cardProviderSources(card);
    return PROVIDERS
      .filter(provider => Boolean(sources[provider.key]))
      .map(provider => provider.key);
  }

  function setCardProviders(card, providers) {
    const current = cardProviderSources(card);
    const allowed = new Set((providers || [])
      .map(value => sharedCore.registeredProviderId?.(value))
      .filter(Boolean));
    const next = Object.fromEntries(
      Object.entries(current).filter(([provider]) => allowed.has(provider))
    );
    writeProviderSources(card, next);
  }

  function providerHealthRecord(provider) {
    return window.HKCinemaDataHealth?.getState?.().records?.[provider] || null;
  }

  function providerCatalogue(provider) {
    const published = sharedCore.catalogue?.(provider) || null;
    if (published) return published;

    // The existing first provider remains the current home-base renderer. Only read
    // its already-loaded synchronous snapshot here; aggregation never starts network IO.
    if (provider === baseProvider()) {
      return window.HKCinemaBroadwayApp?.getCatalogue?.() || null;
    }
    return null;
  }

  function providerSectionState(provider) {
    const catalogue = providerCatalogue(provider);
    if (!catalogue) {
      return {
        usable: false,
        failed: providerHealthRecord(provider)?.status === "error",
        catalogue: null
      };
    }

    const section = getActiveTab() === "coming" ? "coming" : "now";
    const error = catalogue.meta?.errors?.[section];
    const fallback = Boolean(catalogue.meta?.fallbackSections?.[section]);

    return {
      usable: !error || fallback,
      failed: Boolean(error) && !fallback,
      catalogue
    };
  }

  function providerMovies(provider, state = providerSectionState(provider)) {
    if (!state.usable || !state.catalogue) return [];
    const section = getActiveTab() === "coming" ? "coming" : "now";
    return Array.isArray(state.catalogue?.[section]) ? state.catalogue[section] : [];
  }

  function catalogueMovie(provider, sourceId) {
    const catalogue = providerCatalogue(provider);
    if (!catalogue) return null;
    const normalized = normalizeSourceId(provider, sourceId);
    return [
      ...(catalogue.now || []),
      ...(catalogue.coming || []),
      ...(catalogue.festival || [])
    ].find(movie => (
      normalizeSourceId(provider, movie?.sourceId || movie?.id) === normalized
    )) || null;
  }

  function movieTitle(movie) {
    return movie?.title?.zh || movie?.title?.en || movie?.title || "未命名電影";
  }

  function renderProviderOnlyCard(movie, provider) {
    const title = movieTitle(movie);
    const sourceId = normalizeSourceId(provider, movie?.sourceId || movie?.id);
    const providerClass = /^[a-z][a-z0-9-]*$/i.test(provider)
      ? `${provider}-only-card`
      : "";
    const posterUrl = movie.poster || movie.posterUrl || "";
    const poster = posterUrl
      ? `
        <img
          src="${escapeHtml(posterUrl)}"
          alt="${escapeHtml(title)}"
          loading="lazy"
          onerror="this.style.display='none';this.parentElement.classList.add('poster-error');"
        >
      `
      : "";
    const upcomingBadge = getActiveTab() === "coming"
      ? `
        <div class="movie-badges">
          <span class="movie-badge coming">即將上映</span>
        </div>
      `
      : "";

    return `
      <article
        class="movie-card provider-only-card ${escapeHtml(providerClass)}"
        data-provider-only="true"
        data-provider="${escapeHtml(provider)}"
        data-source-id="${escapeHtml(sourceId)}"
        data-provider-sources="${escapeHtml(JSON.stringify({ [provider]: sourceId }))}"
        data-booking-url="${escapeHtml(movie.bookingUrl || "")}"
        data-home-languages="${metadataAttribute(movie.language || movie.languages)}"
        data-home-formats="${metadataAttribute(movie.formats || movie.format)}"
        data-home-release-date="${escapeHtml(movie.releaseDate || "")}"
        role="button"
        tabindex="0"
        aria-label="查看 ${escapeHtml(title)} 電影資料及場次"
      >
        <div class="movie-poster">
          ${poster}
          ${upcomingBadge}
          <button
            type="button"
            class="movie-favorite-button"
            data-movie-favorite
            aria-label="收藏${escapeHtml(title)}"
            aria-pressed="false"
            title="收藏"
          ></button>
          <div class="poster-placeholder">電影</div>
        </div>
        <div class="movie-info">
          <h3>${escapeHtml(title)}</h3>
        </div>
      </article>
    `;
  }

  function providerEntry(provider, sourceId, card = null, extras = {}) {
    const normalized = normalizeSourceId(provider, sourceId);
    if (!normalized) return null;
    const movie = catalogueMovie(provider, normalized);
    const poster = card?.querySelector?.(".movie-poster img")?.src || movie?.poster || movie?.posterUrl || null;
    return {
      provider,
      sourceId: normalized,
      movie,
      poster,
      ...extras
    };
  }

  function buildMatchRecord(card) {
    const sources = cardProviderSources(card);
    const activeProviders = PROVIDERS.filter(provider => Boolean(sources[provider.key]));
    if (activeProviders.length < 2) {
      delete card.dataset.providerMatchId;
      return null;
    }

    const components = activeProviders.map(provider => `${provider.key}:${sources[provider.key]}`);
    const title = card.querySelector("h3")?.textContent?.trim() || "未命名電影";
    const matchId = components.join("|");
    const direct = directProvider(card);
    const entries = Object.fromEntries(PROVIDERS.map(provider => {
      const sourceId = sources[provider.key];
      if (!sourceId) return [provider.key, null];
      const extras = provider.key === direct && card.dataset.movieId
        ? { movieId: card.dataset.movieId }
        : {};
      return [provider.key, providerEntry(provider.key, sourceId, card, extras)];
    }));
    const record = {
      id: matchId,
      title,
      normalizedTitle: normalizeTitle(title),
      matchType: "exact-title",
      confidence: 1,
      ...entries
    };

    matchRecords.set(matchId, record);
    card.dataset.providerMatchId = matchId;
    return record;
  }

  function resetVariantGrouping() {
    for (const card of grid.querySelectorAll(".movie-card")) {
      const heading = card.querySelector(".movie-info h3");
      const english = card.querySelector(".movie-title-en");

      if (heading && card.dataset.originalGroupTitle) {
        heading.textContent = card.dataset.originalGroupTitle;
      }
      if (english && card.dataset.originalGroupEnglish) {
        english.textContent = card.dataset.originalGroupEnglish;
      }

      delete card.dataset.originalGroupTitle;
      delete card.dataset.originalGroupEnglish;
      delete card.dataset.movieGroupId;
      delete card.dataset.groupMemberOf;
      card.classList.remove("movie-group-card", "movie-group-member");
      card.hidden = false;
    }

    groupRecords.clear();
  }

  function variantFromCard(card) {
    const title = card.querySelector(".movie-info h3")?.textContent?.trim() || "未命名電影";
    const parsed = parseVariantTitle(title);
    const sourceIds = cardProviderSources(card);
    const providers = PROVIDERS
      .filter(provider => Boolean(sourceIds[provider.key]))
      .map(provider => provider.key);

    return {
      card,
      title,
      parsed,
      tags: parsed.tags,
      languages: readCardMetadata(card, "homeLanguages"),
      formats: readCardMetadata(card, "homeFormats"),
      releaseDate: String(card.dataset.homeReleaseDate || ""),
      providers,
      sourceIds,
      comparisonMclSourceId: null,
      comparisonProviderCount: providers.length,
      sessionCriteria: null,
      broadwayMovieId: card.dataset.movieId || null,
      poster: card.querySelector(".movie-poster img")?.src || null,
      matchId: card.dataset.providerMatchId || null
    };
  }

  function effectiveVariantSources(variant) {
    const sources = { ...(variant.sourceIds || {}) };
    if (variant.comparisonMclSourceId) {
      sources.mcl = normalizeSourceId("mcl", variant.comparisonMclSourceId);
    }
    return sources;
  }

  function buildVariantMatchRecord(groupId, variant, index) {
    const sources = effectiveVariantSources(variant);
    const activeProviders = PROVIDERS.filter(provider => Boolean(sources[provider.key]));
    if (activeProviders.length < 2) return null;

    const matchId = `${groupId}:variant:${index + 1}`;
    const entries = Object.fromEntries(PROVIDERS.map(provider => {
      const sourceId = sources[provider.key];
      if (!sourceId) return [provider.key, null];
      const extras = provider.key === baseProvider()
        ? {
            movieId: variant.broadwayMovieId || null,
            poster: variant.poster || null
          }
        : {};
      return [provider.key, providerEntry(provider.key, sourceId, null, extras)];
    }));

    matchRecords.set(matchId, {
      id: matchId,
      title: variant.title,
      normalizedTitle: normalizeTitle(variant.title),
      matchType: "normalized-variant",
      confidence: 0.96,
      ...entries,
      sessionCriteria: variant.sessionCriteria || null,
      comparisonOnlyProviders: variant.comparisonMclSourceId ? ["mcl"] : []
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
          languages: [...variant.languages],
          formats: [...variant.formats],
          releaseDate: variant.releaseDate || null,
          providers: [],
          sourceIds: Object.fromEntries(providerIds().map(provider => [provider, null])),
          comparisonMclSourceId: null,
          comparisonProviderCount: 0,
          sessionCriteria: null,
          broadwayMovieId: null,
          poster: null,
          matchId: null
        });
      }

      const combined = bySignature.get(signature);

      for (const provider of PROVIDERS) {
        const sourceId = variant.sourceIds?.[provider.key];
        if (!combined.sourceIds[provider.key] && sourceId) {
          combined.sourceIds[provider.key] = sourceId;
        }
      }

      if (!combined.broadwayMovieId && variant.broadwayMovieId) {
        combined.broadwayMovieId = variant.broadwayMovieId;
      }
      if (!combined.poster && variant.poster) combined.poster = variant.poster;
      if (!combined.matchId && variant.matchId) combined.matchId = variant.matchId;

      combined.languages = Array.from(new Set([
        ...combined.languages,
        ...variant.languages
      ]));
      combined.formats = Array.from(new Set([
        ...combined.formats,
        ...variant.formats
      ]));
      if (!combined.releaseDate && variant.releaseDate) {
        combined.releaseDate = variant.releaseDate;
      }

      combined.providers = PROVIDERS
        .filter(provider => Boolean(combined.sourceIds[provider.key]))
        .map(provider => provider.key);
    }

    const combinedVariants = Array.from(bySignature.values());
    const genericMCL = combinedVariants.find(variant => (
      variant.sourceIds.mcl &&
      showtimeMetadata()?.isGenericBridgeSource?.(variant.tags)
    ));

    return combinedVariants.map((variant, index) => {
      const label = variant.tags.join(" · ");
      const displayTitle = label ? `${groupTitle}（${label}）` : groupTitle;
      const combined = { ...variant, title: displayTitle };
      const criteria = showtimeMetadata()?.criteriaFromVariant?.(variant.tags) || null;

      if (
        !combined.sourceIds.mcl &&
        genericMCL?.sourceIds?.mcl &&
        criteria?.bridgeEligible
      ) {
        combined.comparisonMclSourceId = genericMCL.sourceIds.mcl;
        combined.sessionCriteria = {
          languages: [...criteria.languages],
          subtitles: [],
          formats: [...criteria.formats]
        };
      }

      combined.comparisonProviderCount = PROVIDERS.filter(provider => (
        provider.key === "mcl"
          ? Boolean(combined.sourceIds[provider.key] || combined.comparisonMclSourceId)
          : Boolean(combined.sourceIds[provider.key])
      )).length;

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
      if (!candidates.has(variant.parsed.key)) {
        candidates.set(variant.parsed.key, []);
      }
      candidates.get(variant.parsed.key).push(variant);
    }

    for (const [key, variants] of candidates) {
      if (variants.length < 2 || !variants.some(variant => variant.parsed.hasVariant)) {
        continue;
      }

      const primary = variants[0];
      const groupId = `versions:${key}`;
      const title = variants
        .map(variant => variant.parsed.base)
        .filter(Boolean)
        .sort((a, b) => a.length - b.length)[0] || primary.title;

      const providerLabels = PROVIDERS
        .filter(provider => variants.some(variant => variant.providers.includes(provider.key)))
        .map(provider => provider.label);

      const groupedVariants = coalesceVariants(groupId, title, variants);
      const groupedLanguages = Array.from(new Set(
        variants.flatMap(variant => variant.languages)
      ));
      const groupedFormats = Array.from(new Set(
        variants.flatMap(variant => variant.formats)
      ));
      const groupedReleaseDates = variants
        .map(variant => variant.releaseDate)
        .filter(Boolean)
        .sort();

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
      primary.card.setAttribute("aria-label", `查看 ${title} 電影資料及場次`);
      writeCardMetadata(primary.card, "homeLanguages", groupedLanguages);
      writeCardMetadata(primary.card, "homeFormats", groupedFormats);
      primary.card.dataset.homeReleaseDate = getActiveTab() === "coming"
        ? groupedReleaseDates[0] || ""
        : groupedReleaseDates.at(-1) || "";
      setCardProviders(primary.card, primary.providers || cardProviders(primary.card));

      for (const variant of variants.slice(1)) {
        variant.card.classList.add("movie-group-member");
        variant.card.dataset.groupMemberOf = groupId;
        variant.card.hidden = true;
      }
    }
  }

  function updateMovieCount(matched, maxProviderCount) {
    const total = grid.querySelectorAll(".movie-card:not(.movie-group-member)").length;
    count.textContent = `${total} 部`;
    count.title = `合併版本後 ${total} 部 · 跨院線配對 ${matched} 部${
      maxProviderCount > 1 ? ` · 最高 ${maxProviderCount} 院線同片` : ""
    }`;
    window.HKCinemaHomeLibrary?.apply?.();
  }

  function renderCombinedEmptyState(baseState, alternateFailure = false) {
    const tab = getActiveTab();
    const partialFailure = baseState === "error" || alternateFailure;
    const marker = `${tab}:${baseState}:${partialFailure ? "partial" : "clean"}`;
    if (grid.dataset.multiProviderEmpty === marker) return;

    const coming = tab === "coming";
    const title = coming ? "暫時沒有即將上映電影" : "暫時沒有上映場次";
    const movieType = coming ? "即將上映電影" : "上映電影";
    const text = partialFailure
      ? `部分院線資料暫時不可用；已連接院線目前沒有找到${movieType}。`
      : `已連接院線目前沒有找到${movieType}。`;

    grid.dataset.multiProviderEmpty = marker;
    grid.innerHTML = `
      <div class="empty-state" data-multi-provider-empty-state>
        <strong>${title}</strong>
        <span>${text}</span>
      </div>
    `;
    count.textContent = "0 部";
    count.title = partialFailure
      ? "部分院線資料暫時不可用 · 已連接院線 0 部"
      : "已連接院線 0 部";
    window.HKCinemaHomeLibrary?.apply?.();
  }

  function applyCatalogue() {
    const base = baseProvider();
    const baseStateKey = base && /^[a-z][a-z0-9]*$/i.test(base) ? `${base}State` : null;
    const baseState = grid.dataset.homeBaseState ||
      (baseStateKey ? grid.dataset[baseStateKey] : "") ||
      (count.textContent.trim() === "—" ? "loading" : "ready");
    if (baseState === "loading") return;

    const alternateProviders = PROVIDERS.filter(provider => provider.key !== base);
    const sectionStates = new Map(alternateProviders.map(provider => [
      provider.key,
      providerSectionState(provider.key)
    ]));
    const alternateMovies = new Map(alternateProviders.map(provider => [
      provider.key,
      providerMovies(provider.key, sectionStates.get(provider.key))
    ]));
    const hasAlternateCatalogue = Array.from(sectionStates.values()).some(state => state.usable);
    const hasAlternateFailure = Array.from(sectionStates.values()).some(state => state.failed);
    const hasAlternateMovies = Array.from(alternateMovies.values()).some(movies => movies.length > 0);

    if (["error", "empty"].includes(baseState)) {
      if (!hasAlternateCatalogue && !hasAlternateFailure) return;
      if (!hasAlternateMovies) {
        renderCombinedEmptyState(baseState, hasAlternateFailure);
        return;
      }
      grid.querySelector(".empty-state")?.remove();
      delete grid.dataset.multiProviderEmpty;
    }

    observer.disconnect();

    try {
      matchRecords.clear();
      resetVariantGrouping();

      grid.querySelectorAll(
        ".provider-only-card, .mcl-only-card[data-provider-only], .emperor-only-card[data-provider-only]"
      ).forEach(card => card.remove());
      grid.querySelectorAll("[data-provider-match-id]").forEach(card => delete card.dataset.providerMatchId);

      const baseCards = Array.from(grid.querySelectorAll(".movie-card:not(.provider-only-card)"));
      const byTitle = new Map();

      for (const card of baseCards) {
        resetCardProviderSources(card);
        const key = normalizeTitle(card.querySelector("h3")?.textContent);
        if (key && !byTitle.has(key)) byTitle.set(key, card);
      }

      for (const provider of alternateProviders) {
        for (const movie of alternateMovies.get(provider.key) || []) {
          const sourceId = normalizeSourceId(provider.key, movie?.sourceId || movie?.id);
          const key = normalizeTitle(movieTitle(movie));
          if (!sourceId || !key) continue;

          const matchingCard = byTitle.get(key);
          if (matchingCard) {
            setCardProviderSource(matchingCard, provider.key, sourceId);
            mergeMovieMetadata(matchingCard, movie);
            continue;
          }

          grid.insertAdjacentHTML("beforeend", renderProviderOnlyCard(movie, provider.key));
          const card = grid.lastElementChild;
          if (card) {
            writeProviderSources(card, { [provider.key]: sourceId });
            byTitle.set(key, card);
          }
        }
      }

      let matched = 0;
      let maxProviderCount = 0;

      for (const card of grid.querySelectorAll(".movie-card")) {
        const record = buildMatchRecord(card);
        if (!record) continue;
        matched += 1;
        const providerCount = PROVIDERS.filter(provider => Boolean(record[provider.key])).length;
        maxProviderCount = Math.max(maxProviderCount, providerCount);
      }

      applyVariantGrouping();
      updateMovieCount(matched, maxProviderCount);

      window.dispatchEvent(new CustomEvent("hkcinema:provider-matches", {
        detail: {
          matches: Array.from(matchRecords.values()),
          count: matchRecords.size,
          maxProviderCount,
          movieGroups: Array.from(groupRecords.values()),
          movieGroupCount: groupRecords.size
        }
      }));
    } finally {
      observer.observe(grid, { childList: true, subtree: true });
    }
  }

  let queued = false;
  function scheduleCatalogue() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyCatalogue();
    });
  }

  const observer = new MutationObserver(scheduleCatalogue);
  observer.observe(grid, { childList: true, subtree: true });

  window.addEventListener("hkcinema:provider-catalogue", event => {
    if (!sharedCore.registeredProviderId?.(event.detail?.provider)) return;
    scheduleCatalogue();
  });

  window.addEventListener("hkcinema:data-health", event => {
    if (!sharedCore.registeredProviderId?.(event.detail?.provider)) return;
    scheduleCatalogue();
  });

  window.addEventListener("hkcinema:home-tab", scheduleCatalogue);

  window.HKCinemaMultiProvider = Object.freeze({
    version: "m7r2-1",
    refresh: scheduleCatalogue,
    getProviderSources(card) {
      return { ...cardProviderSources(card) };
    }
  });

  scheduleCatalogue();
})();
