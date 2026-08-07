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
  const match = source.match(
    new RegExp(`${name}=["']([^"']*)["']`, "i")
  );
  return match ? decodeHtml(match[1]) : null;
}

function normalizeStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "normal":
      return "available";
    case "sold":
      return "sold";
    case "broken":
      return "broken";
    case "wheelchair":
      return "wheelchair";
    case "sofaavailable":
      return "sofa-available";
    case "sofasold":
      return "sofa-sold";
    default:
      return "unknown";
  }
}

function parseSeatPlan(html, cinemaCode, sessionId) {
  const totalColumnsMatch = html.match(
    /totalNumberOfColumns\s*=\s*(\d+)/i
  );
  const totalColumns = Number(totalColumnsMatch?.[1] || 0) || null;

  const seats = [];
  const rows = [];
  const rowPattern = /<tr\b[^>]*row-name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowName = decodeHtml(rowMatch[1]);
    const rowHtml = rowMatch[2];
    const rowSeats = [];
    const imgPattern = /<img\b([^>]*\bstatus=["'][^"']+["'][^>]*)>/gi;
    let imgMatch;

    while ((imgMatch = imgPattern.exec(rowHtml)) !== null) {
      const tag = imgMatch[1];
      const seatNum = attr(tag, "seatNum") || attr(tag, "id");
      const row = Number(attr(tag, "row"));
      const column = Number(attr(tag, "column"));
      const upstreamStatus = attr(tag, "status") || "Unknown";

      if (!seatNum || !Number.isFinite(column)) {
        continue;
      }

      const seat = {
        id: seatNum,
        seatNum,
        rowName,
        row: Number.isFinite(row) ? row : null,
        column,
        area: attr(tag, "area"),
        areaCode: attr(tag, "areaCode"),
        status: normalizeStatus(upstreamStatus),
        upstreamStatus
      };

      seats.push(seat);
      rowSeats.push(seat);
    }

    if (rowSeats.length) {
      rows.push({
        name: rowName,
        seats: rowSeats.sort((a, b) => a.column - b.column)
      });
    }
  }

  if (!seats.length) {
    throw new Error("MCL seat plan contained no seats");
  }

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
