(() => {
  const REGIONS = Object.freeze({
    hk: "港島",
    kln: "九龍",
    "nt-islands": "新界/離島",
    unknown: "未分類"
  });

  const records = [
    // Broadway Circuit — official HK / KLN / NT grouping.
    {
      provider: "broadway",
      canonical: "MOViE MOViE Pacific Place (金鐘)",
      region: "hk",
      district: "金鐘",
      aliases: ["MOViE MOViE Pacific Place", "MOViE MOViE Pacific Place (Admiralty)"]
    },
    {
      provider: "broadway",
      canonical: "MOViE MOViE Cityplaza (太古城)",
      region: "hk",
      district: "太古城",
      aliases: ["MOViE MOViE Cityplaza", "MOViE MOViE Cityplaza (Taikoo Shing)"]
    },
    {
      provider: "broadway",
      canonical: "PALACE ifc",
      region: "hk",
      district: "中環",
      aliases: ["PALACE IFC", "Palace ifc"]
    },
    {
      provider: "broadway",
      canonical: "GALA CINEMA (朗豪坊)",
      region: "kln",
      district: "旺角",
      aliases: ["GALA CINEMA", "GALA CINEMA (Langham Place)"]
    },
    {
      provider: "broadway",
      canonical: "PREMIERE ELEMENTS",
      region: "kln",
      district: "西九龍",
      aliases: ["Premiere Elements"]
    },
    {
      provider: "broadway",
      canonical: "B+ cinema MOKO (旺角東)",
      region: "kln",
      district: "旺角東",
      aliases: ["B+ cinema MOKO", "B+ cinema MOKO (Mong Kok East)"]
    },
    {
      provider: "broadway",
      canonical: "B+ cinema apm (觀塘)",
      region: "kln",
      district: "觀塘",
      aliases: ["B+ cinema apm", "B+ cinema apm (Kwun Tong)"]
    },
    {
      provider: "broadway",
      canonical: "電影中心",
      region: "kln",
      district: "油麻地",
      aliases: ["CINEMATHEQUE", "Broadway Cinematheque"]
    },
    {
      provider: "broadway",
      canonical: "旺角",
      region: "kln",
      district: "旺角",
      aliases: ["MONGKOK", "Broadway Mongkok"]
    },
    {
      provider: "broadway",
      canonical: "MY CINEMA YOHO MALL",
      region: "nt-islands",
      district: "元朗",
      aliases: ["MY CINEMA YOHO", "YOHO MALL"]
    },
    {
      provider: "broadway",
      canonical: "葵芳",
      region: "nt-islands",
      district: "葵芳",
      aliases: ["KWAI FONG", "Broadway Kwai Fong"]
    },
    {
      provider: "broadway",
      canonical: "荃灣",
      region: "nt-islands",
      district: "荃灣",
      aliases: ["TSUEN WAN", "Broadway Tsuen Wan"]
    },
    {
      provider: "broadway",
      canonical: "嘉湖",
      region: "nt-islands",
      district: "天水圍",
      aliases: ["KINGSWOOD", "Broadway Kingswood"]
    },

    // MCL — official current 14-site grouping.
    {
      provider: "mcl",
      canonical: "K11 ART HOUSE (尖東站)",
      region: "kln",
      district: "尖沙咀",
      aliases: ["K11 ART HOUSE", "K11 ART HOUSE (East Tsim Sha Tsui Station)"]
    },
    {
      provider: "mcl",
      canonical: "MOVIE TOWN (新城市廣場)",
      region: "nt-islands",
      district: "沙田",
      aliases: ["MOVIE TOWN", "MOVIE TOWN (New Town Plaza)"]
    },
    {
      provider: "mcl",
      canonical: "FESTIVAL GRAND CINEMA (又一城)",
      region: "kln",
      district: "九龍塘",
      aliases: ["FESTIVAL GRAND CINEMA", "FESTIVAL GRAND"]
    },
    {
      provider: "mcl",
      canonical: "MCL AIRSIDE 戲院 (啟德)",
      region: "kln",
      district: "啟德",
      aliases: ["MCL AIRSIDE 戲院", "MCL AIRSIDE CINEMA", "AIRSIDE 戲院"]
    },
    {
      provider: "mcl",
      canonical: "MCL THE ONE 戲院",
      region: "kln",
      district: "尖沙咀",
      aliases: ["MCL THE ONE CINEMA", "THE ONE 戲院", "MCL THE ONE"]
    },
    {
      provider: "mcl",
      canonical: "皇室戲院",
      region: "hk",
      district: "銅鑼灣",
      aliases: ["GRAND WINDSOR CINEMA", "GRAND WINDSOR", "皇室"]
    },
    {
      provider: "mcl",
      canonical: "STAR CINEMA (將軍澳站)",
      region: "nt-islands",
      district: "將軍澳",
      aliases: ["STAR CINEMA", "STAR"]
    },
    {
      provider: "mcl",
      canonical: "MCL 新都城戲院 (寶琳站)",
      region: "nt-islands",
      district: "寶琳",
      aliases: ["MCL 新都城戲院", "MCL METRO CITY CINEMA", "METRO CITY"]
    },
    {
      provider: "mcl",
      canonical: "MCL 德福戲院",
      region: "kln",
      district: "九龍灣",
      aliases: ["MCL TELFORD CINEMA", "TELFORD", "德福戲院"]
    },
    {
      provider: "mcl",
      canonical: "MCL 粉嶺戲院",
      region: "nt-islands",
      district: "粉嶺",
      aliases: ["MCL GREEN CODE CINEMA", "GREEN CODE", "粉嶺戲院"]
    },
    {
      provider: "mcl",
      canonical: "MCL 長沙灣戲院",
      region: "kln",
      district: "長沙灣",
      aliases: ["MCL CHEUNG SHA WAN CINEMA", "CHEUNG SHA WAN", "長沙灣戲院"]
    },
    {
      provider: "mcl",
      canonical: "MCL 數碼港戲院",
      region: "hk",
      district: "數碼港",
      aliases: ["MCL CYBERPORT CINEMA", "CYBERPORT", "數碼港戲院"]
    },
    {
      provider: "mcl",
      canonical: "MCL 東薈城戲院",
      region: "nt-islands",
      district: "東涌",
      aliases: ["MCL CITYGATE CINEMA", "CITYGATE", "東薈城戲院"]
    },
    {
      provider: "mcl",
      canonical: "MCL 淘大戲院",
      region: "kln",
      district: "九龍灣",
      aliases: ["MCL AMOY CINEMA", "AMOY", "淘大戲院"]
    }
  ];

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[()（）]/g, " ")
      .replace(/[·・]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeProvider(provider) {
    return String(provider || "").trim().toLowerCase() || "unknown";
  }

  const lookup = new Map();

  for (const record of records) {
    const values = [record.canonical, ...(record.aliases || [])];
    for (const value of values) {
      lookup.set(`${record.provider}:${normalize(value)}`, record);
    }
  }

  function resolve(provider, name) {
    const providerKey = normalizeProvider(provider);
    const normalized = normalize(name);
    const exact = lookup.get(`${providerKey}:${normalized}`);
    if (exact) return exact;

    // Conservative alias containment for provider-specific decorated names.
    // Short aliases are intentionally ignored to avoid accidental matches.
    const candidates = records.filter(record => record.provider === providerKey);
    for (const record of candidates) {
      for (const alias of [record.canonical, ...(record.aliases || [])]) {
        const normalizedAlias = normalize(alias);
        if (normalizedAlias.length < 5) continue;
        if (
          normalized.includes(normalizedAlias) ||
          normalizedAlias.includes(normalized)
        ) {
          return record;
        }
      }
    }

    return {
      provider: providerKey,
      canonical: name || "未知戲院",
      region: "unknown",
      district: null,
      aliases: []
    };
  }

  window.HKCinemaCinemaRegistry = Object.freeze({
    version: "m7r6-1",
    regions: REGIONS,
    records: Object.freeze(records.map(record => Object.freeze({ ...record }))),
    resolve,
    normalize
  });
})();
