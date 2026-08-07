const SHOW_BASE_URL =
  "https://www.cinema.com.hk/hk/show";

function extractNextPayload(html) {
  const pattern =
    /<script[^>]*>\s*self\.__next_f\.push\((\[[\s\S]*?\])\)\s*<\/script>/g;

  let output = "";
  let match;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const chunk = JSON.parse(match[1]);

      if (
        Array.isArray(chunk) &&
        typeof chunk[1] === "string"
      ) {
        output += chunk[1];
      }
    } catch {
      // Ignore unrelated or malformed RSC chunks.
    }
  }

  return output;
}

function parseObjectAt(source, start) {
  if (source[start] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
      continue;
    }

    if (char === "}") {
      depth--;

      if (depth === 0) {
        try {
          return JSON.parse(
            source.slice(start, i + 1)
          );
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractObject(source, key) {
  const marker = `"${key}":{`;
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  return parseObjectAt(
    source,
    markerIndex + marker.length - 1
  );
}

function extractSeatLayout(source) {
  const pattern =
    /\{"width":\d+,"height":\d+,"iwidth":\d+,"iheight":\d+,[\s\S]{0,400}?"blocks":\[/g;

  let match;

  while ((match = pattern.exec(source)) !== null) {
    const value = parseObjectAt(source, match.index);

    if (
      value &&
      Array.isArray(value.blocks)
    ) {
      return value;
    }
  }

  return null;
}

function naturalCompare(a, b) {
  return String(a).localeCompare(
    String(b),
    "en",
    {
      numeric: true,
      sensitivity: "base"
    }
  );
}

function parseSeatLabel(label) {
  const match =
    String(label).match(/^(.+?)(\d+)$/);

  if (!match) {
    return {
      row: String(label),
      column: null
    };
  }

  return {
    row: match[1],
    column: Number(match[2])
  };
}

function normalizeStatus(value) {
  switch (value) {
    case "A":
      return "available";
    case "H":
      return "held";
    case "U":
      return "unavailable";
    default:
      return "unavailable";
  }
}

function normalizeType(providerType) {
  if (!providerType) {
    return "standard";
  }

  if (providerType === "wh") {
    return "wheelchair";
  }

  return "unknown";
}

function buildProviderTypeMap(layout) {
  const result = new Map();

  const ingest = (seats) => {
    if (!seats || typeof seats !== "object") {
      return;
    }

    for (const [label, data] of Object.entries(seats)) {
      if (
        data &&
        typeof data === "object" &&
        data.type
      ) {
        result.set(String(label), String(data.type));
      }
    }
  };

  ingest(layout?.seats);

  for (const block of layout?.blocks || []) {
    ingest(block?.seats);
  }

  return result;
}

function buildRows(seatStates, layout) {
  const typeMap = buildProviderTypeMap(layout);
  const rows = new Map();

  for (const [label, rawStatus] of Object.entries(seatStates)) {
    const parsed = parseSeatLabel(label);
    const providerType = typeMap.get(label) || null;

    if (!rows.has(parsed.row)) {
      rows.set(parsed.row, []);
    }

    rows.get(parsed.row).push({
      id: String(label),
      label:
        parsed.column !== null
          ? String(parsed.column)
          : String(label),
      row: parsed.row,
      column: parsed.column,
      status: normalizeStatus(rawStatus),
      type: normalizeType(providerType),
      providerType
    });
  }

  return Array.from(rows.entries())
    .sort(([rowA], [rowB]) =>
      naturalCompare(rowA, rowB)
    )
    .map(([name, seats]) => ({
      name,
      seats: seats.sort((a, b) => {
        if (
          a.column !== null &&
          b.column !== null
        ) {
          return a.column - b.column;
        }

        return naturalCompare(a.id, b.id);
      })
    }));
}

function buildSummary(seatStates) {
  const summary = {
    total: 0,
    available: 0,
    unavailable: 0,
    held: 0,
    sold: null,
    blocked: 0,
    accessibleAvailable: 0
  };

  for (const status of Object.values(seatStates)) {
    summary.total++;

    if (status === "A") {
      summary.available++;
    } else if (status === "H") {
      summary.held++;
      summary.unavailable++;
    } else {
      summary.unavailable++;
    }
  }

  summary.occupancy =
    summary.total > 0
      ? Number(
          (
            summary.unavailable /
            summary.total
          ).toFixed(3)
        )
      : null;

  return summary;
}

export async function getBroadwaySeatMap(showId) {
  const sourceId = String(showId)
    .replace(/^broadway:/, "")
    .trim();

  if (!/^\d+$/.test(sourceId)) {
    throw new Error(
      "Invalid Broadway show ID"
    );
  }

  const sourceUrl =
    `${SHOW_BASE_URL}/${sourceId}`;

  const response = await fetch(sourceUrl, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language":
        "zh-HK,zh-TW;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (compatible; HKCinema/0.1)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Broadway show returned HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const payload = extractNextPayload(html);

  if (!payload) {
    throw new Error(
      "Broadway show RSC payload not found"
    );
  }

  const seatStatus =
    extractObject(payload, "seatStatus");

  const seatStates =
    seatStatus?.seats;

  if (
    !seatStates ||
    typeof seatStates !== "object" ||
    Array.isArray(seatStates)
  ) {
    throw new Error(
      "Broadway seat status not found"
    );
  }

  const layout =
    extractSeatLayout(payload);

  const rows =
    buildRows(seatStates, layout);

  const summary =
    buildSummary(seatStates);

  const accessible = rows
    .flatMap((row) => row.seats)
    .filter(
      (seat) =>
        seat.type === "wheelchair" &&
        seat.status === "available"
    ).length;

  summary.accessibleAvailable = accessible;

  return {
    showId: `broadway:${sourceId}`,
    provider: "broadway",
    screen: "SCREEN",
    dimensions: layout
      ? {
          width: layout.width || null,
          height: layout.height || null
        }
      : null,
    rows,
    summary,
    sourceUrl,
    updatedAt: new Date().toISOString()
  };
}
