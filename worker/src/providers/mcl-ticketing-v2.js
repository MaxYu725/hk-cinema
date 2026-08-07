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

async function fetchText(url, movieSetId, timeoutMs) {
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

  for (const timeoutMs of [10000, 15000]) {
    try {
      return await fetchText(url, movieSetId, timeoutMs);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  throw lastError || new Error("MCL upstream failed");
}

function readBalanced(text, start, openChar, closeChar) {
  if (text[start] !== openChar) return null;

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

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === openChar) depth++;
    else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return {
          text: text.slice(start, i + 1),
          end: i
        };
      }
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
    const parsed = JSON.parse(String(candidate).trim());
    return isTicketingPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeJsStringLiteral(literal) {
  const text = String(literal || "").trim();
  const quote = text[0];

  if ((quote !== '"' && quote !== "'") || text.at(-1) !== quote) {
    return null;
  }

  if (quote === '"') {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  const inner = text.slice(1, -1);

  return inner
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

function findAssignmentExpression(page, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:var|let|const)?\\s*${escaped}\\s*=\\s*`,
    "g"
  );

  const match = pattern.exec(page);
  if (!match) return null;

  const start = match.index + match[0].length;
  return page.slice(start, Math.min(page.length, start + 50000));
}

function parseExpression(expression, page, depth = 0) {
  if (depth > 4) return null;

  const value = String(expression || "").trim();
  if (!value) return null;

  if (value[0] === "{") {
    const balanced = readBalanced(value, 0, "{", "}");
    if (balanced) {
      const parsed = parseJsonCandidate(balanced.text);
      if (parsed) return parsed;
    }
  }

  if (/^JSON\.parse\s*\(/.test(value)) {
    const open = value.indexOf("(");
    const balanced = readBalanced(value, open, "(", ")");

    if (balanced) {
      const arg = balanced.text.slice(1, -1).trim();
      const decoded = decodeJsStringLiteral(arg);
      if (decoded != null) {
        const parsed = parseJsonCandidate(decoded);
        if (parsed) return parsed;
      }
    }
  }

  if (value[0] === '"' || value[0] === "'") {
    let end = 1;
    let escaped = false;

    for (; end < value.length; end++) {
      const char = value[end];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === value[0]) break;
    }

    if (end < value.length) {
      const decoded = decodeJsStringLiteral(value.slice(0, end + 1));
      if (decoded != null) {
        const parsed = parseJsonCandidate(decoded);
        if (parsed) return parsed;
      }
    }
  }

  const identifierMatch = value.match(/^([A-Za-z_$][\w$]*)\b/);
  if (identifierMatch) {
    const assignment = findAssignmentExpression(page, identifierMatch[1]);
    if (assignment) {
      return parseExpression(assignment, page, depth + 1);
    }
  }

  return null;
}

function extractInitAvailablePayload(page) {
  const pattern = /InitAvailableUI\s*\(/g;
  const snippets = [];
  let match;

  while ((match = pattern.exec(page)) !== null) {
    const before = page.slice(Math.max(0, match.index - 40), match.index);

    if (/function\s*$/i.test(before)) {
      continue;
    }

    const open = page.indexOf("(", match.index);
    const balanced = readBalanced(page, open, "(", ")");
    if (!balanced) continue;

    const argument = balanced.text.slice(1, -1).trim();
    const parsed = parseExpression(argument, page);

    snippets.push(
      page
        .slice(Math.max(0, match.index - 120), Math.min(page.length, balanced.end + 220))
        .replace(/\s+/g, " ")
        .slice(0, 900)
    );

    if (parsed) {
      return {
        payload: parsed,
        callCount: snippets.length,
        snippets
      };
    }
  }

  return {
    payload: null,
    callCount: snippets.length,
    snippets
  };
}

function parseTicketingPayload(text) {
  const variants = [
    String(text || "").trim(),
    decodeHtmlEntities(text).trim()
  ];

  const diagnostics = [];

  for (const variant of variants) {
    if (!variant) continue;

    const direct = parseJsonCandidate(variant);
    if (direct) {
      return { payload: direct, diagnostics };
    }

    const init = extractInitAvailablePayload(variant);
    diagnostics.push({
      callCount: init.callCount,
      snippets: init.snippets.slice(0, 3)
    });

    if (init.payload) {
      return {
        payload: init.payload,
        diagnostics
      };
    }

    const pattern = /\{\s*"AvailableDates"\s*:/g;
    let match;

    while ((match = pattern.exec(variant)) !== null) {
      const balanced = readBalanced(variant, match.index, "{", "}");
      const parsed = balanced ? parseJsonCandidate(balanced.text) : null;
      if (parsed) {
        return {
          payload: parsed,
          diagnostics
        };
      }
      pattern.lastIndex = match.index + 1;
    }
  }

  return {
    payload: null,
    diagnostics
  };
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
    availableVersions: Array.isArray(raw.AvailableVersions)
      ? raw.AvailableVersions
      : [],
    source: {
      provider: "mcl",
      transport: "cloudflare-worker-services-v2",
      upstream: `${SERVICES_BASE}Ticketing/MovieSet`,
      totalSessions: allSessions.length,
      selectedDateSessions: sessions.length,
      updatedAt: new Date().toISOString()
    }
  };
}

export async function getMCLTicketingV2(movieSetId, selectedDate = null) {
  const id = String(movieSetId || "").replace(/^mcl:/, "");

  if (!/^\d+$/.test(id)) {
    throw new Error("Invalid MCL movie ID");
  }

  const urls = [
    `${SERVICES_BASE}Ticketing/MovieSet?MovieSetID=${encodeURIComponent(id)}&language=zh-TW`,
    `${SERVICES_BASE}Ticketing/MovieSet?language=zh-TW&movieSetId=${encodeURIComponent(id)}`
  ];

  let lastDiagnostics = [];
  let lastBytes = 0;

  for (const url of urls) {
    const result = await fetchTextWithRetry(url, id);
    lastBytes = result.text.length;

    const parsed = parseTicketingPayload(result.text);
    lastDiagnostics = parsed.diagnostics;

    if (parsed.payload) {
      return normalizeTicketing(parsed.payload, id, selectedDate);
    }
  }

  throw new Error(
    `MCL InitAvailableUI payload unresolved; bytes=${lastBytes}; ` +
    `diagnostics=${JSON.stringify(lastDiagnostics).slice(0, 6500)}`
  );
}
