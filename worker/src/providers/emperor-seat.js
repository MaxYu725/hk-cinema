const API_BASE = "https://gopgrayesa-api.icirena.ai/sync";
const APP_KEY = "500000";
const CHANNEL_CODE = "ECML_WEB_PROD_S_MPS";
const APP_VERSION = "H5_5.0";
const SIGNING_KEY = "3VIDRSDxD0Ck2b6e9K0RaB9Xo5s81tep";
const REQUEST_TIMEOUT_MS = 10000;
const METHOD = "gop.alipic.icirena.own.seat.getSeatMap";

const encoder = new TextEncoder();
let importedSigningKey = null;

const FLAG_TYPES = Object.freeze({
  0: "general",
  1: "double",
  2: "double",
  4: "deformed",
  5: "vibrate",
  6: "couple",
  7: "couple",
  8: "single",
  9: "double-armchair",
  10: "double-armchair",
  11: "extended-recliner",
  12: "wheelchair"
});

const STATUS_TYPES = Object.freeze({
  1: "available",
  0: "unavailable",
  "-1": "disabled",
  "-2": "isolation"
});

function canonicalize(values) {
  return Object.keys(values)
    .sort()
    .reduce((output, key) => {
      const value = values[key];
      if (value === null || value === undefined || value === "") return output;
      const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `${output}${key}${rendered}`;
    }, "");
}

async function signingKey() {
  if (!importedSigningKey) {
    importedSigningKey = crypto.subtle.importKey(
      "raw",
      encoder.encode(SIGNING_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }
  return importedSigningKey;
}

async function sign(values) {
  const key = await signingKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalize(values))
  );
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function encodeForm(values) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return form.toString();
}

function emperorSeatError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function buildBody({ scheduleId, scheduleKey, cinemaLinkId, hallId }) {
  return {
    empCode: "",
    leaseCode: "",
    channelCode: CHANNEL_CODE,
    larkSid: "",
    version: "H5",
    appVersion: APP_VERSION,
    scheduleId,
    scheduleKey,
    cinemaLinkId,
    hallId,
    __cv__: "WEBSITE"
  };
}

function hngHeader(cinemaLinkId) {
  return encodeURIComponent(
    `region=&lang=zh_TW&currency=&tz=&betaFlag=2&betaUID=&betaChannel=${CHANNEL_CODE}&betaCinema=${cinemaLinkId || ""}`
  );
}

async function requestSeatMap(params) {
  const body = buildBody(params);
  const timestamp = Date.now();
  const query = {
    method: METHOD,
    app_key: APP_KEY,
    sign_method: "sha256",
    timestamp,
    format: "json",
    simplify: true
  };
  const signature = await sign({ ...query, ...body });
  const url = new URL(API_BASE);
  for (const [key, value] of Object.entries({ ...query, sign: signature })) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const hng = hngHeader(params.cinemaLinkId);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "*/*",
        "accept-language": "zh-HK,zh;q=0.9,en;q=0.7",
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.emperorcinemas.com",
        referer: `https://www.emperorcinemas.com/seat?wapid=${CHANNEL_CODE}&scheduleId=${encodeURIComponent(params.scheduleId)}&cinemaId=${encodeURIComponent(params.cinemaLinkId)}&cinemaLinkId=${encodeURIComponent(params.cinemaLinkId)}`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
        appKey: APP_KEY,
        channelCode: CHANNEL_CODE,
        "x-hng": hng,
        "EagleEye-UserData": hng
      },
      body: encodeForm(body)
    });

    if (response.status === 403) {
      throw emperorSeatError("EMPEROR_SEAT_BLOCKED", "Emperor seat-map request was rejected", 503);
    }
    if (response.status === 429) {
      throw emperorSeatError("EMPEROR_SEAT_RATE_LIMITED", "Emperor seat-map request was rate limited", 503);
    }
    if (!response.ok) {
      throw emperorSeatError("EMPEROR_SEAT_HTTP_ERROR", `Emperor seat-map upstream returned HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw emperorSeatError("EMPEROR_SEAT_INVALID_JSON", "Emperor seat-map upstream returned invalid JSON");
    }

    const result = payload?.result;
    if (!result || String(result.bizCode) !== "0") {
      throw emperorSeatError(
        "EMPEROR_SEAT_API_ERROR",
        result?.bizMsg || result?.bizAlertMsg || "Emperor seat-map API request failed"
      );
    }

    return {
      value: result.bizValue,
      traceId: result.traceId || null
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw emperorSeatError("EMPEROR_SEAT_TIMEOUT", "Emperor seat-map request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : null;
}

function seatType(flag, areaName = "") {
  const rawFlag = Number(flag);
  if (rawFlag === 4 && /輪椅|wheelchair/i.test(String(areaName || ""))) {
    return "wheelchair-area";
  }
  return FLAG_TYPES[rawFlag] || "special";
}

function seatStatus(status) {
  return STATUS_TYPES[Number(status)] || "unavailable";
}

function normalizeArea(area) {
  return {
    id: String(area?.areaId || ""),
    name: area?.areaName || null,
    color: area?.areaColor || null,
    colorId: Number.isFinite(Number(area?.areaColorId)) ? Number(area.areaColorId) : null,
    price: money(area?.displayPrice ?? area?.areaPrice),
    lowestPrice: money(area?.lowestPrice)
  };
}

function sectionBounds(seats) {
  if (!seats.length) {
    return { minLeft: 0, maxLeft: 0, minTop: 0, maxTop: 0, width: 0, height: 0 };
  }
  const lefts = seats.map(seat => Number(seat.leftPx)).filter(Number.isFinite);
  const tops = seats.map(seat => Number(seat.topPx)).filter(Number.isFinite);
  const minLeft = lefts.length ? Math.min(...lefts) : 0;
  const maxLeft = lefts.length ? Math.max(...lefts) : 0;
  const minTop = tops.length ? Math.min(...tops) : 0;
  const maxTop = tops.length ? Math.max(...tops) : 0;
  return {
    minLeft,
    maxLeft,
    minTop,
    maxTop,
    width: Math.max(0, maxLeft - minLeft + 32),
    height: Math.max(0, maxTop - minTop + 32)
  };
}

function normalizeSection(section) {
  const areas = (Array.isArray(section?.areaInfos) ? section.areaInfos : []).map(normalizeArea);
  const areaById = new Map(areas.map(area => [area.id, area]));
  const seats = (Array.isArray(section?.seats) ? section.seats : []).map(rawSeat => {
    const rawStatus = Number(rawSeat?.status);
    const rawFlag = Number(rawSeat?.flag);
    const areaId = String(rawSeat?.areaId || "");
    const areaName = areaById.get(areaId)?.name || null;
    const status = seatStatus(rawStatus);
    return {
      id: String(rawSeat?.seatId || ""),
      name: rawSeat?.name || null,
      row: Number.isFinite(Number(rawSeat?.row)) ? Number(rawSeat.row) : null,
      rowName: rawSeat?.rowName || null,
      column: Number.isFinite(Number(rawSeat?.column)) ? Number(rawSeat.column) : null,
      columnName: rawSeat?.columnName || null,
      position: {
        left: Number.isFinite(Number(rawSeat?.leftPx)) ? Number(rawSeat.leftPx) : 0,
        top: Number.isFinite(Number(rawSeat?.topPx)) ? Number(rawSeat.topPx) : 0,
        relativeLeftPercent: Number.isFinite(Number(rawSeat?.relativeLeftPx)) ? Number(rawSeat.relativeLeftPx) : 0,
        relativeTopPercent: Number.isFinite(Number(rawSeat?.relativeTopPx)) ? Number(rawSeat.relativeTopPx) : 0,
        rotate: Number.isFinite(Number(rawSeat?.rotateAngle)) ? Number(rawSeat.rotateAngle) : 0
      },
      areaId,
      areaName,
      rawFlag,
      type: seatType(rawFlag, areaName),
      rawStatus,
      status,
      selectable: rawStatus === 1
    };
  });

  return {
    id: String(section?.sectionId || ""),
    name: section?.sectionName || null,
    regular: Number(section?.regular) === 1,
    grid: {
      minRow: Number.isFinite(Number(section?.minRow)) ? Number(section.minRow) : null,
      maxRow: Number.isFinite(Number(section?.maxRow)) ? Number(section.maxRow) : null,
      minColumn: Number.isFinite(Number(section?.minColumn)) ? Number(section.minColumn) : null,
      maxColumn: Number.isFinite(Number(section?.maxColumn)) ? Number(section.maxColumn) : null,
      pitch: 32
    },
    bounds: sectionBounds(seats),
    areas,
    seats
  };
}

function summarize(sections, source) {
  const seats = sections.flatMap(section => section.seats);
  const count = status => seats.filter(seat => seat.status === status).length;
  return {
    total: seats.length,
    available: count("available"),
    unavailable: seats.filter(seat => seat.status !== "available").length,
    noSell: count("unavailable"),
    disabled: count("disabled"),
    isolation: count("isolation"),
    wheelchair: seats.filter(seat => seat.type === "wheelchair" || seat.type === "wheelchair-area").length,
    special: seats.filter(seat => seat.rawFlag !== 0).length,
    sourceSeatCount: Number.isFinite(Number(source?.seatCount)) ? Number(source.seatCount) : null,
    sourceSoldCount: Number.isFinite(Number(source?.soldCount)) ? Number(source.soldCount) : null
  };
}

export async function getEmperorSeatMap({ scheduleId, scheduleKey, cinemaLinkId, hallId }) {
  const params = {
    scheduleId: String(scheduleId || "").trim(),
    scheduleKey: String(scheduleKey || "").trim(),
    cinemaLinkId: String(cinemaLinkId || "").trim(),
    hallId: String(hallId || "").trim()
  };

  if (!/^\d{1,20}$/.test(params.scheduleId)) {
    throw emperorSeatError("INVALID_EMPEROR_SCHEDULE_ID", "scheduleId is invalid", 400);
  }
  if (!/^[A-Fa-f0-9]{16,80}$/.test(params.scheduleKey)) {
    throw emperorSeatError("INVALID_EMPEROR_SCHEDULE_KEY", "scheduleKey is invalid", 400);
  }
  if (!/^\d{1,20}$/.test(params.cinemaLinkId)) {
    throw emperorSeatError("INVALID_EMPEROR_CINEMA_ID", "cinemaLinkId is invalid", 400);
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(params.hallId)) {
    throw emperorSeatError("INVALID_EMPEROR_HALL_ID", "hallId is invalid", 400);
  }

  const result = await requestSeatMap(params);
  const source = result.value || {};
  const sections = (Array.isArray(source.sections) ? source.sections : []).map(normalizeSection);

  return {
    provider: "emperor",
    scheduleId: params.scheduleId,
    cinemaLinkId: params.cinemaLinkId,
    hallId: params.hallId,
    maxCanBuy: Number.isFinite(Number(source.maxCanBuy)) ? Number(source.maxCanBuy) : null,
    regular: Number(source.regular) === 1,
    notice: source.notice || null,
    popupNotices: Array.isArray(source.popupNoticeMsg) ? source.popupNoticeMsg : [],
    filmLevelNotice: source.filmLevelNoticeMsg || null,
    counts: summarize(sections, source),
    sections,
    source: "emperor-sync-seat-getSeatMap",
    traceId: result.traceId
  };
}
