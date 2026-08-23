(() => {
  const sharedCore = window.HKCinemaProviderSharedCore || null;
  const store = window.HKCinemaCatalogueStore || null;
  const discovery = window.HKCinemaHomeDiscoveryCore || null;
  const PROVIDERS = Object.freeze(sharedCore?.providers?.() || []);
  const PROVIDER_IDS = Object.freeze(PROVIDERS.map(provider => provider.key));
  const providerOrder = new Map(PROVIDER_IDS.map((provider, index) => [provider, index]));
  const matchRecords = new Map();
  const groupRecords = new Map();
  const aggregateRecords = new Map();
  let lastModel = null;

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function normalizeSourceId(provider, value) {
    return sharedCore?.normalizeSourceId?.(provider, value) ||
      String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
  }

  function values(value) {
    const source = Array.isArray(value) ? value : [value];
    return unique(source
      .flatMap(item => String(item || "").split(/[、,，/;；]+/))
      .map(item => item.trim())
      .filter(Boolean));
  }

  function titleParts(movie) {
    const title = movie?.title;
    const zh = typeof title === "object"
      ? title?.zh || movie?.name?.zh || movie?.filmName || null
      : title || movie?.filmName || null;
    const en = typeof title === "object"
      ? title?.en || movie?.name?.en || movie?.filmEnName || null
      : movie?.filmEnName || null;
    const display = String(zh || en || "未命名電影").trim();
    return {
      zh: zh ? String(zh).trim() : null,
      en: en ? String(en).trim() : null,
      display,
      secondary: en && String(en).trim() !== display ? String(en).trim() : null
    };
  }

  function normalizedReleaseDate(value) {
    const match = String(value || "").trim().match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }

  function entry(provider, movie, index, sequence) {
    const sourceId = normalizeSourceId(provider, movie?.sourceId || movie?.id);
    if (!sourceId) return null;
    const title = titleParts(movie);
    const normalizedTitle = discovery?.normalizeTitle?.(title.display) || title.display.normalize("NFKC").toLowerCase();
    if (!normalizedTitle) return null;
    return {
      provider,
      providerIndex: providerOrder.get(provider) ?? Number.MAX_SAFE_INTEGER,
      sourceId,
      movie,
      title,
      normalizedTitle,
      parsed: discovery?.parseVariantTitle?.(title.display) || {
        original: title.display,
        base: title.display,
        key: normalizedTitle,
        tags: [],
        hasVariant: false
      },
      index,
      sequence
    };
  }

  function itemScore(item) {
    const movie = item?.movie || {};
    return (
      (item?.title?.zh ? 16 : 0) +
      (movie.poster || movie.posterUrl ? 8 : 0) +
      (item?.title?.en ? 4 : 0) +
      (normalizedReleaseDate(movie.releaseDate || movie.openingDate) ? 2 : 0) +
      (movie.rating || movie.classification || movie.durationMinutes || movie.duration ? 1 : 0)
    );
  }

  function primaryItem(items) {
    return [...(items || [])].sort((left, right) => (
      itemScore(right) - itemScore(left) ||
      left.providerIndex - right.providerIndex ||
      left.sequence - right.sequence
    ))[0] || null;
  }

  function sourceIdsFor(items) {
    const sourceIds = Object.fromEntries(PROVIDER_IDS.map(provider => [provider, null]));
    for (const item of items || []) {
      if (!sourceIds[item.provider]) sourceIds[item.provider] = item.sourceId;
    }
    return sourceIds;
  }

  function findMovie(provider, sourceId) {
    const normalized = normalizeSourceId(provider, sourceId);
    if (!normalized) return null;
    const catalogue = store?.catalogue?.(provider);
    for (const movie of [
      ...(catalogue?.now || []),
      ...(catalogue?.coming || []),
      ...(catalogue?.festival || []),
      ...(catalogue?.presale || [])
    ]) {
      if (normalizeSourceId(provider, movie?.sourceId || movie?.id) === normalized) return movie;
    }
    return null;
  }

  function providerEntry(provider, sourceId) {
    const normalized = normalizeSourceId(provider, sourceId);
    if (!normalized) return null;
    const movie = findMovie(provider, normalized);
    return {
      provider,
      sourceId: normalized,
      movieId: movie?.id || null,
      movie,
      poster: movie?.poster || movie?.posterUrl || null
    };
  }

  function recordFromSources({ id, title, sourceIds, matchType, confidence = 1, sessionCriteria = null, comparisonOnlyProviders = [] }) {
    const entries = Object.fromEntries(PROVIDER_IDS.map(provider => [
      provider,
      sourceIds?.[provider] ? providerEntry(provider, sourceIds[provider]) : null
    ]));
    const record = {
      id,
      title,
      normalizedTitle: discovery?.normalizeTitle?.(title) || String(title || "").normalize("NFKC").toLowerCase(),
      matchType,
      confidence,
      sessionCriteria,
      comparisonOnlyProviders: [...comparisonOnlyProviders],
      ...entries
    };
    matchRecords.set(id, record);
    return record;
  }

  function releaseDateFor(items, section) {
    const dates = unique((items || [])
      .map(item => normalizedReleaseDate(item?.movie?.releaseDate || item?.movie?.openingDate)))
      .sort();
    return section === "coming" ? dates[0] || null : dates.at(-1) || null;
  }

  function factsFor(items, section) {
    const primary = primaryItem(items);
    const ordered = primary ? [primary, ...(items || []).filter(item => item !== primary)] : [...(items || [])];
    const classification = ordered
      .map(item => String(item?.movie?.rating || item?.movie?.classification || "").trim())
      .find(Boolean) || null;
    const durationMinutes = ordered
      .map(item => Number(item?.movie?.durationMinutes ?? item?.movie?.duration))
      .find(value => Number.isFinite(value) && value > 0) || null;
    return {
      classification,
      durationMinutes,
      releaseDate: releaseDateFor(items, section)
    };
  }

  function isPresale(items) {
    return (items || []).some(item => {
      const catalogue = store?.catalogue?.(item.provider);
      return [...(catalogue?.presale || []), ...(catalogue?.now || []).filter(movie => movie?.status === "presale")]
        .some(movie => normalizeSourceId(item.provider, movie?.sourceId || movie?.id) === item.sourceId);
    });
  }

  function homeMetadata(items, section, sourceIds) {
    const primary = primaryItem(items);
    const facts = factsFor(items, section);
    return {
      sourceIds: { ...sourceIds },
      primaryProvider: primary?.provider || PROVIDER_IDS.find(provider => sourceIds?.[provider]) || null,
      primarySourceId: primary?.sourceId || null,
      movieId: primary?.movie?.id || null,
      posterUrl: primary?.movie?.poster || primary?.movie?.posterUrl ||
        (items || []).map(item => item?.movie?.poster || item?.movie?.posterUrl).find(Boolean) || null,
      secondaryTitle: primary?.title?.secondary || null,
      bookingUrl: primary?.movie?.bookingUrl || null,
      languages: unique((items || []).flatMap(item => values(item?.movie?.language || item?.movie?.languages))),
      formats: unique((items || []).flatMap(item => values(item?.movie?.formats || item?.movie?.format))),
      releaseDate: facts.releaseDate,
      presale: section === "coming" && isPresale(items),
      facts
    };
  }

  function exactCandidates(section) {
    const byTitle = new Map();
    let sequence = 0;
    for (const value of store?.entries?.(section) || []) {
      if (section === "now" && value.movie?.status === "presale") continue;
      const item = entry(value.provider, value.movie, value.index, sequence++);
      if (!item) continue;
      const candidates = byTitle.get(item.normalizedTitle) || [];
      let candidate = candidates.find(current => !current.providers.has(item.provider));
      if (!candidate) {
        candidate = {
          key: item.normalizedTitle,
          items: [],
          providers: new Set(),
          order: item.sequence
        };
        candidates.push(candidate);
        byTitle.set(item.normalizedTitle, candidates);
      }
      candidate.items.push(item);
      candidate.providers.add(item.provider);
    }

    return Array.from(byTitle.values()).flat().map(candidate => {
      const primary = primaryItem(candidate.items);
      return {
        ...candidate,
        primary,
        title: primary?.title?.display || "未命名電影",
        parsed: primary?.parsed || null,
        sourceIds: sourceIdsFor(candidate.items)
      };
    }).sort((left, right) => left.order - right.order);
  }

  function providerCount(sourceIds) {
    return PROVIDER_IDS.filter(provider => Boolean(sourceIds?.[provider])).length;
  }

  function simpleAggregate(candidate, section) {
    const components = PROVIDER_IDS
      .filter(provider => candidate.sourceIds[provider])
      .map(provider => `${provider}:${candidate.sourceIds[provider]}`);
    if (!components.length) return null;
    const id = `phase8a:movie:${components.join("|")}`;
    const match = recordFromSources({
      id,
      title: candidate.title,
      sourceIds: candidate.sourceIds,
      matchType: "movie-aggregate"
    });
    const home = homeMetadata(candidate.items, section, candidate.sourceIds);
    const aggregate = {
      kind: "movie-aggregate",
      schemaVersion: 1,
      id,
      title: { display: candidate.title, secondary: home.secondaryTitle },
      posterUrl: home.posterUrl,
      facts: home.facts,
      providerCount: providerCount(candidate.sourceIds),
      sources: Object.fromEntries(PROVIDER_IDS.map(provider => [
        provider,
        candidate.sourceIds[provider] ? [candidate.sourceIds[provider]] : []
      ])),
      variants: [{
        id: `${id}:default`,
        matchId: id,
        label: "一般版本",
        tags: [],
        providerCount: providerCount(candidate.sourceIds),
        sourceIds: { ...candidate.sourceIds },
        releaseDate: home.releaseDate
      }],
      primaryMatchId: match.id,
      groupId: null,
      order: candidate.order,
      home
    };
    aggregateRecords.set(id, aggregate);
    return aggregate;
  }

  function coalesceVariants(candidates) {
    const bySignature = new Map();
    for (const candidate of candidates) {
      const signature = discovery?.variantSignature?.(candidate.parsed) || "standard";
      if (!bySignature.has(signature)) {
        bySignature.set(signature, {
          signature,
          items: [],
          tags: [],
          sourceIds: Object.fromEntries(PROVIDER_IDS.map(provider => [provider, null])),
          order: candidate.order
        });
      }
      const combined = bySignature.get(signature);
      combined.items.push(...candidate.items);
      combined.tags = unique([...combined.tags, ...(candidate.parsed?.tags || [])]);
      combined.order = Math.min(combined.order, candidate.order);
      for (const provider of PROVIDER_IDS) {
        if (!combined.sourceIds[provider] && candidate.sourceIds[provider]) {
          combined.sourceIds[provider] = candidate.sourceIds[provider];
        }
      }
    }
    return Array.from(bySignature.values()).sort((left, right) => left.order - right.order);
  }

  function groupAggregate(candidates, section) {
    const key = candidates[0]?.parsed?.key;
    if (!key) return null;
    const groupId = `versions:${key}`;
    const aggregateId = `phase8a:${groupId}`;
    const title = candidates
      .map(candidate => candidate.parsed?.base)
      .filter(Boolean)
      .sort((left, right) => left.length - right.length)[0] || candidates[0].title;
    const variants = coalesceVariants(candidates);
    const genericMCL = variants.find(variant => (
      variant.sourceIds.mcl && window.HKCinemaShowtimeMetadata?.isGenericBridgeSource?.(variant.tags)
    ));

    const variantModels = variants.map((variant, index) => {
      const criteria = window.HKCinemaShowtimeMetadata?.criteriaFromVariant?.(variant.tags) || null;
      let comparisonMclSourceId = null;
      let sessionCriteria = null;
      if (!variant.sourceIds.mcl && genericMCL?.sourceIds?.mcl && criteria?.bridgeEligible) {
        comparisonMclSourceId = genericMCL.sourceIds.mcl;
        variant.sourceIds.mcl = comparisonMclSourceId;
        sessionCriteria = {
          languages: [...criteria.languages],
          subtitles: [],
          formats: [...criteria.formats]
        };
      }
      const matchId = `${aggregateId}:variant:${index + 1}`;
      recordFromSources({
        id: matchId,
        title,
        sourceIds: variant.sourceIds,
        matchType: "normalized-variant",
        sessionCriteria,
        comparisonOnlyProviders: comparisonMclSourceId ? ["mcl"] : []
      });
      return {
        id: `${aggregateId}:model:${index + 1}`,
        title: variant.tags.length ? `${title}（${variant.tags.join(" · ")}）` : title,
        matchId,
        label: variant.tags.length ? variant.tags.join(" · ") : "一般版本",
        tags: [...variant.tags],
        languages: unique(variant.items.flatMap(item => values(item?.movie?.language || item?.movie?.languages))),
        formats: unique(variant.items.flatMap(item => values(item?.movie?.formats || item?.movie?.format))),
        providerCount: providerCount(variant.sourceIds),
        sourceIds: { ...variant.sourceIds },
        releaseDate: releaseDateFor(variant.items, section),
        sessionCriteria,
        comparisonMclSourceId,
        items: variant.items
      };
    }).filter(variant => variant.providerCount > 0);
    if (!variantModels.length) return null;

    const primary = [...variantModels].sort((left, right) => (
      right.providerCount - left.providerCount ||
      left.tags.length - right.tags.length ||
      left.label.localeCompare(right.label, "zh-HK", { numeric: true, sensitivity: "base" })
    ))[0];
    const primaryRecord = matchRecords.get(primary.matchId);
    matchRecords.set(aggregateId, {
      ...primaryRecord,
      id: aggregateId,
      title,
      matchType: "movie-aggregate",
      aggregateId
    });

    const allItems = candidates.flatMap(candidate => candidate.items);
    const allSources = Object.fromEntries(PROVIDER_IDS.map(provider => [
      provider,
      unique(variantModels.map(variant => variant.sourceIds[provider]))
    ]));
    const home = homeMetadata(allItems, section, primary.sourceIds);
    const aggregate = {
      kind: "movie-aggregate",
      schemaVersion: 1,
      id: aggregateId,
      title: { display: title, secondary: home.secondaryTitle },
      posterUrl: home.posterUrl,
      facts: home.facts,
      providerCount: PROVIDER_IDS.filter(provider => allSources[provider].length > 0).length,
      sources: allSources,
      variants: variantModels.map(({ items, ...variant }) => variant),
      primaryMatchId: primary.matchId,
      groupId,
      order: Math.min(...candidates.map(candidate => candidate.order)),
      home
    };
    aggregateRecords.set(aggregateId, aggregate);
    groupRecords.set(groupId, {
      id: groupId,
      title,
      providers: PROVIDERS
        .filter(provider => allSources[provider.key].length > 0)
        .map(provider => provider.label),
      variants: aggregate.variants
    });
    return aggregate;
  }

  function build(section = "now") {
    const activeSection = section === "coming" ? "coming" : "now";
    matchRecords.clear();
    groupRecords.clear();
    aggregateRecords.clear();

    const candidates = exactCandidates(activeSection);
    const byBase = new Map();
    for (const candidate of candidates) {
      const key = candidate.parsed?.key;
      if (!key) continue;
      if (!byBase.has(key)) byBase.set(key, []);
      byBase.get(key).push(candidate);
    }

    const consumed = new Set();
    const aggregates = [];
    for (const groupCandidates of byBase.values()) {
      if (groupCandidates.length < 2 || !groupCandidates.some(candidate => candidate.parsed?.hasVariant)) continue;
      const aggregate = groupAggregate(groupCandidates, activeSection);
      if (!aggregate) continue;
      groupCandidates.forEach(candidate => consumed.add(candidate));
      aggregates.push(aggregate);
    }
    for (const candidate of candidates) {
      if (consumed.has(candidate)) continue;
      const aggregate = simpleAggregate(candidate, activeSection);
      if (aggregate) aggregates.push(aggregate);
    }
    aggregates.sort((left, right) => left.order - right.order);

    const summary = store?.summary?.(activeSection) || {
      section: activeSection,
      total: PROVIDERS.length,
      usable: 0,
      failed: 0,
      loading: PROVIDERS.length,
      fallback: 0,
      states: []
    };
    lastModel = {
      section: activeSection,
      aggregates,
      summary,
      crossProviderCount: aggregates.filter(aggregate => aggregate.providerCount > 1).length,
      maxProviderCount: aggregates.reduce((max, aggregate) => Math.max(max, aggregate.providerCount), 0)
    };
    return lastModel;
  }

  const registryApi = records => Object.freeze({
    get(id) {
      return records.get(String(id)) || null;
    },
    all() {
      return Array.from(records.values());
    }
  });

  window.HKCinemaProviderMatches = registryApi(matchRecords);
  window.HKCinemaMovieGroups = registryApi(groupRecords);
  window.HKCinemaMovieAggregates = Object.freeze({
    version: "c3-1",
    get(id) {
      return aggregateRecords.get(String(id)) || null;
    },
    all() {
      return Array.from(aggregateRecords.values());
    },
    forCard(card) {
      const id = card?.dataset?.movieAggregateId;
      return id ? aggregateRecords.get(String(id)) || null : null;
    },
    refresh() {
      window.HKCinemaMultiProvider?.refresh?.();
    }
  });
  window.HKCinemaCatalogueDomain = Object.freeze({
    version: "c3-1",
    build,
    getModel() {
      return lastModel;
    }
  });
})();
