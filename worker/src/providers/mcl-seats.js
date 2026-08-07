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
  const match = String(source || "").match(
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

function toNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatus(status, seatStyle = "") {
  const value = String(status || "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
  const style = String(seatStyle || "")
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
  const sofa = style.includes("sofa");

  switch (value) {
    case "normal":
    case "available":
    case "free":
    case "vibrate":
      return sofa ? "sofa-available" : "available";
    case "sofaleft":
    case "sofaright":
    case "sofaavailable":
      return "sofa-available";
    case "sofasold":
    case "sofaoccupied":
      return "sofa-sold";
    case "sold":
    case "occupied":
    case "unavailable":
    case "reserved":
    case "hold":
    case "held":
      return sofa ? "sofa-sold" : "sold";
    case "broken":
    case "blocked":
    case "disabled":
      return "broken";
    case "wheelchair":
    case "wheelchairavailable":
      return "wheelchair";
    default:
      return "unknown";
  }
}

function findStatusTag(cellHtml) {
  const tagPattern = /<(?:img|div|span|label|input|button)\b([^>]*)>/gi;
  let match;

  while ((match = tagPattern.exec(cellHtml)) !== null) {
    if (
      /(?:^|\s)(?:status|seatStatus|seatstatus|seat-status|data-status|data-seat-status)=["']/i.test(
        match[1]
      )
    ) {
      return match[1];
    }
  }

  return null;
}

function findSeatName(cellHtml, statusAttrs) {
  const direct = firstAttr(statusAttrs, [
    "seatNum",
    "seatnum",
    "seat-number",
    "data-seat-num",
    "data-seat-number",
    "data-seat",
    "id"
  ]);

  if (direct) return direct;

  const labelMatch = cellHtml.match(/<label\b([^>]*)>/i);
  if (labelMatch) {
    return firstAttr(labelMatch[1], [
      "seatNum",
      "seatnum",
      "seat-number",
      "data-seat-num",
      "data-seat-number",
      "data-seat",
      "for",
      "id"
    ]);
  }

  return null;
}

function textContent(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function buildSeatFromCell(tdAttrs, cellHtml, rowName, displayCell, areaIndex) {
  const statusAttrs = findStatusTag(cellHtml);
  if (!statusAttrs) return null;

  const seatNum = findSeatName(cellHtml, statusAttrs);
  if (!seatNum) return null;

  const upstreamStatus = firstAttr(statusAttrs, [
    "status",
    "seatStatus",
    "seatstatus",
    "seat-status",
    "data-status",
    "data-seat-status"
  ]) || "Unknown";

  const seatStyle = firstAttr(tdAttrs, [
    "seatStyle",
    "seatstyle",
    "seat-style",
    "data-seat-style"
  ]) || "";

  const rawRow = firstAttr(statusAttrs, [
    "row",
    "data-row",
    "row-index",
    "data-row-index"
  ]);

  const rawColumn = firstAttr(statusAttrs, [
    "column",
    "data-column",
    "col",
    "data-col"
  ]);

  const explicitRowName = firstAttr(statusAttrs, [
    "row-name",
    "rowName",
    "rowname",
    "data-row-name"
  ]);

  const inferredRowName = String(seatNum).match(/^([^0-9]+)/)?.[1] || null;
  const resolvedRowName = explicitRowName || rowName || inferredRowName || "";
  const status = normalizeStatus(upstreamStatus, seatStyle);

  return {
    id: String(seatNum),
    seatNum: String(seatNum),
    rowName: resolvedRowName,
    row: toNumber(rawRow),
    column: toNumber(rawColumn),
    displayCell,
    areaIndex,
    area: firstAttr(statusAttrs, ["area", "data-area"]),
    areaCode: firstAttr(statusAttrs, ["areaCode", "areacode", "data-area-code"]),
    seatStyle: seatStyle || null,
    status,
    upstreamStatus,
    span: status === "sofa-available" || status === "sofa-sold" ? 2 : 1
  };
}

function parseAreas(html) {
  const areas = [];
  const allSeats = [];
  const tablePattern = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const tableAttrs = tableMatch[1];
    const className = attr(tableAttrs, "class") || "";

    if (!/(?:^|\s)area(?:\s|$)/i.test(className)) {
      continue;
    }

    const areaIndex = areas.length;
    const areaRows = [];
    const areaSeats = [];
    let cellColumns = 0;
    const rowPattern = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(tableMatch[2])) !== null) {
      const rowAttrs = rowMatch[1];
      const rowHtml = rowMatch[2];
      const tdMatches = Array.from(
        rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)
      );

      if (!tdMatches.length) continue;

      cellColumns = Math.max(cellColumns, tdMatches.length);

      let rowName = attr(rowAttrs, "row-name") || "";
      if (!rowName) {
        for (const td of tdMatches) {
          if (/rowLabel/i.test(td[2])) {
            const candidate = textContent(td[2]);
            if (candidate) {
              rowName = candidate;
              break;
            }
          }
        }
      }

      const rowSeats = [];

      tdMatches.forEach((td, index) => {
        const seat = buildSeatFromCell(
          td[1],
          td[2],
          rowName,
          index + 1,
          areaIndex
        );

        if (!seat) return;
        rowSeats.push(seat);
        areaSeats.push(seat);
        allSeats.push(seat);
      });

      if (rowName || rowSeats.length) {
        areaRows.push({
          name: rowName,
          cellCount: tdMatches.length,
          seats: rowSeats
        });
      }
    }

    if (!areaSeats.length) continue;

    areas.push({
      index: areaIndex,
      className,
      ratioLeft: toNumber(attr(tableAttrs, "RatioLeft"), 0),
      ratioTop: toNumber(attr(tableAttrs, "RatioTop"), 0),
      cellColumns,
      rows: areaRows,
      seatCount: areaSeats.length
    });
  }

  return { areas, seats: allSeats };
}

function parseSeatPlan(html, cinemaCode, sessionId) {
  const declaredColumns = toNumber(
    html.match(/totalNumberOfColumns\s*=\s*(\d+)/i)?.[1]
  );

  const { areas, seats } = parseAreas(html);

  if (!areas.length || !seats.length) {
    const hasSeatPlan = /id=["']seatplan["']/i.test(html);
    const hasAreaTable = /<table\b[^>]*class=["'][^"']*\barea\b/i.test(html);
    const bytes = new TextEncoder().encode(html).length;

    throw new Error(
      `MCL 暫未提供可解析座位圖（bytes=${bytes}, seatplan=${hasSeatPlan ? "yes" : "no"}, areaTable=${hasAreaTable ? "yes" : "no"}）`
    );
  }

  const totalColumns = declaredColumns || Math.max(
    ...areas.map(area => area.cellColumns),
    1
  );

  const counts = seats.reduce(
    (result, seat) => {
      result.total += 1;
      result[seat.status] = (result[seat.status] || 0) + 1;

      if (
        seat.status === "available" ||
        seat.status === "wheelchair" ||
        seat.status === "sofa-available"
      ) {
        result.available += 1;
      } else if (
        seat.status === "sold" ||
        seat.status === "sofa-sold"
      ) {
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
    layoutVersion: 2,
    totalColumns,
    areas,
    rows: areas.flatMap(area =>
      area.rows.map(row => ({
        ...row,
        areaIndex: area.index
      }))
    ),
    seats,
    counts,
    screenLabel: "銀幕",
    source: {
      provider: "mcl",
      endpoint: SEAT_BASE,
      parser: "official-table-v2",
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
