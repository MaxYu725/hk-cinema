(() => {
  const PROVIDERS = ["broadway", "mcl", "emperor"];
  const PROVIDER_LABELS = {
    broadway: "Broadway",
    mcl: "MCL",
    emperor: "Emperor"
  };

  const baseRegistry = window.HKCinemaProviderMatches || {
    get() { return null; },
    all() { return []; }
  };
  const aggregateRecords = new Map();
  const aggregates = new Map();
  const matchToAggregate = new Map();
  let scheduled = false;
  let compareScheduled = false;

  function normalizeSourceId(provider, value) {
    return String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
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

  function providerSourceIdsFromCard(card) {
    const isMCLOnly = card?.classList?.contains("mcl-only-card");
    const isEmperorOnly = card?.classList?.contains("emperor-only-card");
    const directSourceId = String(card?.dataset?.sourceId || "").trim();
    return {
      broadway: normalizeSourceId("broadway", card?.dataset?.broadwaySourceId || (!isMCLOnly && !isEmperorOnly ? directSourceId : "")),
      mcl: normalizeSourceId("mcl", card?.dataset?.mclSourceId || (isMCLOnly ? directSourceId : "")),
      emperor: normalizeSourceId("emperor", card?.dataset?.emperorSourceId || (isEmperorOnly ? directSourceId : ""))
    };
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

  function registerMatch(record, aggregateId) {
    if (!record?.id) return null;
    aggregateRecords.set(record.id, record);
    if (aggregateId) matchToAggregate.set(record.id, aggregateId);
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
    const record = {
      id,
      title,
      normalizedTitle: baseMatch?.normalizedTitle || title.normalize("NFKC").toLowerCase(),
      matchType: "movie-aggregate",
      confidence: baseMatch?.confidence ?? 1,
      sessionCriteria: baseMatch?.sessionCriteria || null,
      comparisonOnlyProviders: [...(baseMatch?.comparisonOnlyProviders || [])],
      broadway: sourceIds.broadway
        ? providerEntry("broadway", sourceIds.broadway, {
            movieId: card.dataset.movieId || baseMatch?.broadway?.movieId || null,
            poster: poster || baseMatch?.broadway?.poster || null
          })
        : null,
      mcl: sourceIds.mcl ? providerEntry("mcl", sourceIds.mcl) : null,
      emperor: sourceIds.emperor ? providerEntry("emperor", sourceIds.emperor) : null
    };

    registerMatch(record, id);
    const aggregate = {
      kind: "movie-aggregate",
      schemaVersion: 1,
      id,
      title: {
        display: title,
        secondary: secondaryTitleFor(card)
      },
      posterUrl: poster,
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
    return {
      broadway: normalizeSourceId("broadway", variant?.broadwaySourceId),
      mcl: normalizeSourceId("mcl", variant?.mclSourceId || variant?.comparisonMclSourceId),
      emperor: normalizeSourceId("emperor", variant?.emperorSourceId)
    };
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
      const record = {
        id: matchId,
        title: group.title,
        normalizedTitle: String(group.title || "").normalize("NFKC").toLowerCase(),
        matchType: "normalized-variant",
        confidence: 1,
        sessionCriteria: variant.sessionCriteria || null,
        comparisonOnlyProviders: variant.comparisonMclSourceId ? ["mcl"] : [],
        broadway: sourceIds.broadway
          ? providerEntry("broadway", sourceIds.broadway, {
              movieId: variant.broadwayMovieId || null,
              poster: variant.poster || poster
            })
          : null,
        mcl: sourceIds.mcl ? providerEntry("mcl", sourceIds.mcl) : null,
        emperor: sourceIds.emperor ? providerEntry("emperor", sourceIds.emperor) : null
      };
      registerMatch(record, aggregateId);
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
    registerMatch(aggregateMatch, aggregateId);

    const aggregate = {
      kind: "movie-aggregate",
      schemaVersion: 1,
      id: aggregateId,
      title: {
        display: group.title,
        secondary: secondaryTitleFor(card)
      },
      posterUrl: poster,
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

  function activeAggregateContext() {
    const currentMatchId = window.HKCinemaProviderCompare?.getState?.()?.match?.id;
    if (!currentMatchId) return null;
    const aggregateId = matchToAggregate.get(currentMatchId) || (aggregates.has(currentMatchId) ? currentMatchId : null);
    if (!aggregateId) return null;
    return {
      aggregate: aggregates.get(aggregateId),
      currentMatchId
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function decorateCompare() {
    compareScheduled = false;
    const root = document.querySelector("#providerCompareContent");
    const hero = root?.querySelector(".provider-compare-hero");
    if (!root || !hero) return;
    root.querySelector("[data-phase8a-version-rail]")?.remove();

    const context = activeAggregateContext();
    if (!context?.aggregate || context.aggregate.variants.length < 2) return;
    const { aggregate, currentMatchId } = context;
    const activeMatchId = currentMatchId === aggregate.id ? aggregate.primaryMatchId : currentMatchId;
    const rail = document.createElement("section");
    rail.className = "phase8a-version-rail";
    rail.dataset.phase8aVersionRail = "true";
    rail.setAttribute("aria-label", "電影版本");
    rail.innerHTML = `
      <div class="phase8a-version-heading">
        <strong>版本</strong>
        <span>${aggregate.variants.length} 個放映版本</span>
      </div>
      <div class="phase8a-version-options">
        ${aggregate.variants.map(variant => `
          <button
            type="button"
            data-phase8a-variant-open="${escapeHtml(variant.matchId)}"
            class="${variant.matchId === activeMatchId ? "active" : ""}"
            aria-pressed="${variant.matchId === activeMatchId}"
          >
            <strong>${escapeHtml(variant.label)}</strong>
            <span>${variant.providerCount} 院線</span>
          </button>
        `).join("")}
      </div>
    `;
    hero.insertAdjacentElement("afterend", rail);
  }

  function scheduleCompareRefresh() {
    if (compareScheduled) return;
    compareScheduled = true;
    requestAnimationFrame(decorateCompare);
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
    version: "8a1",
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
    const variantButton = event.target.closest?.("[data-phase8a-variant-open]");
    if (variantButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.HKCinemaProviderCompare?.open?.(variantButton.dataset.phase8aVariantOpen);
      return;
    }

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

  window.addEventListener("hkcinema:provider-matches", () => {
    scheduleHomeRefresh();
  });
  window.addEventListener("hkcinema:provider-compare-open", scheduleCompareRefresh);
  window.addEventListener("hkcinema:provider-compare-lifecycle", scheduleCompareRefresh);

  const observer = new MutationObserver(records => {
    if (records.some(record => record.target?.closest?.("#movieGrid") || record.target?.id === "movieGrid")) {
      scheduleHomeRefresh();
    }
    if (records.some(record => record.target?.closest?.("#providerCompareContent") || record.target?.id === "providerCompareContent")) {
      scheduleCompareRefresh();
    }
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });

  window.HKCinemaHomeProviderFilters?.clear?.();
  scheduleHomeRefresh();
})();
