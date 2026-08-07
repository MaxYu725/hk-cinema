const SERVICES_BASE = "https://services.mclcinema.com/";
const SITE_BASE = "https://www.mclcinema.com/";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#x22;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function fetchText(url, movieSetId, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json,text/javascript;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: `${SITE_BASE}MovieSet.aspx?id=${encodeURIComponent(movieSetId)}&visLang=1`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`MCL upstream HTTP ${response.status}: ${text.slice(0, 160)}`);
    }

    return {
      text,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || null
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithRetry(url, movieSetId) {
  let lastError = null;

  for (const timeout of [10000, 15000]) {
    try {
      return await fetchText(url, movieSetId, timeout);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  throw lastError || new Error("MCL upstream failed");
}

function readBalancedObject(text, start) {
  if (text[start] !== "{") return null;

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function isTicketingPayload(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.AvailableDates &&
    Array.isArray(value.AvailableSessions)
  );
}

function parseJsonCandidate(candidate) {
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    return isTicketingPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseTicketingPayload(text) {
  for (const variant of [String(text || "").trim(), decodeHtmlEntities(text).trim()]) {
    if (!variant) continue;

    const direct = parseJsonCandidate(variant);
    if (direct) return direct;

    const pattern = /\{\s*"AvailableDates"\s*:/g;
    let match;

    while ((match = pattern.exec(variant)) !== null) {
      const candidate = readBalancedObject(variant, match.index);
      const parsed = parseJsonCandidate(candidate);
      if (parsed) return parsed;
      pattern.lastIndex = match.index + 1;
    }
  }

  return null;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTicketing(raw, movieSetId, selectedDate = null) {
  const cinemas = raw.AvailableCinemas || {};
  const rawSessions = Array.isArray(raw.AvailableSessions)
    ? raw.AvailableSessions
    : [];

  const allSessions = rawSessions
    .filter(session => session && (session.SessionID ?? session.FilmSessionId) != null)
    .map(session => {
      const dateTime = String(session.SessionDateTime || session.ShowTime || "");
      const businessDay = String(session.BusinessDay || "");
      const dateMatch = `${dateTime} ${businessDay}`.match(/\d{4}-\d{2}-\d{2}/);
      const timeMatch = dateTime.match(/T(\d{2}:\d{2})/);
      const cinemaId = String(session.CinemaCodeID || session.CinemaCode || "");
      const sessionId = String(session.SessionID ?? session.FilmSessionId);

      return {
        id: `mcl:${sessionId}`,
        provider: "mcl",
        sourceId: sessionId,
        date: dateMatch ? dateMatch[0] : null,
        time: timeMatch ? timeMatch[1] : String(session.Time || session.SessionTime || ""),
        cinema: {
          id: cinemaId || null,
          name: {
            zh: cinemas[cinemaId] || session.CinemaName || cinemaId || "MCL 戲院",
            en: null
          }
        },
        house: {
          id: null,
          name: session.ScreenName || session.HouseName || null
        },
        format: session.Format || null,
        language: session.Languages || session.Language || null,
        versionName: session.VersionName || null,
        displayVersion: session.DisplayVersion || null,
        price: {
          display: toFiniteNumber(session.AdultPrice),
          adult: toFiniteNumber(session.AdultPrice),
          student: toFiniteNumber(session.StudentPrice),
          child: toFiniteNumber(session.ChildPrice),
          senior: toFiniteNumber(session.SeniorPrice)
        },
        seatSummary: {
          available: null,
          total: null,
          held: null,
          unavailable: null,
          occupiedPercent: toFiniteNumber(session.OccupiedSeatsInPercent)
        },
        bookingUrl: `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(cinemaId)}&si=${encodeURIComponent(sessionId)}`
      };
    });

  const dateSet = new Set();
  const rawDates = raw.AvailableDates || {};
  const dateValues = Array.isArray(rawDates) ? rawDates : Object.values(rawDates);

  dateValues.forEach(value => {
    const source = typeof value === "object" && value
      ? value.Date || value.Value || value.BusinessDay || ""
      : value;
    const match = String(source || "").match(/\d{4}-\d{2}-\d{2}/);
    if (match) dateSet.add(match[0]);
  });

  allSessions.forEach(session => {
    if (session.date) dateSet.add(session.date);
  });

  const availableDates = Array.from(dateSet).sort();
  const resolvedDate = selectedDate && availableDates.includes(selectedDate)
    ? selectedDate
    : availableDates[0] || null;
  const sessions = resolvedDate
    ? allSessions.filter(session => session.date === resolvedDate)
    : allSessions;

  return {
    movieSetId: String(movieSetId),
    availableDates,
    selectedDate: resolvedDate,
    sessions,
    allSessions,
    availableVersions: Array.isArray(raw.AvailableVersions) ? raw.AvailableVersions : [],
    source: {
      provider: "mcl",
      transport: "cloudflare-worker",
      upstream: `${SERVICES_BASE}Ticketing/MovieSet`,
      totalSessions: allSessions.length,
      selectedDateSessions: sessions.length,
      updatedAt: new Date().toISOString()
    }
  };
}

function extractScriptUrls(html, baseUrl) {
  const urls = [];
  const pattern = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const url = new URL(decodeHtmlEntities(match[1]), baseUrl).toString();
      if (!urls.includes(url)) urls.push(url);
    } catch {
      // Ignore malformed script URLs.
    }
  }

  return urls.slice(0, 30);
}

function compactSnippet(text, index, before = 350, after = 900) {
  if (index < 0) return null;
  return text
    .slice(Math.max(0, index - before), Math.min(text.length, index + after))
    .replace(/\s+/g, " ")
    .slice(0, before + after);
}

function scanScript(text) {
  const decoded = decodeHtmlEntities(text);
  const markers = [
    "InitAvailableUI",
    "AvailableSessions",
    "AvailableDates",
    "MovieSetID",
    "movieSetId",
    "Ticketing/Cinema",
    "ticketing/cinema",
    "SessionID",
    "OccupiedSeatsInPercent"
  ];

  for (const marker of markers) {
    const index = decoded.indexOf(marker);
    if (index >= 0) {
      return {
        marker,
        snippet: compactSnippet(decoded, index)
      };
    }
  }

  return null;
}

async function discoverExternalScripts(pageResult, movieSetId) {
  const scripts = extractScriptUrls(pageResult.text, pageResult.finalUrl || SERVICES_BASE);
  const findings = [];

  for (const url of scripts) {
    if (findings.length >= 6) break;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    if (!/mclcinema\.com$/i.test(parsed.hostname) && !/\.mclcinema\.com$/i.test(parsed.hostname)) {
      continue;
    }

    try {
      const result = await fetchText(url, movieSetId, 8000);
      const hit = scanScript(result.text);
      if (hit) {
        findings.push({
          url,
          marker: hit.marker,
          snippet: hit.snippet
        });
      }
    } catch {
      // One inaccessible script should not stop discovery.
    }
  }

  return {
    scriptCount: scripts.length,
    findings
  };
}

export async function getMCLTicketing(movieSetId, selectedDate = null) {
  const id = String(movieSetId || "").replace(/^mcl:/, "");

  if (!/^\d+$/.test(id)) {
    throw new Error("Invalid MCL movie ID");
  }

  const urls = [
    `${SERVICES_BASE}Ticketing/MovieSet?MovieSetID=${encodeURIComponent(id)}&language=zh-TW`,
    `${SERVICES_BASE}Ticketing/MovieSet?language=zh-TW&movieSetId=${encodeURIComponent(id)}`
  ];

  let lastResult = null;

  for (const url of urls) {
    const result = await fetchTextWithRetry(url, id);
    lastResult = result;

    const raw = parseTicketingPayload(result.text);
    if (raw) {
      return normalizeTicketing(raw, id, selectedDate);
    }
  }

  const discovery = lastResult
    ? await discoverExternalScripts(lastResult, id)
    : { scriptCount: 0, findings: [] };

  throw new Error(
    `MCL ticketing data request not found in page HTML; ` +
    `scriptCount=${discovery.scriptCount}; ` +
    `findings=${JSON.stringify(discovery.findings).slice(0, 7000)}`
  );
}
