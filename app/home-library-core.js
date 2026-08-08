(() => {
  const FACET_DEFINITIONS = {
    language: [
      { key: "cantonese", label: "粵語", pattern: /粵語|廣東話|cantonese/i },
      { key: "japanese", label: "日語", pattern: /日語|日本語|japanese/i },
      { key: "english", label: "英語", pattern: /英語|英文版|english/i },
      { key: "mandarin", label: "國語", pattern: /國語|普通話|mandarin/i },
      { key: "korean", label: "韓語", pattern: /韓語|korean/i },
      { key: "thai", label: "泰語", pattern: /泰語|thai/i }
    ],
    format: [
      { key: "2d", label: "2D", pattern: /2d/i },
      { key: "3d", label: "3D", pattern: /3d/i },
      { key: "imax", label: "IMAX", pattern: /imax/i },
      { key: "4dx", label: "4DX", pattern: /4dx/i },
      { key: "mx4d", label: "MX4D", pattern: /mx4d/i },
      { key: "screenx", label: "SCREENX", pattern: /screenx/i },
      { key: "dbox", label: "D-BOX", pattern: /d\s*box/i },
      { key: "dolby", label: "Dolby", pattern: /dolby|杜比/i },
      { key: "luxe", label: "LUXE", pattern: /luxe/i },
      { key: "4k", label: "4K", pattern: /4k/i },
      { key: "35mm", label: "35mm", pattern: /35\s*mm/i }
    ]
  };

  function normalizeSearchValue(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[《》「」『』【】〔〕〈〉<>]/g, " ")
      .replace(/[·・:：\-–—_.,，。!?！？'"`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function searchMatches(values, query) {
    const normalizedQuery = normalizeSearchValue(query);
    if (!normalizedQuery) return true;

    const haystack = Array.from(values || [])
      .map(normalizeSearchValue)
      .filter(Boolean)
      .join(" ");
    const compactHaystack = haystack.replace(/\s+/g, "");

    return normalizedQuery.split(" ").filter(Boolean).every(token => (
      haystack.includes(token) || compactHaystack.includes(token.replace(/\s+/g, ""))
    ));
  }

  function compareItems(left, right, mode = "default") {
    const titleCompare = String(left.title || "").localeCompare(
      String(right.title || ""),
      "zh-HK",
      { numeric: true, sensitivity: "base" }
    );

    if (mode === "providers") {
      return (Number(right.providerCount) - Number(left.providerCount)) || titleCompare;
    }

    if (mode === "title") return titleCompare;
    if (mode === "recent") {
      return (Number(right.lastViewedAt) - Number(left.lastViewedAt)) || titleCompare;
    }
    if (mode === "favorites") {
      return (Number(right.favoritedAt) - Number(left.favoritedAt)) || titleCompare;
    }

    return Number(left.defaultOrder) - Number(right.defaultOrder);
  }

  function extractFacets(values) {
    const haystack = Array.from(values || [])
      .map(value => String(value || ""))
      .filter(Boolean)
      .join(" ");
    return Object.fromEntries(Object.entries(FACET_DEFINITIONS).map(([category, definitions]) => [
      category,
      definitions.filter(definition => definition.pattern.test(haystack)).map(definition => definition.key)
    ]));
  }

  function facetMatches(cardFacets, selectedFacets) {
    return Object.keys(FACET_DEFINITIONS).every(category => {
      const selected = Array.from(selectedFacets?.[category] || []);
      if (!selected.length) return true;
      const available = new Set(cardFacets?.[category] || []);
      return selected.some(value => available.has(value));
    });
  }

  window.HKCinemaHomeLibraryCore = {
    normalizeSearchValue,
    searchMatches,
    compareItems,
    extractFacets,
    facetMatches,
    facetDefinitions: Object.fromEntries(Object.entries(FACET_DEFINITIONS).map(([category, definitions]) => [
      category,
      definitions.map(({ key, label }) => ({ key, label }))
    ]))
  };
})();
