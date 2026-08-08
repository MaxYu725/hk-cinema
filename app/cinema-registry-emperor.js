(() => {
  const base = window.HKCinemaCinemaRegistry;
  if (!base) return;

  const emperorRecords = [
    {
      provider: "emperor",
      canonical: "中環娛樂行",
      region: "hk",
      district: "中環",
      aliases: ["英皇戲院 中環娛樂行", "Emperor Cinemas Entertainment Building", "Entertainment Building"]
    },
    {
      provider: "emperor",
      canonical: "銅鑼灣時代廣場",
      region: "hk",
      district: "銅鑼灣",
      aliases: ["英皇戲院 銅鑼灣時代廣場", "Emperor Cinemas Times Square", "Times Square"]
    },
    {
      provider: "emperor",
      canonical: "黃竹坑 THE SOUTHSIDE",
      region: "hk",
      district: "黃竹坑",
      aliases: ["英皇戲院 Plus+ 黃竹坑THE SOUTHSIDE", "THE SOUTHSIDE", "黃竹坑THE SOUTHSIDE"]
    },
    {
      provider: "emperor",
      canonical: "尖沙咀 iSQUARE",
      region: "kln",
      district: "尖沙咀",
      aliases: ["英皇戲院 尖沙咀iSQUARE", "Emperor Cinemas iSQUARE", "尖沙咀iSQUARE", "iSQUARE"]
    },
    {
      provider: "emperor",
      canonical: "屯門新都商場",
      region: "nt-islands",
      district: "屯門",
      aliases: ["英皇戲院 屯門新都商場", "Emperor Cinemas Tuen Mun", "屯門"]
    },
    {
      provider: "emperor",
      canonical: "馬鞍山新港城中心",
      region: "nt-islands",
      district: "馬鞍山",
      aliases: ["英皇戲院 馬鞍山新港城中心", "Emperor Cinemas Ma On Shan", "馬鞍山"]
    },
    {
      provider: "emperor",
      canonical: "荃灣荃新天地",
      region: "nt-islands",
      district: "荃灣",
      aliases: ["英皇戲院 荃灣荃新天地", "Emperor Cinemas Citywalk", "Citywalk", "荃新天地"]
    },
    {
      provider: "emperor",
      canonical: "將軍澳康城",
      region: "nt-islands",
      district: "將軍澳",
      aliases: ["英皇戲院 將軍澳康城", "Emperor Cinemas The LOHAS", "The LOHAS", "康城"]
    },
    {
      provider: "emperor",
      canonical: "大圍圍方",
      region: "nt-islands",
      district: "大圍",
      aliases: ["英皇戲院 Plus+ 大圍圍方", "Emperor Cinemas Plus+ Tai Wai", "Tai Wai", "圍方"]
    }
  ];

  const records = [
    ...(base.records || []).map(record => ({ ...record })),
    ...emperorRecords
  ];
  const normalize = base.normalize;
  const lookup = new Map();

  for (const record of records) {
    for (const value of [record.canonical, ...(record.aliases || [])]) {
      lookup.set(`${record.provider}:${normalize(value)}`, record);
    }
  }

  function resolve(provider, name) {
    const providerKey = ["broadway", "mcl", "emperor"].includes(provider)
      ? provider
      : "broadway";
    const normalized = normalize(name);
    const exact = lookup.get(`${providerKey}:${normalized}`);
    if (exact) return exact;

    const candidates = records.filter(record => record.provider === providerKey);
    for (const record of candidates) {
      for (const alias of [record.canonical, ...(record.aliases || [])]) {
        const normalizedAlias = normalize(alias);
        if (normalizedAlias.length < 5) continue;
        if (normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
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
    regions: base.regions,
    records: Object.freeze(records.map(record => Object.freeze({ ...record }))),
    resolve,
    normalize
  });
})();