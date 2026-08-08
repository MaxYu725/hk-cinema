(() => {
  const VARIANT_QUALIFIER = /(?:日語|粵語|英語|國語|普通話|韓語|泰語|原聲|配音|字幕|無字幕|2D|3D|4DX|MX4D|IMAX|LUXE|SCREENX|D-?BOX|Dolby|杜比|35mm|菲林|4K|修復版|導演版|加長版|特典場|見面場|會員場|應援場)/i;
  const PREFIX_FORMAT = /^(?:(?:2D|3D|4DX|MX4D|IMAX(?:\s+with\s+Laser)?|LUXE|SCREENX|D-?BOX|Dolby\s+Cinema|35mm\s*菲林版|4K\s*修復版)\s*[:：·・-]?\s*)+/i;
  const TRAILING_VARIANT = /\s*(日語版|粵語版|英語版|國語版|普通話版|韓語版|泰語版|原聲版|配音版|中字版|無字幕版|字幕版|2D|3D|4DX|MX4D|IMAX(?:\s+with\s+Laser)?|LUXE|SCREENX|D-?BOX|Dolby\s+Cinema|35mm\s*菲林版|4K\s*修復版|導演版|加長版|特典場|見面場|會員場|應援場)\s*$/i;
  const DATE_QUALIFIER = /^\d{1,2}[.\/-]\d{1,2}(?:\s*[-–—]\s*\d{1,2}[.\/-]\d{1,2})?$/;

  function normalizeTitle(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[《》「」『』【】〔〕〈〉<>]/g, "")
      .replace(/[·・:：\-–—_.,，。!?！？'"`]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function cleanVariantLabel(value) {
    return String(value || "")
      .replace(/[()（）【】]/g, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+/g, " ");
  }

  function parseVariantTitle(value) {
    const original = String(value || "").trim();
    const tags = [];
    const addTag = valueToAdd => {
      const tag = cleanVariantLabel(valueToAdd);
      if (tag && !tags.some(item => normalizeTitle(item) === normalizeTitle(tag))) tags.push(tag);
    };

    let base = original.replace(/[（(]([^()（）]+)[）)]/g, (whole, content) => {
      const normalized = cleanVariantLabel(content);
      if (VARIANT_QUALIFIER.test(normalized) || DATE_QUALIFIER.test(normalized)) {
        addTag(normalized);
        return " ";
      }
      return whole;
    });

    const bookTitle = base.match(/^《(.+?)》\s*(.+)$/);
    if (bookTitle && VARIANT_QUALIFIER.test(bookTitle[2])) {
      base = bookTitle[1];
      addTag(bookTitle[2]);
    }

    const prefix = base.match(PREFIX_FORMAT)?.[0] || "";
    if (prefix) {
      addTag(prefix.replace(/[:：·・-]+\s*$/, ""));
      base = base.slice(prefix.length);
    }

    const trailingMatch = base.match(TRAILING_VARIANT);
    if (trailingMatch) {
      addTag(trailingMatch[1]);
      base = base.slice(0, base.length - trailingMatch[0].length);
    }

    base = base
      .replace(/^[《「【]\s*/, "")
      .replace(/\s*[》」】]\s*$/, "")
      .replace(/\s+/g, " ")
      .replace(/^[·・:：\-–—\s]+|[·・:：\-–—\s]+$/g, "")
      .trim();

    return {
      original,
      base: base || original,
      key: normalizeTitle(base || original),
      tags,
      hasVariant: tags.length > 0
    };
  }

  function filterMatches(cardProviders, selectedProviders) {
    const selected = Array.from(selectedProviders || []);
    if (!selected.length) return true;
    const available = new Set(Array.from(cardProviders || []));
    return selected.some(provider => available.has(provider));
  }

  function variantSignature(value) {
    const parsed = typeof value === "string" ? parseVariantTitle(value) : value || {};
    const tags = Array.from(parsed.tags || [])
      .map(normalizeTitle)
      .filter(Boolean)
      .sort();
    return tags.join("|") || "standard";
  }

  window.HKCinemaHomeDiscoveryCore = {
    normalizeTitle,
    parseVariantTitle,
    filterMatches,
    variantSignature
  };
})();
