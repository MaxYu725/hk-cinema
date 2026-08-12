import {
  parseCineArtHomePayload,
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "./cineart-flight.js";

const CINEART_HOME_URL = "https://cinearthouse.com.hk/hk";
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

function sourceError(code, message, status = null) {
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

async function readBoundedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw sourceError(
        "CINEART_SOURCE_PAYLOAD_TOO_LARGE",
        `CineArt source payload exceeded ${maxBytes} bytes`
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("cineart-source-payload-too-large").catch(() => {});
        throw sourceError(
          "CINEART_SOURCE_PAYLOAD_TOO_LARGE",
          `CineArt source payload exceeded ${maxBytes} bytes`
        );
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

async function fetchDocument({
  fetchImpl,
  url,
  timeoutMs,
  maxBytes,
  headers = {}
}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("cineart-source-timeout"),
    timeoutMs
  );

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArtDiscovery/M7B)",
        ...headers
      }
    });

    if (!response.ok) {
      throw sourceError(
        "CINEART_SOURCE_HTTP_ERROR",
        `CineArt source returned HTTP ${response.status}`,
        response.status
      );
    }

    return await readBoundedText(response, maxBytes);
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw sourceError("CINEART_SOURCE_TIMEOUT", "CineArt source request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function showTimestamp(show) {
  const value = Date.parse(show?.time || "");
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function selectSampleShow(shows, nowMs) {
  const eligible = shows.filter(
    show =>
      show?.id != null &&
      show?.movie?.id != null &&
      show?.site?.id != null &&
      show?.house?.id != null &&
      show?.published !== false &&
      show?.hold !== true
  );

  const future = eligible
    .filter(show => showTimestamp(show) >= nowMs)
    .sort((a, b) => showTimestamp(a) - showTimestamp(b));

  return future[0] || eligible[0] || null;
}

export function summarizeCineArtHome(props, { nowMs = Date.now() } = {}) {
  const shows = Array.isArray(props?.shows) ? props.shows : [];
  const movies = Array.isArray(props?.movies) ? props.movies : [];
  const sites = Array.isArray(props?.showSites) ? props.showSites : [];
  const houses = Array.isArray(props?.houseList) ? props.houseList : [];
  const dates = shows.map(show => isoDate(show?.date)).filter(Boolean).sort();
  const sampleShow = selectSampleShow(shows, nowMs);

  const showtimePriceCount = shows.filter(
    show => numeric(show?.price) != null
  ).length;
  const seatSummaryCount = shows.filter(
    show =>
      numeric(show?.seats) != null &&
      numeric(show?.sold) != null &&
      numeric(show?.avaliable) != null
  ).length;

  return {
    source: "cineart-next-flight-home",
    sourceUrl: CINEART_HOME_URL,
    movieCount: movies.length,
    showCount: shows.length,
    siteCount: sites.length,
    houseCount: houses.length,
    dateRange: {
      from: dates[0] || null,
      to: dates.at(-1) || null
    },
    sites: sites.map(site => ({
      id: site?.id ?? null,
      code: site?.code || null,
      name: site?.name || null,
      nameLang: site?.name_lang || null
    })),
    showtimePriceCount,
    seatSummaryCount,
    sampleShow: sampleShow
      ? {
          id: numeric(sampleShow.id),
          movieId: numeric(sampleShow.movie?.id),
          siteId: numeric(sampleShow.site?.id),
          houseId: numeric(sampleShow.house?.id),
          date: isoDate(sampleShow.date),
          time: sampleShow.time || null,
          price: numeric(sampleShow.price),
          seats: numeric(sampleShow.seats),
          sold: numeric(sampleShow.sold),
          available: numeric(sampleShow.avaliable)
        }
      : null
  };
}

export function summarizeCineArtShow(parsed) {
  const props = parsed?.props || {};
  const show = props?.showDetail?.show || {};
  const statuses =
    props?.seatStatus?.seats && typeof props.seatStatus.seats === "object"
      ? props.seatStatus.seats
      : {};
  const seatStatusCounts = {};

  for (const state of Object.values(statuses)) {
    const key = String(state || "unknown");
    seatStatusCounts[key] = (seatStatusCounts[key] || 0) + 1;
  }

  const ticketTypes = Array.isArray(show?.ticketPrice?.ticketTypes)
    ? show.ticketPrice.ticketTypes
    : [];
  const seatPlanConfig = resolveCineArtFlightTextReference(
    parsed?.flight || "",
    show?.plan?.config
  );

  return {
    source: "cineart-next-flight-show",
    showId: numeric(show?.id),
    movieId: numeric(show?.movie?.id),
    siteId: numeric(show?.site?.id),
    houseId: numeric(show?.house?.id),
    price: numeric(show?.price),
    ticketPriceRuleId: show?.ticketPrice?.id ?? null,
    ticketTypeCount: ticketTypes.length,
    activeOnlineTicketTypes: ticketTypes
      .filter(ticket => ticket?.active === true && ticket?.online === true)
      .map(ticket => ({
        name: ticket?.name || null,
        price: numeric(ticket?.price),
        concession: ticket?.concession === true
      })),
    seatStatusCount: Object.keys(statuses).length,
    seatStatusCounts,
    seatPlan: {
      resolved: Boolean(seatPlanConfig && typeof seatPlanConfig === "object"),
      numSeats: numeric(seatPlanConfig?.numSeats),
      blockCount: Array.isArray(seatPlanConfig?.blocks)
        ? seatPlanConfig.blocks.length
        : 0,
      width: numeric(seatPlanConfig?.width),
      height: numeric(seatPlanConfig?.height)
    },
    readOnly: true
  };
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

async function fetchShowPayload({
  fetchImpl,
  show,
  timeoutMs,
  maxBytes
}) {
  const showUrl = `${CINEART_HOME_URL}/show/${show.id}`;
  const direct = await fetchDocument({
    fetchImpl,
    url: showUrl,
    timeoutMs,
    maxBytes
  });

  try {
    return parseCineArtShowPayload(direct);
  } catch {
    const rscUrl = `${showUrl}?_rsc=hkcinema-m7b`;
    const rsc = await fetchDocument({
      fetchImpl,
      url: rscUrl,
      timeoutMs,
      maxBytes,
      headers: {
        Accept: "*/*",
        RSC: "1",
        "Next-Url": `/hk/movie/${show.movieId}`,
        "Next-Router-State-Tree": encodedRouterState(show.movieId)
      }
    });
    return parseCineArtShowPayload(rsc);
  }
}

export async function discoverCineArtDataSources({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => Date.now()
} = {}) {
  const boundedTimeout = boundedPositiveInteger(
    timeoutMs,
    DEFAULT_TIMEOUT_MS,
    500,
    DEFAULT_TIMEOUT_MS
  );
  const boundedMaxBytes = boundedPositiveInteger(
    maxBytes,
    DEFAULT_MAX_BYTES,
    64 * 1024,
    DEFAULT_MAX_BYTES
  );

  const homeText = await fetchDocument({
    fetchImpl,
    url: CINEART_HOME_URL,
    timeoutMs: boundedTimeout,
    maxBytes: boundedMaxBytes
  });
  const homeParsed = parseCineArtHomePayload(homeText);
  const home = summarizeCineArtHome(homeParsed.props, { nowMs: now() });

  if (!home.sampleShow) {
    throw sourceError(
      "CINEART_SOURCE_EMPTY",
      "CineArt home payload contained no usable showtime sample"
    );
  }

  const detailParsed = await fetchShowPayload({
    fetchImpl,
    show: home.sampleShow,
    timeoutMs: boundedTimeout,
    maxBytes: boundedMaxBytes
  });
  const detail = summarizeCineArtShow(detailParsed);

  const correlation = {
    showIdMatches: detail.showId === home.sampleShow.id,
    seatCountMatches:
      detail.seatStatusCount > 0 &&
      detail.seatStatusCount === home.sampleShow.seats,
    availableStateMatches:
      numeric(detail.seatStatusCounts.A) != null &&
      numeric(detail.seatStatusCounts.A) === home.sampleShow.available,
    unavailableStateMatches:
      numeric(detail.seatStatusCounts.U) != null &&
      numeric(detail.seatStatusCounts.U) === home.sampleShow.sold
  };

  return {
    provider: "cineart",
    mode: "m7b-data-source-discovery",
    home,
    detail,
    correlation,
    capabilities: {
      catalogue: home.movieCount > 0,
      showtimes: home.showCount > 0,
      showtimePrice: home.showtimePriceCount > 0,
      seatSummary: home.seatSummaryCount > 0,
      ticketTypes: detail.ticketTypeCount > 0,
      seatMapReadOnly:
        detail.readOnly === true &&
        detail.seatStatusCount > 0 &&
        detail.seatPlan.resolved === true
    }
  };
}

export const CINEART_SOURCE_CONFIG = Object.freeze({
  homeUrl: CINEART_HOME_URL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBytes: DEFAULT_MAX_BYTES
});
