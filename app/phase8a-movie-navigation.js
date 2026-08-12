(() => {
  const sharedCore = window.HKCinemaProviderSharedCore || null;
  const PROVIDERS = sharedCore?.providerIds?.() || ["broadway", "mcl", "emperor"];

  const baseRegistry = window.HKCinemaProviderMatches || {
    get() { return null; },
    all() { return []; }
  };
  const aggregateRecords = new Map();
  const aggregates = new Map();
  let scheduled = false;

  function normalizeSourceId(provider, value) {
    return sharedCore?.normalizeSourceId?.(provider, value) ||
      String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function titleFor(card) {
    return card?.querySelector(".movie-info h3")?.textContent?.trim() ||
      card?.querySelector("h3")?.textContent?.trim() ||
      "未命名電影";
  }

  function secondaryTitleFor(card) {
    return card?.querySelector(".movie-title-en")?.textContent?.trim() || null;
  }

  function posterFor(card) {
    return card?.querySelector(".movie-poster img")?.src || null;
  }

  function providerSourcesAttribute(card) {
    try {
      const parsed = JSON.parse(card?.dataset?.providerSources || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function providerSourceIdsFromCard(card) {
    const isMCLOnly = card?.classList?.contains("mcl-only-card");
    const isEmperorOnly = card?.classList?.contains("emperor-only-card");
    const directSourceId = String(card?.dataset?.sourceId || "").trim();
    const directProvider = String(card?.dataset?.provider || "").trim().toLowerCase();
    const explicit = providerSourcesAttribute(card);

    return Object.fromEntries(PROVIDERS.map(provider => {
      const datasetKey = /^[a-z][a-z0-9]*$/i.test(provider) ? `${provider}SourceId` : null;
      let value = explicit?.[provider] || (datasetKey ? card?.dataset?.[datasetKey] : "") || "";

      if (!value && directSourceId && directProvider === provider) value = directSourceId;
      if (!value && provider === "mcl" && isMCLOnly) value = directSourceId;
      if (!value && provider === "emperor" && isEmperorOnly) value = directSourceId;
      if (!value && provider === "broadway" && !directProvider && !isMCLOnly && !isEmperorOnly) value = directSourceId;

      return [provider, normalizeSourceId(provider, value)];
    }));
  }

  function findExistingEntry(provider, sourceId) {
    const normalized = normalizeSourceId(provider, sourceId);
    if (!normalized) return null;
    for (const record of baseRegistry.all?.() || []) {
      const entry = record?.[provider];
      if (normalizeSourceId(provider, entry?.sourceId) === normalized) return entry;
    }
    return null;
  }

  function providerCatalogue(provider) {
    const adapter = window.HKCinemaProviders?.[provider];
    const cached = adapter?.catalogue || adapter?.getCachedCatalogue?.() || null;
    if (cached) return cached;
    if (provider === "broadway") {
      return window.HKCinemaBroadwayApp?.getCatalogue?.() || null;
    }
    if (provider === "mcl") return window.HKCinemaMCLCatalogue || null;
    if (provider === "emperor") return window.HKCinemaEmperorCatalogue || null;

    const generic = adapter?.getCatalogue?.();
    return generic && typeof generic.then !== "function" ? generic : null;
  }

  function catalogueMovie(provider, sourceId) {
    const normalized = normalizeSourceId(provider, sourceId);
    if (!normalized) return null;

    const existing = findExistingEntry(provider, normalized);
    if (existing?.movie) return existing.movie;

    const catalogue = providerCatalogue(provider);
    const movies = [
      ...(catalogue?.now || []),
      ...(catalogue?.coming || []),
      ...(catalogue?.festival || [])
    ];
    return movies.find(movie => normalizeSourceId(provider, movie?.sourceId || movie?.id) === normalized) || null;
  }

  function normalizedReleaseDate(value) {
    const text = String(value || "").trim();
    const match = text.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }

  function factsFromSourceSets(sourceSets, fallbackReleaseDate = null) {
    const movies = [];
    const seen = new Set();

    for (const sourceIds of sourceSets || []) {
      for (const provider of PROVIDERS) {
        const sourceId = normalizeSourceId(provider, sourceIds?.[provider]);
        if (!sourceId) continue;
        const key = `${provider}:${sourceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const movie = catalogueMovie(provider, sourceId);
        if (movie) movies.push(movie);
      }
    }

    const classification = movies
      .map(movie => String(movie?.rating || movie?.classification || "").trim())
      .find(Boolean) || null;
    const durationMinutes = movies
      .map(movie => Number(movie?.durationMinutes ?? movie?.duration))
      .find(value => Number.isFinite(value) && value > 0) || null;
    const releaseDate = normalizedReleaseDate(fallbackReleaseDate) ||
      movies.map(movie => normalizedReleaseDate(movie?.releaseDate || movie?.openingDate)).find(Boolean) ||
      null;

    return { classification, durationMinutes, releaseDate };
  }

  function providerEntry(provider, sourceId, extras = {}) {
    const normalized = normalizeSourceId(provider, sourceId);
    if (!normalized) return null;
    const existing = findExistingEntry(provider, normalized);
    return {
      ...(existing || {}),
      provider,
      sourceId: normalized,
      ...extras
    };
  }

  function recordProviderCount(record) {
    return PROVIDERS.filter(provider => Boolean(record?.[provider])).length;
  }

  function registerMatch(record) {
    if (!record?.id) return null;
    aggregateRecords.set(record.id, record);
    return record;
  }

  function simpleAggregate(card) {
    const sourceIds = providerSourceIdsFromCard(card);
    const components = PROVIDERS
      .filter(provider => sourceIds[provider])
      .map(provider => `${provider}:${sourceIds[provider]}`);
    if (!components.length) return null;

    const baseMatch = card.dataset.providerMatchId
      ? baseRegistry.get?.(card.dataset.providerMatchId)
      : null;
    const id = `phase8a:movie:${components.join("|")}`;
    const title = titleFor(card);
    const poster = posterFor(card);
    const providerEntries = Object.fromEntries(PROVIDERS.map(provider => {
      if (!sourceIds[provider]) return [provider, null];
      const extras = provider === "broadway"
        ? {
            movieId: card.dataset.movieId || baseMatch?.broadway?.movieId || null,
            poster: poster || baseMatch?.broadway?.poster || null
          }
        : {};
      return [provider, providerEntry(provider, sourceIds[provider], extras)];
    }));
    const record = {
      id,
      title,
      normalizedTitle: baseMatch?.normalizedTitle || title.normalize("NFKC").toLowerCase(),
      matchType: "movie-aggregate",
      confidence: baseMatch?.confidence ?? 1,
      sessionCriteria: baseMatch?.sessionCriteria || null,
      comparisonOnlyProviders: [...(baseMatch?.comparisonOnlyProviders || [])],
      ...providerEntries
    };

    registerMatch(record);
    const aggregate = {
      kind: "movie-aggregate",
      schemaVersion: 1,
      id,
      title: {
        display: title,
        secondary: secondaryTitleFor(card)
      },
      posterUrl: poster,
      facts: factsFromSourceSets([sourceIds], card.dataset.homeReleaseDate),
      providerCount: recordProviderCount(record),
      sources: Object.fromEntries(PROVIDERS.map(provider => [provider, sourceIds[provider] ? [sourceIds[provider]] : []])),
      variants: [{
        id: `${id}:default`,
        matchId: id,
        label: "一般版本",
        tags: [],
        providerCount: recordProviderCount(record),
        sourceIds: { ...sourceIds }
      }],
      primaryMatchId: id
    };
    aggregates.set(id, aggregate);
    return aggregate;
  }

  function variantSourceIds(variant) {
    return Object.fromEntries(PROVIDERS.map(provider => {
      const dynamicKey = /^[a-z][a-z0-9]*$/i.test(provider) ? `${provider}SourceId` : null;
      let value = variant?.sourceIds?.[provider] || (dynamicKey ? variant?.[dynamicKey] : "") || "";
      if (!value && provider === "mcl") value = variant?.comparisonMclSourceId || "";
      return [provider, normalizeSourceId(provider, value)];
    }));
  }

  function variantLabel(variant) {
    const tags = unique(variant?.tags || []);
    return tags.length ? tags.join(" · ") : "一般版本";
  }

  function groupAggregate(card, group) {
    if (!group?.id || !Array.isArray(group.variants) || !group.variants.length) return null;
    const aggregateId = `phase8a:${group.id}`;
    const poster = posterFor(card) || group.variants.find(variant => variant.poster)?.poster || null;
    const variantModels = [];

    group.variants.forEach((variant, index) => {
      const sourceIds = variantSourceIds(variant);
      const providerCount = PROVIDERS.filter(provider => sourceIds[provider]).length;
      if (!providerCount) return;
      const matchId = `${aggregateId}:variant:${index + 1}`;
      const providerEntries = Object.fromEntries(PROVIDERS.map(provider => {
        if (!sourceIds[provider]) return [provider, null];
        const extras = provider === "broadway"
          ? {
              movieId: variant.broadwayMovieId || null,
              poster: variant.poster || poster
            }
          : {};
        return [provider, providerEntry(provider, sourceIds[provider], extras)];
      }));
      const record = {
        id: matchId,
        title: group.title,
        normalizedTitle: String(group.title || "").normalize("NFKC").toLowerCase(),
        matchType: "normalized-variant",
        confidence: 1,
        sessionCriteria: variant.sessionCriteria || null,
        comparisonOnlyProviders: variant.comparisonMclSourceId ? ["mcl"] : [],
        ...providerEntries
      };
      registerMatch(record);
      variantModels.push({
        id: `${aggregateId}:model:${index + 1}`,
        matchId,
        label: variantLabel(variant),
        tags: unique(variant.tags || []),
        providerCount,
        sourceIds,
        releaseDate: variant.releaseDate || null
      });
    });

    if (!variantModels.length) return null;
    const primary = variantModels.slice().sort((left, right) => (
      right.providerCount - left.providerCount ||
      left.tags.length - right.tags.length ||
      left.label.localeCompare(right.label, "zh-HK", { numeric: true, sensitivity: "base" })
    ))[0];
    const primaryRecord = aggregateRecords.get(primary.matchId);
    const aggregateMatch = {
      ...primaryRecord,
      id: aggregateId,
      title: group.title,
      matchType: "movie-aggregate",
      confidence: 1,
      aggregateId
    };
    registerMatch(aggregateMatch);

    const sourcePriority = [
      primary.sourceIds,
      ...variantModels.filter(variant => variant !== primary).map(variant => variant.sourceIds)
    ];
    const aggregate = {
      kind: "movie-aggregate",
      schemaVersion: 1,
      id: aggregateId,
      title: {
        display: group.title,
        secondary: secondaryTitleFor(card)
      },
      posterUrl: poster,
      facts: factsFromSourceSets(
        sourcePriority,
        card.dataset.homeReleaseDate || primary.releaseDate || variantModels.map(variant => variant.releaseDate).find(Boolean)
      ),
      providerCount: PROVIDERS.filter(provider => variantModels.some(variant => variant.sourceIds[provider])).length,
      sources: Object.fromEntries(PROVIDERS.map(provider => [
        provider,
        unique(variantModels.map(variant => variant.sourceIds[provider]))
      ])),
      variants: variantModels,
      primaryMatchId: primary.matchId
    };
    aggregates.set(aggregateId, aggregate);
    return aggregate;
  }

  function aggregateForCard(card) {
    if (!card) return null;
    const existingId = card.dataset.phase8aAggregateId;
    if (existingId && aggregates.has(existingId)) return aggregates.get(existingId);

    const groupId = card.dataset.movieGroupId;
    const group = groupId ? window.HKCinemaMovieGroups?.get?.(groupId) : null;
    const aggregate = group ? groupAggregate(card, group) : simpleAggregate(card);
    if (aggregate) card.dataset.phase8aAggregateId = aggregate.id;
    return aggregate;
  }

  function decorateCard(card) {
    if (!card || card.classList.contains("movie-group-member")) return;
    const aggregate = aggregateForCard(card);
    if (!aggregate) return;
    card.classList.add("phase8a-movie-card");
    card.dataset.phase8aDirectCompare = "true";
    card.setAttribute("role", "button");
    if (!card.hasAttribute("tabindex")) card.tabIndex = 0;
    card.setAttribute("aria-label", `查看 ${aggregate.title.display} 電影資料及場次`);
  }

  function refreshHome() {
    scheduled = false;
    document.querySelectorAll("#movieGrid .movie-card:not(.movie-group-member)").forEach(decorateCard);
  }

  function scheduleHomeRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refreshHome);
  }

  function openCard(card) {
    const aggregate = aggregateForCard(card);
    if (!aggregate) return false;
    window.HKCinemaHomeLibrary?.recordCard?.(card);
    return window.HKCinemaProviderCompare?.open?.(aggregate.id) !== false;
  }

  window.HKCinemaProviderMatches = {
    get(id) {
      return aggregateRecords.get(String(id)) || baseRegistry.get?.(id) || null;
    },
    all() {
      const merged = new Map();
      for (const record of baseRegistry.all?.() || []) merged.set(record.id, record);
      for (const record of aggregateRecords.values()) merged.set(record.id, record);
      return Array.from(merged.values());
    }
  };

  window.HKCinemaMovieAggregates = Object.freeze({
    version: "m6c-3",
    get(id) {
      return aggregates.get(String(id)) || null;
    },
    all() {
      return Array.from(aggregates.values());
    },
    forCard(card) {
      return aggregateForCard(card);
    },
    refresh() {
      scheduleHomeRefresh();
    }
  });

  window.addEventListener("click", event => {
    if (event.button !== 0 || event.target.closest?.("[data-movie-favorite]")) return;
    const card = event.target.closest?.("#movieGrid .movie-card:not(.movie-group-member)");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openCard(card);
  }, true);

  window.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest?.("[data-movie-favorite]")) return;
    const card = event.target.closest?.("#movieGrid .movie-card:not(.movie-group-member)");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openCard(card);
  }, true);

  window.addEventListener("hkcinema:provider-matches", scheduleHomeRefresh);

  const observer = new MutationObserver(records => {
    if (records.some(record => record.target?.closest?.("#movieGrid") || record.target?.id === "movieGrid")) {
      scheduleHomeRefresh();
    }
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });

  scheduleHomeRefresh();
})();
