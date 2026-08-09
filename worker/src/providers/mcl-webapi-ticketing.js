const SITE_BASE = "https://www.mclcinema.com/";
const API_BASE = `${SITE_BASE}MCLWebAPI2/`;
const REQUEST_BUDGET_MS = 13500;
const ENRICHMENT_BUDGET_MS = 10000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  const slash = text.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\D|$)/);
  if (slash) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    let year = Number(map.year);
    const month = Number(slash[2]);
    const currentMonth = Number(map.month);
    if (currentMonth >= 11 && month <= 2) year += 1;
    if (currentMonth <= 2 && month >= 11) year -= 1;
    return `${year}-${pad2(month)}-${pad2(slash[1])}`;
  }

  return null;
}

function normalizeTime(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return null;

  const twelve = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
  if (twelve) {
    let hour = Number(twelve[1]) % 12;
    if (twelve[3] === "PM") hour += 12;
    return `${pad2(hour)}:${twelve[2]}`;
  }

  const twentyFour = text.match(/(?:^|T|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/);
  return twentyFour ? `${pad2(twentyFour[1])}:${twentyFour[2]}` : null;
}

function normalizeCinemaId(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,4}$/.test(text)) return null;
  return text.length <= 3 ? text.padStart(3, "0") : text;
}

async function fetchText(url, movieSetId, timeoutMs = 10000, parentSignal = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort(parentSignal?.reason);

  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener?.("abort", onParentAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/javascript, text/html, */*; q=0.01",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.7",
        Referer: `${SITE_BASE}MovieSet.aspx?id=${encodeURIComponent(movieSetId)}&visLang=1`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MCL WebAPI HTTP ${response.status}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener?.("abort", onParentAbort);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(String(text || "").trim());
  } catch {
    return null;
  }
}

function makeSession({ sessionId, cinemaId, date, time, cinemaName, versionName }) {
  const sid = String(sessionId ?? "").trim();
  if (!/^\d+$/.test(sid)) return null;

  const ci = normalizeCinemaId(cinemaId);
  return {
    id: `mcl:${sid}`,
    provider: "mcl",
    sourceId: sid,
    date: normalizeDate(date),
    time: normalizeTime(time),
    cinema: {
      id: ci,
      name: { zh: cinemaName ? String(cinemaName).replace(/\s+/g, " ").trim() : null, en: null }
    },
    house: { id: null, name: null },
    format: null,
    language: null,
    versionName: versionName ? String(versionName).trim() : null,
    displayVersion: null,
    price: { display: null, adult: null, student: null, child: null, senior: null },
    seatSummary: { available: null, total: null, held: null, unavailable: null, occupiedPercent: null },
    bookingUrl: ci
      ? `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(ci)}&si=${encodeURIComponent(sid)}`
      : null
  };
}

function mergeSession(existing, next) {
  if (!existing) return next;
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== null && value !== "")),
    cinema: {
      ...(existing.cinema || {}),
      ...(next.cinema || {}),
      name: { ...(existing.cinema?.name || {}), ...(next.cinema?.name || {}) }
    },
    house: { ...(existing.house || {}), ...(next.house || {}) }
  };
}

function pick(object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
  }
  return null;
}

function collectStructured(value, sessions, dates, context = {}, depth = 0, seen = new Set()) {
  if (depth > 14 || value == null) return;

  if (typeof value === "string") {
    const date = normalizeDate(value);
    if (date) dates.add(date);
    collectHtml(value, sessions, dates, context);
    return;
  }

  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectStructured(item, sessions, dates, context, depth + 1, seen);
    return;
  }

  const lower = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [String(key).toLowerCase(), item])
  );

  const nextContext = {
    cinemaId: pick(lower, ["cinemacodeid", "cinemacode", "cinemaid", "ci"]) ?? context.cinemaId,
    cinemaName: pick(lower, ["cinemaname", "cinema", "cn"]) ?? context.cinemaName,
    date: pick(lower, ["businessday", "sessiondate", "showdate", "date", "day", "dn"]) ?? context.date,
    versionName: pick(lower, ["displayversion", "versionname", "version", "vn"]) ?? context.versionName
  };

  let sessionId = pick(lower, ["sessionid", "filmsessionid", "filmsession", "session_id", "sid", "si"]);
  const time = pick(lower, ["sessiondatetime", "showtime", "sessiontime", "starttime", "time", "st"]);

  if (sessionId == null && time != null && /^\d+$/.test(String(lower.id ?? ""))) {
    sessionId = lower.id;
  }

  if (sessionId != null) {
    const candidate = makeSession({
      sessionId,
      cinemaId: nextContext.cinemaId,
      date: pick(lower, ["sessiondatetime", "businessday", "sessiondate", "showdate", "date", "day", "dn"]) ?? nextContext.date,
      time,
      cinemaName: nextContext.cinemaName,
      versionName: nextContext.versionName
    });
    if (candidate && (candidate.time || candidate.cinema.id || candidate.date)) {
      sessions.set(candidate.sourceId, mergeSession(sessions.get(candidate.sourceId), candidate));
      if (candidate.date) dates.add(candidate.date);
    }
  }

  for (const item of Object.values(value)) {
    collectStructured(item, sessions, dates, nextContext, depth + 1, seen);
  }
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match?.[1] ?? null;
}

function collectHtml(text, sessions, dates, context = {}) {
  const source = String(text || "");
  if (!source) return;

  const datePattern = /(?:data-(?:day|date)|value)=["']([^"']+)["']/gi;
  let dateMatch;
  while ((dateMatch = datePattern.exec(source)) !== null) {
    const date = normalizeDate(dateMatch[1]);
    if (date) dates.add(date);
  }

  const tagPattern = /<[^>]*(?:data-id|data-session-id|data-sessionid)=["']\d+["'][^>]*>/gi;
  let match;
  while ((match = tagPattern.exec(source)) !== null) {
    const tag = match[0];
    const sessionId = attr(tag, "data-id") || attr(tag, "data-session-id") || attr(tag, "data-sessionid");
    const href = attr(tag, "href") || "";
    const ciMatch = href.match(/[?&](?:ci|cinemaCode)=(\d+)/i);
    const candidate = makeSession({
      sessionId,
      cinemaId: ciMatch?.[1] || attr(tag, "data-ci") || attr(tag, "data-cinema-code") || context.cinemaId,
      date: attr(tag, "data-day") || attr(tag, "data-date") || context.date,
      time: attr(tag, "data-time") || attr(tag, "data-session-time"),
      cinemaName: context.cinemaName,
      versionName: attr(tag, "data-value") || context.versionName
    });
    if (candidate) {
      sessions.set(candidate.sourceId, mergeSession(sessions.get(candidate.sourceId), candidate));
      if (candidate.date) dates.add(candidate.date);
    }
  }

  const hrefPattern = /href=["']([^"']*(?:MCLSelectSeat|MCLSelectTicket)[^"']*)["']/gi;
  while ((match = hrefPattern.exec(source)) !== null) {
    try {
      const url = new URL(match[1].replaceAll("&amp;", "&"), SITE_BASE);
      const sessionId = url.searchParams.get("si");
      const cinemaId = url.searchParams.get("ci");
      const candidate = makeSession({ sessionId, cinemaId, date: context.date, time: null, cinemaName: context.cinemaName, versionName: context.versionName });
      if (candidate) sessions.set(candidate.sourceId, mergeSession(sessions.get(candidate.sourceId), candidate));
    } catch {}
  }
}

function parseResponses(texts) {
  const sessions = new Map();
  const dates = new Set();
  for (const text of texts) {
    const json = safeJson(text);
    if (json != null) collectStructured(json, sessions, dates);
    collectHtml(text, sessions, dates);
  }
  return { sessions: Array.from(sessions.values()), dates: Array.from(dates).sort() };
}

function collectCinemaMap(value, map = new Map(), depth = 0) {
  if (depth > 10 || value == null) return map;
  if (Array.isArray(value)) {
    for (const item of value) collectCinemaMap(item, map, depth + 1);
    return map;
  }
  if (typeof value !== "object") return map;

  const lower = Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key).toLowerCase(), item]));
  const id = normalizeCinemaId(pick(lower, ["cinemacodeid", "cinemacode", "cinemaid", "id", "ci"]));
  const name = pick(lower, ["cinemaname", "name", "cn", "n"]);
  if (id && name && typeof name === "string") map.set(id, name.trim());
  for (const item of Object.values(value)) collectCinemaMap(item, map, depth + 1);
  return map;
}

function applyCinemaNames(sessions, map) {
  return sessions.map(session => {
    const id = session.cinema?.id;
    const name = id ? map.get(id) : null;
    return name ? { ...session, cinema: { ...session.cinema, name: { ...session.cinema.name, zh: name } } } : session;
  });
}

function priceFromList(value) {
  const items = Array.isArray(value) ? value : [];
  const find = words => {
    const item = items.find(entry => {
      const name = String(entry?.n || entry?.name || "").toLowerCase();
      return words.some(word => name.includes(word));
    });
    const number = Number(item?.p ?? item?.price);
    return Number.isFinite(number) ? number : null;
  };
  return {
    adult: find(["成人", "adult"]),
    student: find(["學生", "student"]),
    child: find(["小童", "child"]),
    senior: find(["長者", "senior"])
  };
}

function hasSessionLanguageMetadata(session) {
  const languagePattern = /(?:粵語|廣東話|cantonese|canto|英語|英文|english|日語|日文|日本語|japanese|國語|普通話|華語|mandarin|putonghua|韓語|韓文|korean|泰語|泰文|thai|法語|法文|french|德語|德文|german|西班牙語|西班牙文|spanish|印地語|印度語|hindi|原聲|original)/i;
  const subtitleLanguagePattern = /(?:中文|英文|日文|韓文|泰文|法文|德文|西班牙文|chinese|english|japanese|korean|thai|french|german|spanish)\s*(?:字幕|subtitles?)/i;
  const hasRecognizedSpokenLanguage = value => String(value || "")
    .normalize("NFKC")
    .split(/[·・|/]+/)
    .some(part => {
      const segment = part.trim();
      if (!segment || /^(?:字幕|subtitles?)\s*[:：]?/i.test(segment)) return false;
      const spokenPart = segment.replace(subtitleLanguagePattern, " ").trim();
      return languagePattern.test(spokenPart);
    });

  return (
    hasRecognizedSpokenLanguage(session?.language) ||
    hasRecognizedSpokenLanguage(session?.versionName) ||
    hasRecognizedSpokenLanguage(session?.displayVersion)
  );
}

function isSessionInfoPayload(info) {
  return Boolean(
    info &&
    typeof info === "object" &&
    !Array.isArray(info) &&
    ["l", "s", "dn", "st", "hn"].some(key => Object.prototype.hasOwnProperty.call(info, key))
  );
}

async function enrichSessionMetadata(session, movieSetId, signal = null) {
  const cinemaId = session.cinema?.id;
  if (!cinemaId) {
    return { session, metadataComplete: hasSessionLanguageMetadata(session) };
  }
  const sessionId = session.sourceId;

  const infoText = await fetchText(
    `${API_BASE}GetSessionInfo.aspx?l=1&si=${encodeURIComponent(sessionId)}&ci=${encodeURIComponent(cinemaId)}`,
    movieSetId,
    7000,
    signal
  ).catch(() => null);
  const info = safeJson(infoText);
  if (!isSessionInfoPayload(info)) {
    return { session, metadataComplete: false };
  }
  const language = [info.l, info.s ? `字幕: ${info.s}` : null].filter(Boolean).join(" · ") || null;

  const enrichedSession = {
    ...session,
    date: normalizeDate(info.dn) || session.date,
    time: normalizeTime(info.st) || session.time,
    house: { ...(session.house || {}), name: info.hn || session.house?.name || null },
    language: language || session.language
  };

  return {
    session: enrichedSession,
    metadataComplete: hasSessionLanguageMetadata(enrichedSession)
  };
}

async function enrichSessionPrice(session, movieSetId, signal = null) {
  const cinemaId = session.cinema?.id;
  if (!cinemaId) return session;
  const sessionId = session.sourceId;
  const priceText = await fetchText(
    `${API_BASE}GetPrice.aspx?l=1&si=${encodeURIComponent(sessionId)}&ci=${encodeURIComponent(cinemaId)}`,
    movieSetId,
    7000,
    signal
  ).catch(() => null);
  const prices = priceFromList(safeJson(priceText));
  const adult = prices.adult;

  return {
    ...session,
    price: {
      display: adult,
      adult,
      student: prices.student,
      child: prices.child,
      senior: prices.senior
    }
  };
}

async function mapLimit(items, limit, mapper, signal = null) {
  const results = [...items];
  let next = 0;
  async function worker() {
    while (true) {
      if (signal?.aborted) return;
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await mapper(items[index], index); }
      catch { results[index] = items[index]; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function enrichSelectedSessions(sessions, movieSetId, budgetMs = ENRICHMENT_BUDGET_MS) {
  const fullEnrichmentLimit = 40;
  if (!sessions.length) return { sessions: [], metadataComplete: true };
  if (budgetMs <= 0) return { sessions: [...sessions], metadataComplete: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("enrichment-deadline"), budgetMs);

  try {
    const metadataResults = await mapLimit(
      sessions,
      8,
      session => enrichSessionMetadata(session, movieSetId, controller.signal),
      controller.signal
    );
    const withMetadata = metadataResults.map((result, index) => result?.session || sessions[index]);
    const metadataComplete = metadataResults.every(result => result?.metadataComplete === true);
    if (controller.signal.aborted) {
      return { sessions: withMetadata, metadataComplete: false };
    }

    const withPrices = await mapLimit(
      withMetadata.slice(0, fullEnrichmentLimit),
      8,
      session => enrichSessionPrice(session, movieSetId, controller.signal),
      controller.signal
    );
    return {
      sessions: [...withPrices, ...withMetadata.slice(fullEnrichmentLimit)],
      metadataComplete
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getMCLWebApiTicketing(movieSetId, selectedDate = null) {
  const requestStartedAt = Date.now();
  const id = String(movieSetId || "").replace(/^mcl:/, "");
  if (!/^\d+$/.test(id)) throw new Error("Invalid MCL movie ID");

  const query = `l=1&t=s&id=${encodeURIComponent(id)}`;
  const cacheBust = `_=${Date.now()}`;

  const [listText, gridText, daysText, cinemaText] = await Promise.all([
    fetchText(`${API_BASE}GetNowShowingList.aspx?${query}&${cacheBust}`, id),
    fetchText(`${API_BASE}GetNowShowingGrid.aspx?${query}&m=i&${cacheBust}`, id),
    fetchText(`${API_BASE}GetShowDays.aspx?${query}&${cacheBust}`, id),
    fetchText(`${API_BASE}GetCinemaDetails.aspx?l=1&${cacheBust}`, id).catch(() => "")
  ]);

  const parsed = parseResponses([listText, gridText, daysText]);
  const cinemaMap = collectCinemaMap(safeJson(cinemaText));
  let allSessions = applyCinemaNames(parsed.sessions, cinemaMap);

  if (!allSessions.length) {
    throw new Error("MCL WebAPI returned no recognizable sessions");
  }

  let availableDates = parsed.dates;
  let resolvedDate = selectedDate && availableDates.includes(selectedDate)
    ? selectedDate
    : availableDates[0] || allSessions.find(session => session.date)?.date || null;

  let sessions = resolvedDate
    ? allSessions.filter(session => !session.date || session.date === resolvedDate)
    : allSessions;

  const enrichmentBudget = Math.max(0, Math.min(
    ENRICHMENT_BUDGET_MS,
    REQUEST_BUDGET_MS - (Date.now() - requestStartedAt)
  ));
  const enrichment = await enrichSelectedSessions(sessions, id, enrichmentBudget);
  sessions = enrichment.sessions;

  const dates = new Set(availableDates);
  for (const session of sessions) if (session.date) dates.add(session.date);
  availableDates = Array.from(dates).sort();
  if (!resolvedDate) resolvedDate = availableDates[0] || null;
  if (resolvedDate) sessions = sessions.filter(session => !session.date || session.date === resolvedDate);
  sessions.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

  return {
    movieSetId: id,
    availableDates,
    selectedDate: resolvedDate,
    sessions,
    allSessions,
    metadataComplete: enrichment.metadataComplete,
    availableVersions: [],
    source: {
      provider: "mcl",
      transport: "cloudflare-worker-mclwebapi2",
      endpoint: "MCLWebAPI2",
      totalSessions: allSessions.length,
      selectedDateSessions: sessions.length,
      updatedAt: new Date().toISOString()
    }
  };
}
