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

async function fetchTextWithTimeout(url, movieSetId, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: `${SITE_BASE}MovieSet.aspx?id=${encodeURIComponent(movieSetId)}&visLang=1`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `MCL ticketing upstream HTTP ${response.status}: ${text.slice(0, 160)}`
      );
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
  const timeouts = [10000, 15000];
  let lastError = null;

  for (let attempt = 0; attempt < timeouts.length; attempt++) {
    try {
      return await fetchTextWithTimeout(url, movieSetId, timeouts[attempt]);
    } catch (error) {
      lastError = error;
      if (attempt < timeouts.length - 1) {
        await sleep(700);
      }
    }
  }

  throw lastError || new Error("MCL ticketing upstream failed");
}

function readBalancedObject(text, start) {
  if (text[start] !== "{") return null;

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "{") depth++;
    if (char === "}") {
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

function findEmbeddedTicketingObject(text) {
  const exactStart = /\{\s*"AvailableDates"\s*:/g;
  let match;

  while ((match = exactStart.exec(text)) !== null) {
    const candidate = readBalancedObject(text, match.index);
    const parsed = parseJsonCandidate(candidate);
    if (parsed) return parsed;
    exactStart.lastIndex = match.index + 1;
  }

  return null;
}

function parseTicketingPayload(text) {
  const variants = [
    String(text || "").trim(),
    decodeHtmlEntities(text).trim()
  ];

  for (const variant of variants) {
    if (!variant) continue;

    const direct = parseJsonCandidate(variant);
    if (direct) return direct;

    const embedded = findEmbeddedTicketingObject(variant);
    if (embedded) return embedded;
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
    .filter(session => session && session.SessionID != null)
    .map(session => {
      const dateTime = String(session.SessionDateTime || "");
      const date = /^\d{4}-\d{2}-\d{2}/.test(dateTime)
        ? dateTime.slice(0, 10)
        : String(session.BusinessDay || "").slice(0, 10) || null;
      const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateTime)
        ? dateTime.slice(11, 16)
        : String(session.Time || session.SessionTime || "");
      const cinemaId = String(session.CinemaCodeID || session.CinemaCode || "");
      const sessionId = String(session.SessionID);

      return {
        id: `mcl:${sessionId}`,
        provider: "mcl",
        sourceId: sessionId,
        date,
        time,
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
        bookingUrl:
          `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(cinemaId)}&si=${encodeURIComponent(sessionId)}`
      };
    });

  const dateSet = new Set();
  const availableDateSource = raw.AvailableDates || {};

  const dateValues = Array.isArray(availableDateSource)
    ? availableDateSource
    : Object.values(availableDateSource);

  dateValues.forEach(value => {
    const text = typeof value === "object" && value
      ? String(value.Date || value.Value || value.BusinessDay || "")
      : String(value || "");
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    if (match) dateSet.add(match[0]);
  });

  allSessions.forEach(session => {
    if (session.date && /^\d{4}-\d{2}-\d{2}$/.test(session.date)) {
      dateSet.add(session.date);
    }
  });

  const availableDates = Array.from(dateSet).sort();
  const resolvedDate =
    selectedDate && availableDates.includes(selectedDate)
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
    availableVersions: Array.isArray(raw.AvailableVersions)
      ? raw.AvailableVersions
      : [],
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

function allIndexes(text, marker) {
  const indexes = [];
  let index = text.indexOf(marker);

  while (index >= 0 && indexes.length < 50) {
    indexes.push(index);
    index = text.indexOf(marker, index + marker.length);
  }

  return indexes;
}

function compactSnippet(text, index, before = 180, after = 520) {
  if (index < 0) return null;

  return text
    .slice(Math.max(0, index - before), Math.min(text.length, index + after))
    .replace(/\s+/g, " ")
    .slice(0, before + after);
}

function extractUrlCandidates(text) {
  const decoded = decodeHtmlEntities(text);
  const candidates = new Set();

  const absolute = /https?:\/\/[^"'<>\s)]+/gi;
  let match;

  while ((match = absolute.exec(decoded)) !== null) {
    const value = match[0];
    if (/mcl|ticket|movie|session|available/i.test(value)) {
      candidates.add(value.slice(0, 260));
    }
    if (candidates.size >= 12) break;
  }

  const quoted = /["']([^"']{1,240})["']/g;
  while ((match = quoted.exec(decoded)) !== null && candidates.size < 20) {
    const value = match[1];
    if (
      /(?:\/|\\)(?:[^"']*?)(?:ticket|movie|session|available|show)[^"']*/i.test(value) ||
      /(?:ticket|movie|session|available|show).*(?:\.json|\/|\?)/i.test(value)
    ) {
      candidates.add(value.slice(0, 260));
    }
  }

  return Array.from(candidates).slice(0, 12);
}

function makeDiagnostic(result) {
  const text = String(result?.text || "");
  const initIndexes = allIndexes(text, "InitAvailableUI");
  const ajaxMarkers = ["$.ajax", "$.getJSON", "$.get(", "fetch(", "axios."];
  const ajaxHits = [];

  for (const marker of ajaxMarkers) {
    for (const index of allIndexes(text, marker)) {
      ajaxHits.push({ marker, index });
    }
  }

  ajaxHits.sort((a, b) => a.index - b.index);

  return {
    bytes: text.length,
    finalUrl: result?.finalUrl || null,
    contentType: result?.contentType || null,
    initCount: initIndexes.length,
    initFirstSnippet: compactSnippet(text, initIndexes[0] ?? -1),
    initLastSnippet: compactSnippet(text, initIndexes.at(-1) ?? -1),
    ajaxCount: ajaxHits.length,
    ajaxSnippet: ajaxHits.length
      ? compactSnippet(text, ajaxHits.at(-1).index)
      : null,
    urlCandidates: extractUrlCandidates(text),
    preview: text.replace(/\s+/g, " ").slice(0, 180)
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

  let lastDiagnostic = null;

  for (const url of urls) {
    const result = await fetchTextWithRetry(url, id);
    const raw = parseTicketingPayload(result.text);

    if (raw) {
      return normalizeTicketing(raw, id, selectedDate);
    }

    lastDiagnostic = makeDiagnostic(result);
  }

  const diagnostic = lastDiagnostic || {};

  throw new Error(
    `MCL ticketing payload not embedded; bytes=${diagnostic.bytes ?? 0}; ` +
    `initCount=${diagnostic.initCount ?? 0}; ajaxCount=${diagnostic.ajaxCount ?? 0}; ` +
    `initLast=${diagnostic.initLastSnippet || "none"}; ` +
    `ajax=${diagnostic.ajaxSnippet || "none"}; ` +
    `urls=${JSON.stringify(diagnostic.urlCandidates || [])}; ` +
    `preview=${diagnostic.preview || "empty"}`
  );
}
