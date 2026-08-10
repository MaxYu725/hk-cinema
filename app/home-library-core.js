(() => {
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

    if (mode === "title") return titleCompare;
    if (mode === "release-newest") {
      return String(right.releaseDate || "0000-00-00")
        .localeCompare(String(left.releaseDate || "0000-00-00")) || titleCompare;
    }
    if (mode === "release-soonest") {
      return String(left.releaseDate || "9999-12-31")
        .localeCompare(String(right.releaseDate || "9999-12-31")) || titleCompare;
    }
    if (mode === "recent") {
      return (Number(right.lastViewedAt) - Number(left.lastViewedAt)) || titleCompare;
    }
    if (mode === "favorites") {
      return (Number(right.favoritedAt) - Number(left.favoritedAt)) || titleCompare;
    }

    return Number(left.defaultOrder) - Number(right.defaultOrder);
  }

  window.HKCinemaHomeLibraryCore = Object.freeze({
    version: "8e3",
    normalizeSearchValue,
    searchMatches,
    compareItems
  });
})();