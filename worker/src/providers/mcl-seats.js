const SEAT_BASE = "https://info.mclcinema.com/PreviewSeatPlan/SeatPlan";

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attr(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`(?:^|\\s)${escaped}=["']([^"']*)["']`, "i")
  );
  return match ? decodeHtml(match[1]) : null;
}

function firstAttr(source, names) {
  for (const name of names) {
    const value = attr(source, name);
    if (value !== null && value !== "") return value;
  }
  return null;
}

function normalizeStatus(status) {
  const value = String(status || "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase();

  switch (value) {
    case "normal":
    case "available":
    case "free":
      return "available";
    case "sold":
    case "occupied":
    case "unavailable":
    case "reserved":
    case "hold":
    case "held":
      return "sold";
    case "broken":
    case "blocked":
    case "disabled":
      return "broken";
    case "wheelchair":
    case "wheelchairavailable":
      return "wheelchair";
    case "sofaavailable":
    case "sofa":
      return "sofa-available";
    case "sofasold":
    case "sofaoccupied":
      return "sofa-sold";
    default:
      return "unknown";
  }
}

function buildSeat(tag, rowNameFallback = null) {
  const seatNum = firstAttr(tag, [
    "seatNum",
    "seatnum",
    "seat-number",
    "data-seat-num",
    "data-seat-number",
    "data-seat",
    "id"
  ]);

  const rawColumn = firstAttr(tag, [
    "column",
    "data-column",
    "col",
    "data-col"
  ]);

  const column = Number(rawColumn);

  if (!seatNum || !Number.isFinite(column) || column <= 0) {
    return null;
  }

  const rawRow = firstAttr(tag, ["row", "data-row", "row-index", "data-row-index"]);
  const row = Number(rawRow);
  const upstreamStatus = firstAttr(tag, [
    "status",
    "seatStatus",
    "seatstatus",
    "seat-status",
    "data-status",
    "data-seat-status"
  ]) || "Unknown";

  const explicitRowName = firstAttr(tag, [
    "row-name",
    "rowName",
    "rowname",
    "data-row-name"
  ]);

  const inferredRowName = String(seatNum).match(/^([^0-9]+)/)?.[1] || null;
  const rowName = explicitRowName || rowNameFallback || inferredRowName || "";

  return {
    id: String(seatNum),
    seatNum: String(seatNum),
    rowName,
    row: Number.isFinite(row) ? row : null,
    column,
    area: firstAttr(tag, ["area", "data-area"]),
    areaCode: firstAttr(tag, ["areaCode", "areacode", "data-area-code"]),
    status: normalizeStatus(upstreamStatus),
    upstreamStatus
  };
}

function collectSeatsFromFragment(fragment, rowNameFallback = null) {
  const results = [];
  const seen = new Set();
  const tagPattern = /<(?:img|div|span|label|input|button)\b([^>]*)>/gi;
  let match;

  while ((match = tagPattern.exec(fragment)) !== null) {
    const tag = match[1];

    if (!/(?:seatnum|seat-num|seat-number|data-seat|\bid=)[\s=]/i.test(tag)) {
      continue;
    }

    if (!/(?:status|seat-status|seatstatus|data-status)[\s=]/i.test(tag)) {
      continue;
    }

    const seat = buildSeat(tag, rowNameFallback);
    if (!seat) continue;

    const key = `${seat.seatNum}:${seat.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(seat);
  }

  return results;
}

function parseSeatPlan(html, cinemaCode, sessionId) {
  const totalColumnsMatch = html.match(
    /totalNumberOfColumns\s*=\s*(\d+)/i
  );
  let totalColumns = Number(totalColumnsMatch?.[1] || 0) || null;

  const seats = [];
  const rows = [];
  const seenSeats = new Set();

  function addSeat(seat, rowSeats) {
    const key = `${seat.seatNum}:${seat.column}`;
    if (seenSeats.has(key)) return;
    seenSeats.add(key);
    seats.push(seat);
    rowSeats?.push(seat);
  }

  const rowPatterns = [
    /<tr\b[^>]*row-name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tr>/gi,
    /<[^>]+data-row-name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:div|section|ul)>/gi
  ];

  for (const rowPattern of rowPatterns) {
    let rowMatch;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowName = decodeHtml(rowMatch[1]);
      const rowHtml = rowMatch[2];
      const rowSeats = [];

      for (const seat of collectSeatsFromFragment(rowHtml, rowName)) {
        addSeat(seat, rowSeats);
      }

      if (rowSeats.length) {
        rows.push({
          name: rowName,
          seats: rowSeats.sort((a, b) => a.column - b.column)
        });
      }
    }

    if (rows.length) break;
  }

  if (!seats.length) {
    const grouped = new Map();

    for (const seat of collectSeatsFromFragment(html)) {
      const rowName = seat.rowName || String(seat.row ?? "?");
      if (!grouped.has(rowName)) grouped.set(rowName, []);
      addSeat(seat, grouped.get(rowName));
    }

    for (const [name, rowSeats] of grouped) {
      if (!rowSeats.length) continue;
      rows.push({
        name,
        seats: rowSeats.sort((a, b) => a.column - b.column)
      });
    }
  }

  if (!seats.length) {
    const hasSeatPlan = /id=["']seatplan["']/i.test(html);
    const hasSeatNum = /seat(?:num|-num|-number)|data-seat/i.test(html);
    const bytes = new TextEncoder().encode(html).length;

    throw new Error(
      `MCL 暫未提供此場座位圖（bytes=${bytes}, seatplan=${hasSeatPlan ? "yes" : "no"}, seatMarkup=${hasSeatNum ? "yes" : "no"}）`
    );
  }

  if (!totalColumns) {
    totalColumns = Math.max(...seats.map(seat => seat.column), 1);
  }

  rows.sort((a, b) => {
    const aRow = a.seats.find(seat => Number.isFinite(seat.row))?.row;
    const bRow = b.seats.find(seat => Number.isFinite(seat.row))?.row;

    if (Number.isFinite(aRow) && Number.isFinite(bRow) && aRow !== bRow) {
      return bRow - aRow;
    }

    return String(a.name).localeCompare(String(b.name), "en", { numeric: true });
  });

  const counts = seats.reduce(
    (result, seat) => {
      result.total += 1;
      result[seat.status] = (result[seat.status] || 0) + 1;

      if (seat.status === "available" || seat.status === "wheelchair" || seat.status === "sofa-available") {
        result.available += 1;
      } else if (seat.status === "sold" || seat.status === "sofa-sold") {
        result.sold += 1;
      } else if (seat.status === "broken") {
        result.blocked += 1;
      }

      return result;
    },
    {
      total: 0,
      available: 0,
      sold: 0,
      blocked: 0,
      wheelchair: 0,
      "sofa-available": 0,
      "sofa-sold": 0,
      unknown: 0
    }
  );

  return {
    provider: "mcl",
    cinemaCode: String(cinemaCode),
    sessionId: String(sessionId),
    totalColumns,
    rows,
    seats,
    counts,
    screenLabel: "銀幕",
    source: {
      provider: "mcl",
      endpoint: SEAT_BASE,
      updatedAt: new Date().toISOString()
    }
  };
}

async function fetchSeatPlan(cinemaCode, sessionId) {
  const params = new URLSearchParams({
    cinemaCode: String(cinemaCode),
    filmSessionId: String(sessionId),
    language: "zh-TW"
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${SEAT_BASE}?${params.toString()}`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.7",
        Referer: "https://www.mclcinema.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36"
      }
    });

    const html = await response.text();

    if (!response.ok) {
      throw new Error(`MCL seat plan HTTP ${response.status}`);
    }

    return html;
  } finally {
    clearTimeout(timer);
  }
}

export async function getMCLSeatMap(cinemaCode, sessionId) {
  const cinema = String(cinemaCode || "").trim();
  const session = String(sessionId || "").trim();

  if (!/^\d{1,4}$/.test(cinema)) {
    throw new Error("Invalid MCL cinema code");
  }

  if (!/^\d+$/.test(session)) {
    throw new Error("Invalid MCL session ID");
  }

  const html = await fetchSeatPlan(cinema, session);
  return parseSeatPlan(html, cinema, session);
}
