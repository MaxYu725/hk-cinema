(() => {
  const VARIANT_QUALIFIER = /(?:日語|粵語|英語|國語|普通話|韓語|泰語|原聲|配音|字幕|無字幕|期間限定|Japanese(?:\s+Version)?|Cantonese(?:\s+Version)?|English(?:\s+Version)?|Mandarin(?:\s+Version)?|Korean(?:\s+Version)?|Thai(?:\s+Version)?|Dubbed|Subtitled|Meet\s*&\s*Greet|2D|3D|4DX|MX4D|IMAX|LUXE|SCREENX|D-?BOX|Dolby|杜比|35mm|菲林|4K|修復版|導演版|加長版|特典場|見面場|會員場|應援場)/i;
  const PREFIX_FORMAT = /^(?:(?:2D|3D|4DX|MX4D|IMAX(?:\s+with\s+Laser)?|LUXE|SCREENX|D-?BOX|Dolby\s+Cinema|35mm\s*菲林版|4K\s*修復版)\s*[:：·・-]?\s*)+/i;
  const TRAILING_VARIANT = /\s*(日語版|粵語版|英語版|國語版|普通話版|韓語版|泰語版|原聲版|配音版|中字版|無字幕版|字幕版|Japanese(?:\s+Version)?|Cantonese(?:\s+Version)?|English(?:\s+Version)?|Mandarin(?:\s+Version)?|Korean(?:\s+Version)?|Thai(?:\s+Version)?|Dubbed|Subtitled|2D|3D|4DX|MX4D|IMAX(?:\s+with\s+Laser)?|LUXE|SCREENX|D-?BOX|Dolby\s+Cinema|35mm\s*菲林版|4K\s*修復版|導演版|加長版|特典場|見面場|會員場|應援場)\s*$/i;
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

  function stripPairedOuterBrackets(value) {
    const text = String(value || "").trim();
    const pairs = new Map([
      ["《", "》"],
      ["「", "」"],
      ["【", "】"]
    ]);
    return pairs.get(text[0]) === text.at(-1)
      ? text.slice(1, -1).trim()
      : text;
  }

  function parseVariantTitle(value) {
    const original = String(value || "").trim();
    const tags = [];
    const addTag = valueToAdd => {
      const tag = cleanVariantLabel(valueToAdd);
      if (tag && !tags.some(item => normalizeTitle(item) === normalizeTitle(tag))) tags.push(tag);
    };
    const addCompoundTags = valueToAdd => {
      let remainder = cleanVariantLabel(valueToAdd);
      const trailingTags = [];
      while (remainder) {
        const match = remainder.match(TRAILING_VARIANT);
        if (!match) break;
        trailingTags.unshift(match[1]);
        remainder = remainder.slice(0, remainder.length - match[0].length).trim();
      }
      if (remainder) addTag(remainder);
      trailingTags.forEach(addTag);
    };

    let base = original.replace(/[（(【]([^()（）【】]+)[）)】]/g, (whole, content) => {
      const normalized = cleanVariantLabel(content);
      if (VARIANT_QUALIFIER.test(normalized) || DATE_QUALIFIER.test(normalized)) {
        addCompoundTags(normalized);
        return " ";
      }
      return whole;
    });
    base = base.trim();

    const bookTitle = base.match(/^《(.+?)》\s*(.+)$/);
    if (bookTitle && VARIANT_QUALIFIER.test(bookTitle[2])) {
      base = bookTitle[1];
      addCompoundTags(bookTitle[2]);
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
      .replace(/\s+/g, " ")
      .replace(/^[·・:：\-–—\s]+|[·・:：\-–—\s]+$/g, "")
      .trim();
    base = stripPairedOuterBrackets(base);

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
