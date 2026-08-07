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
        : null;
      const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateTime)
        ? dateTime.slice(11, 16)
        : String(session.Time || "");
      const cinemaId = String(session.CinemaCodeID || "");
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
            zh: cinemas[cinemaId] || cinemaId || "MCL 戲院",
            en: null
          }
        },
        house: {
          id: null,
          name: session.ScreenName || null
        },
        format: session.Format || null,
        language: session.Languages || null,
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
  Object.values(raw.AvailableDates || {}).forEach(value => {
    const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
    if (match) dateSet.add(match[0]);
  });
  allSessions.forEach(session => {
    if (session.date) dateSet.add(session.date);
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

  while (index >= 0 && indexes.length < 100) {
    indexes.push(index);
    index = text.indexOf(marker, index + marker.length);
  }

  return indexes;
}

function compactSnippet(text, index, before = 700, after = 1300) {
  if (index < 0) return null;

  return text
    .slice(Math.max(0, index - before), Math.min(text.length, index + after))
    .replace(/\s+/g, " ")
    .slice(0, before + after);
}

function makeDiagnostic(result) {
  const text = decodeHtmlEntities(String(result?.text || ""));
  const target = "ticketing/cinema";
  const targetIndex = text.toLowerCase().indexOf(target);

  const requestMarkers = [
    "$.post",
    "$.ajax",
    "$.getJSON",
    "$.get(",
    ".post(",
    "axios",
    "fetch(",
    "XMLHttpRequest",
    "type: 'POST'",
    'type: "POST"',
    "method: 'POST'",
    'method: "POST"'
  ];

  const requestHits = [];
  for (const marker of requestMarkers) {
    for (const index of allIndexes(text, marker)) {
      requestHits.push({ marker, index });
    }
  }
  requestHits.sort((a, b) => a.index - b.index);

  let nearestRequest = null;
  if (targetIndex >= 0 && requestHits.length) {
    nearestRequest = requestHits
      .map(hit => ({ ...hit, distance: Math.abs(hit.index - targetIndex) }))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  return {
    bytes: text.length,
    finalUrl: result?.finalUrl || null,
    contentType: result?.contentType || null,
    targetFound: targetIndex >= 0,
    ticketingCinemaSnippet: compactSnippet(text, targetIndex),
    requestCount: requestHits.length,
    nearestRequestMarker: nearestRequest?.marker || null,
    nearestRequestSnippet: nearestRequest
      ? compactSnippet(text, nearestRequest.index)
      : null,
    movieSetIdSnippet: compactSnippet(
      text,
      Math.max(
        text.indexOf("MovieSetID"),
        text.indexOf("movieSetId"),
        text.indexOf("moviesetid")
      ),
      350,
      700
    )
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

  const d = lastDiagnostic || {};

  throw new Error(
    `MCL ticketing AJAX not resolved; bytes=${d.bytes ?? 0}; ` +
    `targetFound=${d.targetFound ? "yes" : "no"}; ` +
    `requestCount=${d.requestCount ?? 0}; ` +
    `nearest=${d.nearestRequestMarker || "none"}; ` +
    `ticketingCinema=${d.ticketingCinemaSnippet || "none"}; ` +
    `request=${d.nearestRequestSnippet || "none"}; ` +
    `movieSet=${d.movieSetIdSnippet || "none"}`
  );
}
