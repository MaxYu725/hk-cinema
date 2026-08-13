import {
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "./cineart-flight.js";
import { CINEART_HOME_URL } from "./cineart.js";

const FRESH_TTL_SECONDS = 15;
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;
const CACHE_KEY_BASE = "https://hk-cinema.internal/cache/m7p1g/cineart/seatmap";

function seatMapError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isFinite(status)) error.status = status;
  return error;
}

function boundedPositiveInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericId(value, code, label) {
  const id = String(value || "").trim();
  if (!/^\d+$/.test(id)) throw seatMapError(code, `${label} must be numeric`, 400);
  return id;
}

function optionalNumericId(value, code, label) {
  if (value === null || value === undefined || value === "") return null;
  return numericId(value, code, label);
}

function encodedRouterState(movieId) {
  return encodeURIComponent(JSON.stringify([
    "",
    {
      children: [
        ["lng", "hk", "d"],
        {
          children: [
            "movie",
            {
              children: [
                ["movieId", String(movieId), "d"],
                { children: ["__PAGE__", {}, null, null] },
                null,
                null
              ]
            },
            null,
            null
          ]
        },
        null,
        null,
        true
      ]
    },
    null,
    null
  ]));
}

async function readBoundedText(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw seatMapError("CINEART_SEATMAP_PAYLOAD_TOO_LARGE", `CineArt seat-map payload exceeded ${maxBytes} bytes`, 502);
    }
    return text;
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("cineart-seatmap-payload-too-large").catch(() => {});
        throw seatMapError("CINEART_SEATMAP_PAYLOAD_TOO_LARGE", `CineArt seat-map payload exceeded ${maxBytes} bytes`, 502);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

async function fetchDocument({ fetchImpl, url, timeoutMs, maxBytes, headers = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("cineart-seatmap-timeout"), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArt/M7P1G)",
        ...headers
      }
    });
    if (!response.ok) {
      throw seatMapError(
        "CINEART_SEATMAP_HTTP_ERROR",
        `CineArt show detail returned HTTP ${response.status}`,
        response.status
      );
    }
    return await readBoundedText(response, maxBytes);
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw seatMapError("CINEART_SEATMAP_TIMEOUT", "CineArt seat-map request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchShowParsed({ fetchImpl, showId, movieSourceId, timeoutMs, maxBytes }) {
  const showUrl = `${CINEART_HOME_URL}/show/${encodeURIComponent(showId)}`;
  const direct = await fetchDocument({ fetchImpl, url: showUrl, timeoutMs, maxBytes });
  try {
    return { parsed: parseCineArtShowPayload(direct), transport: "document" };
  } catch (directError) {
    if (!movieSourceId) throw directError;
    const rsc = await fetchDocument({
      fetchImpl,
      url: `${showUrl}?_rsc=hkcinema-m7p1g`,
      timeoutMs,
      maxBytes,
      headers: {
        Accept: "*/*",
        RSC: "1",
        "Next-Url": `/hk/movie/${movieSourceId}`,
        "Next-Router-State-Tree": encodedRouterState(movieSourceId)
      }
    });
    return { parsed: parseCineArtShowPayload(rsc), transport: "rsc" };
  }
}

function alphaIndex(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(text)) return null;
  let result = 0;
  for (const char of text) result = (result * 26) + (char.charCodeAt(0) - 64);
  return result - 1;
}

function alphaLabel(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function rowLabel(block, rowIndex) {
  const base = alphaIndex(block?.row);
  const rows = Number(block?.rows);
  if (base === null || !Number.isInteger(rows) || rows < 1) return null;
  if (block?.rowDir === "u") return alphaLabel(base + (rows - 1 - rowIndex));
  if (block?.rowDir === "d") return alphaLabel(base + rowIndex);
  return null;
}

function columnNumber(block, rowIndex, columnIndex) {
  const rowStarts = Array.isArray(block?.col) ? block.col : [];
  const start = numeric(rowStarts[rowIndex]) ?? numeric(block?.ccol);
  const cols = Number(block?.cols);
  if (!Number.isInteger(start) || !Number.isInteger(cols) || cols < 1) return null;
  if (block?.colDir === "d") return start + columnIndex;
  if (block?.colDir === "u") return start + (cols - 1 - columnIndex);
  return null;
}

function removedCells(block) {
  return new Set((Array.isArray(block?.removed) ? block.removed : [])
    .map(item => {
      const row = numeric(item?.r);
      const column = numeric(item?.c);
      return Number.isInteger(row) && Number.isInteger(column) ? `${row}:${column}` : null;
    })
    .filter(Boolean));
}

function seatStatus(value) {
  if (value === "A") return "available";
  if (value === "H") return "held";
  if (value === "U") return "sold";
  if (value === "L") return "blocked";
  return "unknown";
}

function seatType(block, seatId) {
  const override = block?.seats && typeof block.seats === "object" ? block.seats[seatId] : null;
  if (String(override?.type || "").toLowerCase() === "wh") return "wheelchair";
  return "standard";
}

function blockDimensions(block, plan) {
  const rows = Number(block?.rows);
  const cols = Number(block?.cols);
  const seatWidth = numeric(plan?.w);
  const seatHeight = numeric(plan?.h);
  const gapX = numeric(plan?.gx) ?? 0;
  const gapY = numeric(plan?.gy) ?? 0;
  if (
    !Number.isInteger(rows) || rows < 1 ||
    !Number.isInteger(cols) || cols < 1 ||
    !(seatWidth > 0) || !(seatHeight > 0) || gapX < 0 || gapY < 0
  ) {
    return null;
  }
  return {
    rows,
    cols,
    seatWidth,
    seatHeight,
    gapX,
    gapY,
    width: (cols * seatWidth) + (Math.max(0, cols - 1) * gapX),
    height: (rows * seatHeight) + (Math.max(0, rows - 1) * gapY)
  };
}

function normalizeGeometry(plan, statuses) {
  const canvasWidth = numeric(plan?.width);
  const canvasHeight = numeric(plan?.height);
  const blocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
  if (!(canvasWidth > 0) || !(canvasHeight > 0) || !blocks.length) {
    throw seatMapError("CINEART_SEATMAP_GEOMETRY_MISSING", "CineArt show did not provide usable seat-plan geometry", 502);
  }

  const seats = [];
  const generated = new Set();
  for (const [blockIndex, block] of blocks.entries()) {
    const dimensions = blockDimensions(block, plan);
    const centerX = numeric(block?.x);
    const centerY = numeric(block?.y);
    if (!dimensions || centerX === null || centerY === null) {
      throw seatMapError("CINEART_SEATMAP_BLOCK_INVALID", `CineArt seat-plan block ${blockIndex} is incomplete`, 502);
    }
    const removed = removedCells(block);
    const firstCenterX = centerX - (dimensions.width / 2) + (dimensions.seatWidth / 2);
    const firstCenterY = centerY - (dimensions.height / 2) + (dimensions.seatHeight / 2);

    for (let rowIndex = 0; rowIndex < dimensions.rows; rowIndex += 1) {
      const row = rowLabel(block, rowIndex);
      if (!row) {
        throw seatMapError("CINEART_SEATMAP_ROW_DIRECTION_UNSUPPORTED", `CineArt seat-plan block ${blockIndex} has unsupported row direction`, 502);
      }
      for (let columnIndex = 0; columnIndex < dimensions.cols; columnIndex += 1) {
        if (removed.has(`${rowIndex}:${columnIndex}`)) continue;
        const column = columnNumber(block, rowIndex, columnIndex);
        if (!Number.isInteger(column)) {
          throw seatMapError("CINEART_SEATMAP_COLUMN_DIRECTION_UNSUPPORTED", `CineArt seat-plan block ${blockIndex} has unsupported column direction`, 502);
        }
        const id = `${row}${column}`;
        if (!Object.hasOwn(statuses, id)) continue;
        if (generated.has(id)) {
          throw seatMapError("CINEART_SEATMAP_DUPLICATE_SEAT", `CineArt seat-plan generated duplicate seat ${id}`, 502);
        }
        generated.add(id);
        seats.push({
          id,
          label: id,
          row,
          column,
          status: seatStatus(statuses[id]),
          type: seatType(block, id),
          selectable: statuses[id] === "A",
          providerStatus: statuses[id],
          providerType: block?.seats?.[id]?.type || null,
          position: {
            left: firstCenterX + (columnIndex * (dimensions.seatWidth + dimensions.gapX)),
            top: firstCenterY + (rowIndex * (dimensions.seatHeight + dimensions.gapY)),
            relativeLeftPercent: -50,
            relativeTopPercent: -50,
            rotate: numeric(block?.rr) ?? 0
          },
          blockIndex
        });
      }
    }
  }

  const statusKeys = Object.keys(statuses);
  const missing = statusKeys.filter(key => !generated.has(key));
  if (missing.length || generated.size !== statusKeys.length) {
    throw seatMapError(
      "CINEART_SEATMAP_GEOMETRY_MISMATCH",
      `CineArt seat-plan geometry matched ${generated.size}/${statusKeys.length} seat states`,
      502
    );
  }

  const count = status => seats.filter(seat => seat.status === status).length;
  return {
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      seatWidth: numeric(plan?.w),
      seatHeight: numeric(plan?.h),
      gapX: numeric(plan?.gx),
      gapY: numeric(plan?.gy),
      blockCount: blocks.length,
      componentCount: Array.isArray(plan?.comps) ? plan.comps.length : 0
    },
    sections: [{
      id: "main",
      name: null,
      bounds: {
        minLeft: 0,
        maxLeft: canvasWidth,
        minTop: 0,
        maxTop: canvasHeight,
        width: canvasWidth,
        height: canvasHeight
      },
      seats
    }],
    counts: {
      total: seats.length,
      available: count("available"),
      held: count("held"),
      sold: count("sold"),
      blocked: count("blocked"),
      unknown: count("unknown"),
      unavailable: count("held") + count("sold") + count("blocked"),
      wheelchair: seats.filter(seat => seat.type === "wheelchair").length
    }
  };
}

function normalizeSeatMap(parsed, { showId, movieSourceId, transport, nowMs }) {
  const props = parsed?.props || {};
  const show = props?.showDetail?.show || {};
  const resolvedShowId = String(show?.id ?? props?.showId ?? "");
  const resolvedMovieId = show?.movie?.id != null ? String(show.movie.id) : null;
  if (resolvedShowId !== showId) {
    throw seatMapError("CINEART_SEATMAP_SHOW_MISMATCH", "CineArt seat-map detail did not match the requested show", 502);
  }
  if (movieSourceId && resolvedMovieId && resolvedMovieId !== movieSourceId) {
    throw seatMapError("CINEART_SEATMAP_MOVIE_MISMATCH", "CineArt seat-map detail did not match the requested movie", 502);
  }

  const statuses = props?.seatStatus?.seats && typeof props.seatStatus.seats === "object"
    ? props.seatStatus.seats
    : null;
  if (!statuses || !Object.keys(statuses).length) {
    throw seatMapError("CINEART_SEATMAP_STATUS_MISSING", "CineArt show did not provide seat-status data", 502);
  }

  const plan = resolveCineArtFlightTextReference(parsed?.flight || "", show?.plan?.config);
  if (!plan || typeof plan !== "object") {
    throw seatMapError("CINEART_SEATMAP_PLAN_MISSING", "CineArt show did not provide a resolvable seat plan", 502);
  }
  const geometry = normalizeGeometry(plan, statuses);
  const updatedAt = new Date(nowMs).toISOString();
  return {
    provider: "cineart",
    showId,
    movieSourceId: resolvedMovieId || movieSourceId || null,
    layoutMode: "positioned",
    screenLabel: "銀幕",
    bookingUrl: null,
    ...geometry,
    updatedAt,
    source: {
      parser: "cineart-next-flight-seatmap",
      transport,
      geometry: "official-parametric-blocks",
      seatStates: "A/H/U/L",
      updatedAt
    }
  };
}

function cacheKey(showId) {
  return new Request(`${CACHE_KEY_BASE}?showId=${encodeURIComponent(showId)}`, { method: "GET" });
}

async function readCached(cache, showId) {
  if (!cache?.match) return null;
  const response = await cache.match(cacheKey(showId));
  if (!response) return null;
  try {
    const payload = await response.json();
    return payload?.provider === "cineart" && payload?.showId === showId ? payload : null;
  } catch {
    return null;
  }
}

function cacheResponse(payload, ttlSeconds) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttlSeconds}`
    }
  });
}

export function createCineArtSeatMapService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  freshTtlSeconds = FRESH_TTL_SECONDS
} = {}) {
  const boundedTimeout = boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 500, 8000);
  const boundedMaxBytes = boundedPositiveInteger(maxBytes, DEFAULT_MAX_BYTES, 128 * 1024, 5 * 1024 * 1024);

  async function get(showIdValue, movieSourceIdValue = null, { ctx = null } = {}) {
    const showId = numericId(showIdValue, "CINEART_SEATMAP_INVALID_SHOW", "CineArt show id");
    const movieSourceId = optionalNumericId(movieSourceIdValue, "CINEART_SEATMAP_INVALID_MOVIE", "CineArt movie id");
    const cached = await readCached(cache, showId);
    if (cached) {
      return {
        ...cached,
        meta: { ...(cached.meta || {}), cache: true, cacheState: "fresh-edge" }
      };
    }

    const nowMs = now();
    const detail = await fetchShowParsed({
      fetchImpl,
      showId,
      movieSourceId,
      timeoutMs: boundedTimeout,
      maxBytes: boundedMaxBytes
    });
    const result = normalizeSeatMap(detail.parsed, {
      showId,
      movieSourceId,
      transport: detail.transport,
      nowMs
    });
    const stored = {
      ...result,
      meta: { cache: false, cacheState: "network" }
    };
    if (cache?.put) {
      const write = cache.put(cacheKey(showId), cacheResponse(stored, freshTtlSeconds));
      if (ctx?.waitUntil) ctx.waitUntil(write);
      else await write;
    }
    return stored;
  }

  return Object.freeze({ get });
}

export const cineArtSeatMapService = createCineArtSeatMapService();

export const CINEART_SEATMAP_CONFIG = Object.freeze({
  freshTtlSeconds: FRESH_TTL_SECONDS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBytes: DEFAULT_MAX_BYTES
});
