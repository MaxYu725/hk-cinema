import {
  parseCineArtHomePayload,
  parseCineArtShowPayload
} from "../worker/src/providers/cineart-flight.js";

const HOME_URL = "https://cinearthouse.com.hk/hk";
const TIMEOUT_MS = 12000;
const MAX_ROUTE_EVIDENCE = 40;
const MAX_KEY_EVIDENCE = 80;

function headers(extra = {}) {
  return {
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArt/M7P1H-Audit)",
    ...extra
  };
}

async function fetchText(url, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: headers(extraHeaders),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return await response.text();
}

function showTimestamp(show) {
  const value = Date.parse(String(show?.time || ""));
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function selectSampleShow(props) {
  const now = Date.now();
  const eligible = (Array.isArray(props?.shows) ? props.shows : [])
    .filter(show =>
      show?.id != null &&
      show?.movie?.id != null &&
      show?.site?.id != null &&
      show?.published !== false &&
      show?.hold !== true
    );
  const future = eligible
    .filter(show => showTimestamp(show) >= now)
    .sort((a, b) => showTimestamp(a) - showTimestamp(b));
  return future[0] || eligible[0] || null;
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

async function fetchShow(show) {
  const showUrl = `${HOME_URL}/show/${encodeURIComponent(show.id)}`;
  const direct = await fetchText(showUrl);
  try {
    return { parsed: parseCineArtShowPayload(direct), transport: "document", showUrl };
  } catch {
    const rscUrl = `${showUrl}?_rsc=hkcinema-m7p1h-audit`;
    const rsc = await fetchText(rscUrl, {
      Accept: "*/*",
      RSC: "1",
      "Next-Url": `/hk/movie/${show.movie.id}`,
      "Next-Router-State-Tree": encodedRouterState(show.movie.id)
    });
    return { parsed: parseCineArtShowPayload(rsc), transport: "rsc", showUrl };
  }
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function flattenEvidence(value, path = "$", output = [], depth = 0) {
  if (depth > 8 || output.length >= 5000) return output;
  if (Array.isArray(value)) {
    value.slice(0, 60).forEach((item, index) => flattenEvidence(item, `${path}[${index}]`, output, depth + 1));
    return output;
  }
  if (!plainObject(value)) {
    output.push({ path, value });
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (output.length >= 5000) break;
    flattenEvidence(child, `${path}.${key}`, output, depth + 1);
  }
  return output;
}

function interestingKey(path) {
  return /(?:book|booking|reserve|reservation|purchase|checkout|ticket|seat|format|version|type|url|href|link|route|path)/i.test(path);
}

function routeLike(value) {
  const text = String(value ?? "").trim();
  return /(?:cinearthouse\.com\.hk|\/hk\/|\/seat\/|\/book(?:ing)?\/|\/checkout\/|\/purchase\/)/i.test(text);
}

function normalizeRouteEvidence(value) {
  let text = String(value ?? "").trim();
  if (!text) return null;
  text = text.replace(/[?#].*$/, "");
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return `${url.origin}${url.pathname}`;
    } catch {
      return text.slice(0, 180);
    }
  }
  return text.slice(0, 180);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function summarizeRawObject(value) {
  const rows = flattenEvidence(value);
  const keyEvidence = unique(rows
    .filter(row => interestingKey(row.path))
    .map(row => row.path))
    .slice(0, MAX_KEY_EVIDENCE);
  const routes = unique(rows
    .filter(row => routeLike(row.value))
    .map(row => normalizeRouteEvidence(row.value)))
    .slice(0, MAX_ROUTE_EVIDENCE);
  return { keyEvidence, routes };
}

function structuredFormats(movie, show) {
  const candidates = [
    ["movie.formats", movie?.formats],
    ["movie.format", movie?.format],
    ["movie.version", movie?.version],
    ["show.formats", show?.formats],
    ["show.format", show?.format],
    ["show.version", show?.version]
  ];
  return candidates
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([path, value]) => ({ path, value: Array.isArray(value) ? value : String(value) }));
}

function titleFormatHints(movie) {
  const title = JSON.stringify(movie?.title_lang || movie?.name_lang || movie?.title || movie?.name || "");
  return unique((title.match(/(?:IMAX(?: with Laser)?|Atmos|4DX|MX4D|D-BOX|3D|2D)/gi) || []).map(value => value.trim()));
}

const homeHtml = await fetchText(HOME_URL);
const home = parseCineArtHomePayload(homeHtml);
const sample = selectSampleShow(home.props);
if (!sample) throw new Error("No current CineArt show available for M7P1H audit");

const movies = Array.isArray(home.props?.movies) ? home.props.movies : [];
const movie = movies.find(item => String(item?.id ?? "") === String(sample.movie.id)) || sample.movie || {};
const detail = await fetchShow(sample);
const detailShow = detail.parsed?.props?.showDetail?.show || {};

const homeEvidence = summarizeRawObject({
  sampleShow: sample,
  sampleMovie: movie
});
const detailEvidence = summarizeRawObject({
  showId: detail.parsed?.props?.showId,
  showDetail: detailShow
});
const formatEvidence = structuredFormats(movie, sample);
const detailFormatEvidence = structuredFormats(detailShow?.movie || movie, detailShow);
const routeEvidence = unique([
  ...homeEvidence.routes,
  ...detailEvidence.routes
]);
const bookingKeyEvidence = unique([
  ...homeEvidence.keyEvidence,
  ...detailEvidence.keyEvidence
].filter(path => /book|reserve|reservation|purchase|checkout/i.test(path)));
const bookingRouteEvidence = routeEvidence.filter(value => /seat|book|checkout|purchase/i.test(value));

const result = {
  ok: true,
  audit: "M7P1H",
  source: HOME_URL,
  sample: {
    showId: String(sample.id),
    movieId: String(sample.movie.id),
    siteId: String(sample.site.id),
    houseId: sample?.house?.id != null ? String(sample.house.id) : null,
    detailTransport: detail.transport
  },
  structuredFormatEvidence: [...formatEvidence, ...detailFormatEvidence],
  titleOnlyFormatHints: titleFormatHints(movie),
  bookingEvidence: {
    keyPaths: bookingKeyEvidence,
    routeShapes: bookingRouteEvidence
  },
  routeEvidence,
  interestingKeyPaths: unique([
    ...homeEvidence.keyEvidence,
    ...detailEvidence.keyEvidence
  ]).slice(0, MAX_KEY_EVIDENCE),
  conclusion: {
    structuredFormatProven: formatEvidence.length + detailFormatEvidence.length > 0,
    bookingContractProven: bookingKeyEvidence.length > 0 && bookingRouteEvidence.length > 0
  }
};

console.log(JSON.stringify(result, null, 2));
