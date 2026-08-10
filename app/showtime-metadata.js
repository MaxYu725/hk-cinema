(() => {
  const LANGUAGE_DEFINITIONS = Object.freeze([
    { key: "cantonese", label: "粵語", pattern: /(?:粵語|廣東話|cantonese|canto)/i },
    { key: "english", label: "英語", pattern: /(?:英語|英文|english)/i },
    { key: "japanese", label: "日語", pattern: /(?:日語|日文|日本語|japanese)/i },
    { key: "mandarin", label: "國語", pattern: /(?:國語|普通話|華語|mandarin|putonghua)/i },
    { key: "korean", label: "韓語", pattern: /(?:韓語|韓文|korean)/i },
    { key: "thai", label: "泰語", pattern: /(?:泰語|泰文|thai)/i },
    { key: "french", label: "法語", pattern: /(?:法語|法文|french)/i },
    { key: "german", label: "德語", pattern: /(?:德語|德文|german)/i },
    { key: "spanish", label: "西班牙語", pattern: /(?:西班牙語|西班牙文|spanish)/i },
    { key: "hindi", label: "印地語", pattern: /(?:印地語|印度語|hindi)/i },
    { key: "original", label: "原聲", pattern: /(?:原聲|original\s*(?:language|version)?)/i }
  ]);

  const SUBTITLE_DEFINITIONS = Object.freeze([
    { key: "chinese", label: "中文字幕", pattern: /(?:中文字幕|中文|中字|繁體|簡體|chinese)/i },
    { key: "english", label: "英文字幕", pattern: /(?:英文字幕|英文|英字|english)/i },
    { key: "japanese", label: "日文字幕", pattern: /(?:日文字幕|日文|日字|japanese)/i },
    { key: "none", label: "無字幕", pattern: /(?:無字幕|沒有字幕|沒有|none|no\s*subtitles?)/i }
  ]);

  const FORMAT_DEFINITIONS = Object.freeze([
    { key: "imax-laser", label: "IMAX with Laser", pattern: /IMAX(?:\s*2D|\s*3D)?\s+WITH\s+LASER/i },
    { key: "imax", label: "IMAX", pattern: /IMAX(?:\s*2D|\s*3D|\s+WITH\s+LASER)?/i },
    { key: "4dx", label: "4DX", pattern: /\b4DX\b/i },
    { key: "mx4d", label: "MX4D", pattern: /\bMX4D\b/i },
    { key: "d-box", label: "D-BOX", pattern: /\bD-?BOX\b/i },
    { key: "screenx", label: "SCREENX", pattern: /\bSCREENX\b/i },
    { key: "luxe", label: "LUXE", pattern: /\bLUXE\b/i },
    { key: "dolby", label: "Dolby Cinema", pattern: /(?:DOLBY|ATMOS|杜比)/i },
    { key: "35mm", label: "35mm", pattern: /(?:35\s*MM|35毫米|菲林)/i },
    { key: "4k", label: "4K", pattern: /\b4K\b/i },
    { key: "3d", label: "3D", pattern: /(?:^|[^A-Z0-9])3D(?:$|[^A-Z0-9])/i },
    { key: "2d", label: "2D", pattern: /(?:^|[^A-Z0-9])2D(?:$|[^A-Z0-9])/i }
  ]);

  const SUBTITLE_MARKER_PATTERN = /(?:字幕|(?:^|[\s·・|/])(?:中字|英字)(?=$|[\s·・|/])|\b(?:subtitles?|subs?)\b)/i;
  const NON_ORDINARY_VARIANT_PATTERN = /(?:期間限定|特典場|見面場|會員場|應援場|優先場|首映|導演版|加長版|映後談|舞台謝票|meet\s*(?:&|and)\s*greet|audio\s*description|descriptive\s*audio|relaxed\s*screening|sensory[-\s]*friendly|open\s*caption|special\s*screening|口述影像)/i;

  const LABELS = Object.freeze({
    language: Object.freeze(Object.fromEntries(LANGUAGE_DEFINITIONS.map(item => [item.key, item.label]))),
    subtitle: Object.freeze(Object.fromEntries(SUBTITLE_DEFINITIONS.map(item => [item.key, item.label]))),
    format: Object.freeze(Object.fromEntries(FORMAT_DEFINITIONS.map(item => [item.key, item.label])))
  });

  function values(value) {
    if (value === null || value === undefined || value === "") return [];
    return (Array.isArray(value) ? value : [value])
      .flatMap(item => String(item || "").split(/[、,，/;；]+/))
      .map(item => item.normalize("NFKC").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function definitionsFor(kind) {
    if (kind === "language") return LANGUAGE_DEFINITIONS;
    if (kind === "subtitle") return SUBTITLE_DEFINITIONS;
    if (kind === "format") return FORMAT_DEFINITIONS;
    return [];
  }

  function labelsFor(kind, keys) {
    const labels = LABELS[kind] || {};
    return unique((keys || []).map(key => labels[key] || key));
  }

  function matchDefinitions(kind, value) {
    const text = values(value).join(" · ");
    if (!text) return [];
    const matches = definitionsFor(kind)
      .filter(definition => definition.pattern.test(text))
      .map(definition => definition.key);

    // Premium formats already describe the presentation. Do not also classify
    // "IMAX 2D" or "4DX 3D" as ordinary 2D/3D sessions. Laser IMAX stays a
    // distinct facet instead of being collapsed back into generic IMAX.
    if (kind === "format") {
      const premium = matches.filter(key => !["2d", "3d"].includes(key));
      if (premium.includes("imax-laser")) {
        return unique(premium.filter(key => key !== "imax"));
      }
      if (premium.length) return unique(premium);
    }
    return unique(matches);
  }

  function splitEmbeddedSubtitles(value) {
    const source = (Array.isArray(value) ? value : [value])
      .map(item => String(item || "").normalize("NFKC"))
      .filter(Boolean);
    const languageParts = [];
    const subtitleParts = [];

    for (const item of source) {
      const compact = item.match(/(?:中文|英文|日文|繁體|簡體|Chinese|English|Japanese)\s*(?:字幕|subtitles?)\s*$/i);
      if (compact && compact.index !== undefined) {
        const before = item
          .slice(0, compact.index)
          .replace(/[\s·・|/:：-]+$/g, "")
          .trim();
        const subtitle = compact[0]
          .replace(/\s*(?:字幕|subtitles?)\s*$/i, "")
          .trim();
        if (before) languageParts.push(before);
        if (subtitle) subtitleParts.push(subtitle);
        continue;
      }
      const marker = item.match(/(?:^|[·・|]|\s)\s*字幕\s*[:：]?\s*/i);
      if (!marker || marker.index === undefined) {
        languageParts.push(item);
        continue;
      }
      const before = item.slice(0, marker.index).trim();
      const after = item.slice(marker.index + marker[0].length).trim();
      if (before) languageParts.push(before);
      if (after) subtitleParts.push(after);
    }
    return { languageParts, subtitleParts };
  }

  function normalizeSession(session = {}) {
    const embedded = splitEmbeddedSubtitles(session.languages ?? session.language);
    const fallbackVersion = [session.displayVersion, session.versionName].filter(Boolean);
    const embeddedFallback = splitEmbeddedSubtitles(fallbackVersion);
    const variantFallback = values(session._phase8cVariantTags);
    const variantLanguages = matchDefinitions("language", variantFallback);
    const variantSubtitles = matchDefinitions("subtitle", variantFallback.filter(tag => SUBTITLE_MARKER_PATTERN.test(tag)));
    const variantFormats = matchDefinitions("format", variantFallback);
    const explicitLanguage = embedded.languageParts.length
      ? embedded.languageParts
      : variantLanguages.length > 1 ? [] : embeddedFallback.languageParts;
    const explicitSubtitles = [
      ...values(session.subtitles ?? session.subtitle),
      ...embedded.subtitleParts,
      ...(variantSubtitles.length > 1 ? [] : embeddedFallback.subtitleParts)
    ];
    const suppliedFormat = session.format ?? session.formats;
    const explicitFormats = suppliedFormat !== null && suppliedFormat !== undefined && suppliedFormat !== ""
      ? suppliedFormat
      : variantFormats.length > 1 ? [] : fallbackVersion;

    const languages = matchDefinitions("language", explicitLanguage);
    const subtitles = matchDefinitions("subtitle", explicitSubtitles);
    const formats = matchDefinitions("format", explicitFormats);

    return {
      languages: languages.length ? languages : ["unknown"],
      subtitles: subtitles.length ? subtitles : ["unknown"],
      formats: formats.length ? formats : ["unknown"],
      languageLabels: languages.length ? labelsFor("language", languages) : ["語言未提供"],
      subtitleLabels: subtitles.length ? labelsFor("subtitle", subtitles) : ["字幕未提供"],
      formatLabels: formats.length ? labelsFor("format", formats) : []
    };
  }

  function criteriaFromVariant(tags = []) {
    const list = values(tags);
    const subtitleTags = list.filter(tag => SUBTITLE_MARKER_PATTERN.test(tag));
    const spokenLanguageTags = list.filter(tag => !SUBTITLE_MARKER_PATTERN.test(tag));
    const languages = matchDefinitions("language", spokenLanguageTags);
    const subtitles = matchDefinitions("subtitle", subtitleTags);
    const formats = matchDefinitions("format", list);
    const containsNonOrdinaryText = list.some(tag => NON_ORDINARY_VARIANT_PATTERN.test(tag));
    const recognized = list.every(tag => (
      SUBTITLE_MARKER_PATTERN.test(tag) ||
      matchDefinitions("language", tag).length > 0 ||
      matchDefinitions("format", tag).length > 0
    ));
    const nonOrdinaryFormats = formats.filter(format => format !== "2d");

    const bridgeEligible =
      list.length > 0 &&
      languages.length > 0 &&
      subtitleTags.length === 0 &&
      !containsNonOrdinaryText &&
      recognized &&
      nonOrdinaryFormats.length === 0;

    return {
      languages,
      // Language is the reliable bridge between an MCL MovieSet and the
      // provider-specific version cards. Format remains a user-selectable
      // session facet. Unknown presentation remains eligible because MCL may
      // omit "2D", but confirmed premium sessions must not enter an ordinary
      // language-version comparison.
      subtitles: [],
      formats: bridgeEligible ? ["unknown", "2d"] : [],
      detectedSubtitles: subtitles,
      detectedFormats: formats,
      bridgeEligible
    };
  }

  function isGenericBridgeSource(tags = []) {
    const list = values(tags);
    return list.length === 0 || (
      list.length === 1 && /^2D$/i.test(list[0])
    );
  }

  function hasIntersection(actual, expected) {
    if (!expected?.length) return true;
    const available = new Set(actual || []);
    return expected.some(value => available.has(value));
  }

  function matchesCriteria(metadata, criteria = {}) {
    if (!metadata) return false;
    return (
      hasIntersection(metadata.languages, criteria.languages) &&
      hasIntersection(metadata.subtitles, criteria.subtitles) &&
      hasIntersection(metadata.formats, criteria.formats)
    );
  }

  function criteriaStatus(session, criteria = {}) {
    const metadata = normalizeSession(session);
    const requiredFields = [
      [metadata.languages, criteria.languages],
      [metadata.subtitles, criteria.subtitles],
      [metadata.formats, criteria.formats]
    ].filter(([, expected]) => expected?.length);

    if (requiredFields.some(([actual, expected]) => (
      actual.includes("unknown") && !expected.includes("unknown")
    ))) {
      return "unknown";
    }
    return matchesCriteria(metadata, criteria) ? "match" : "mismatch";
  }

  function normalizedDates(values) {
    return Array.from(new Set((values || [])
      .map(value => String(value || "").slice(0, 10))
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))))
      .sort();
  }

  function selectedDateDecisionForCriteria(result = {}, criteria = {}) {
    const date = normalizedDates([result.selectedDate])[0] || null;
    if (!date || !Array.isArray(result.sessions) || !result.sessions.length) {
      return { date, status: "unknown" };
    }

    const statuses = result.sessions.map(session => criteriaStatus(session, criteria));
    if (statuses.some(status => status === "match")) return { date, status: "match" };
    if (statuses.every(status => status === "mismatch")) return { date, status: "mismatch" };
    return { date, status: "unknown" };
  }

  function candidateDatesForCriteria(result = {}, criteria = {}, rememberedDecisions = null) {
    const availableDates = normalizedDates(result.availableDates);
    const byDate = new Map(availableDates.map(date => [date, []]));

    for (const session of result.allSessions || []) {
      const date = normalizedDates([session?.date])[0];
      if (!date) continue;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(criteriaStatus(session, criteria));
    }

    const candidates = new Set();
    for (const [date, statuses] of byDate) {
      // Unknown dates stay selectable so the per-date request can enrich the
      // session language. Exclude only dates that are conclusively mismatched.
      if (!statuses.length || statuses.some(status => status !== "mismatch")) {
        candidates.add(date);
      }
    }

    const selectedDecision = selectedDateDecisionForCriteria(result, criteria);
    if (selectedDecision.status === "match") {
      candidates.add(selectedDecision.date);
    } else if (selectedDecision.status === "mismatch") {
      candidates.delete(selectedDecision.date);
    }

    const rememberedEntries = typeof rememberedDecisions?.entries === "function"
      ? Array.from(rememberedDecisions.entries())
      : Object.entries(rememberedDecisions || {});
    for (const [date, status] of rememberedEntries) {
      const normalizedDate = normalizedDates([date])[0];
      if (!normalizedDate) continue;
      if (status === "mismatch") candidates.delete(normalizedDate);
      if (status === "match" && byDate.has(normalizedDate)) candidates.add(normalizedDate);
    }

    return normalizedDates(Array.from(candidates));
  }

  window.HKCinemaShowtimeMetadata = Object.freeze({
    normalizeSession,
    criteriaFromVariant,
    isGenericBridgeSource,
    matchesCriteria,
    criteriaStatus,
    selectedDateDecisionForCriteria,
    candidateDatesForCriteria,
    labelsFor,
    labels: LABELS
  });
})();
