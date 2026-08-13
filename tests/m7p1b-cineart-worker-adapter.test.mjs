import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseCineArtHomePayload,
  parseCineArtShowPayload
} from "../worker/src/providers/cineart-flight.js";
import {
  discoverCineArt,
  normalizeCineArtHome,
  normalizeCineArtShowDetail,
  probeCineArt
} from "../worker/src/providers/cineart.js";
import {
  PROVIDER_MANIFEST,
  WORKER_PROVIDER_IDS,
  providerHealthMap
} from "../worker/src/provider-manifest.js";

const ROOT = new URL("../", import.meta.url);
const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const source = path => readFile(new URL(path, ROOT), "utf8");
const NOW_MS = Date.parse("2026-08-13T00:00:00.000Z");

function htmlResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

test("M7P1B parses the minimized current-shape CineArt home Flight fixture and preserves coarse seat semantics", async () => {
  const home = await fixture("cineart-home-flight.html");
  const parsed = parseCineArtHomePayload(home);
  const normalized = normalizeCineArtHome(parsed.props, { nowMs: NOW_MS });

  assert.equal(parsed.props.movies.length, 2);
  assert.equal(parsed.props.showSites.length, 5);
  assert.equal(normalized.catalogue.now.length, 1);
  assert.equal(normalized.catalogue.coming.length, 1);
  assert.equal(normalized.cinemas.length, 5);
  assert.equal(normalized.sessions.length, 1);

  const session = normalized.sessions[0];
  assert.equal(session.sourceId, "9001");
  assert.equal(session.movieSourceId, "799");
  assert.equal(session.cinema.sourceId, "18");
  assert.equal(session.time, "19:30");
  assert.equal(session.price.display, 110);
  assert.equal(session.languages[0], "粵語");
  assert.equal(session.subtitles[0], "中文字幕");
  assert.deepEqual(session.formats, []);

  assert.equal(session.seatSummary.quality, "coarse-not-sold");
  assert.equal(session.seatSummary.total, 4);
  assert.equal(session.seatSummary.sold, 1);
  assert.equal(session.seatSummary.notSold, 3);
  assert.equal(session.seatSummary.available, null);
  assert.equal(session.seatSummary.held, null);
  assert.equal(session.seatSummary.upstreamSeatsHold, 1);
});

test("M7P1B parses GET-only show detail into ticket prices, strict A/H/U/L seats and read-only geometry", async () => {
  const show = await fixture("cineart-show-flight.html");
  const parsed = parseCineArtShowPayload(show);
  const detail = normalizeCineArtShowDetail(parsed, { nowMs: NOW_MS });

  assert.equal(detail.showSourceId, "9001");
  assert.equal(detail.movieSourceId, "799");
  assert.equal(detail.price.display, 110);
  assert.equal(detail.price.adult, 110);
  assert.equal(detail.price.student, 95);
  assert.equal(detail.price.ticketTypes.length, 2);
  assert.deepEqual(
    {
      total: detail.seatSummary.total,
      available: detail.seatSummary.available,
      held: detail.seatSummary.held,
      sold: detail.seatSummary.sold,
      blocked: detail.seatSummary.blocked
    },
    { total: 4, available: 1, held: 1, sold: 1, blocked: 1 }
  );
  assert.equal(detail.seatPlan.resolved, true);
  assert.equal(detail.seatPlan.numSeats, 4);
  assert.equal(detail.seatPlan.blockCount, 1);
  assert.equal(detail.seatPlan.width, 100);
  assert.equal(detail.seatPlan.height, 50);
  assert.equal(detail.readOnly, true);
});

test("M7P1B discovery correlates home/show data and performs only read-only GET requests", async () => {
  const [home, show] = await Promise.all([
    fixture("cineart-home-flight.html"),
    fixture("cineart-show-flight.html")
  ]);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return htmlResponse(String(url).includes("/show/") ? show : home);
  };

  const result = await discoverCineArt({ fetchImpl, now: () => NOW_MS });
  assert.equal(result.provider, "cineart");
  assert.equal(result.home.cinemaCount, 5);
  assert.equal(result.home.catalogue.now, 1);
  assert.equal(result.home.catalogue.coming, 1);
  assert.equal(result.detail.transport, "document");
  assert.deepEqual(result.correlation, {
    showIdMatches: true,
    movieIdMatches: true,
    seatTotalMatches: true,
    soldMatches: true,
    notSoldMatches: true
  });
  assert.equal(result.capabilities.catalogue, true);
  assert.equal(result.capabilities.showtimes, true);
  assert.equal(result.capabilities.basePrice, true);
  assert.equal(result.capabilities.detailedPrices, true);
  assert.equal(result.capabilities.coarseSeatSummary, true);
  assert.equal(result.capabilities.strictSeatSummary, true);
  assert.equal(result.capabilities.seatMapReadOnly, true);
  assert.equal(result.capabilities.languageMetadata, true);
  assert.equal(result.capabilities.subtitleMetadata, true);
  assert.equal(result.capabilities.formatMetadata, false);
  assert.equal(result.capabilities.booking, false);
  assert.equal(calls.length, 2);
  assert.equal(calls.every(call => call.options.method === "GET"), true);
});

test("M7P1B show-detail fallback remains GET-only and uses bounded RSC navigation headers", async () => {
  const [home, show] = await Promise.all([
    fixture("cineart-home-flight.html"),
    fixture("cineart-show-flight.html")
  ]);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (!String(url).includes("/show/")) return htmlResponse(home);
    if (!String(url).includes("?_rsc=")) return htmlResponse("<html>no show props</html>");
    return htmlResponse(show);
  };

  const result = await discoverCineArt({ fetchImpl, now: () => NOW_MS });
  assert.equal(result.detail.transport, "rsc");
  assert.equal(calls.length, 3);
  assert.equal(calls.every(call => call.options.method === "GET"), true);
  const rsc = calls[2];
  assert.equal(rsc.options.headers.RSC, "1");
  assert.equal(rsc.options.headers["Next-Url"], "/hk/movie/799");
  assert.match(rsc.options.headers["Next-Router-State-Tree"], /%5B/);
});

test("M7P1B probe is bounded and identifies the CineArt site without cookies or tokens", async () => {
  const home = await fixture("cineart-home-flight.html");
  const calls = [];
  const result = await probeCineArt({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return htmlResponse(home);
    }
  });

  assert.equal(result.evidence, "site-shell-cinema-directory");
  assert.equal(result.source, "cinearthouse-hk");
  assert.equal(result.cinemaCount, 5);
  assert.equal(result.nextJsDetected, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal("Cookie" in calls[0].options.headers, false);
  assert.equal("Authorization" in calls[0].options.headers, false);

  await assert.rejects(
    () => probeCineArt({
      maxBytes: 64 * 1024,
      fetchImpl: async () => htmlResponse("x".repeat(70 * 1024))
    }),
    error => error?.code === "CINEART_PAYLOAD_TOO_LARGE"
  );
});

test("M7P1B registers CineArt only in the Worker universe while browser production remains three-provider", async () => {
  const [registry, appIndex, workerIndex, topRouter] = await Promise.all([
    source("app/provider-registry.js"),
    source("app/index.html"),
    source("worker/src/index.js"),
    source("worker/src/index-emperor-seat.js")
  ]);

  assert.doesNotMatch(registry, /id:\s*["']cineart["']/i);
  assert.doesNotMatch(appIndex, /providers\/cineart|cineart-status|cineart-compare/i);
  assert.equal(WORKER_PROVIDER_IDS.includes("cineart"), true);
  assert.equal(PROVIDER_MANIFEST.filter(entry => entry.id === "cineart").length, 1);
  assert.equal(providerHealthMap().cineart, "candidate-catalogue-shows-readonly");
  assert.match(workerIndex, /phase:\s*["']6G["']/);
  assert.match(topRouter, /\/api\/providers\/cineart\/discovery/);
  assert.doesNotMatch(topRouter, /\/api\/cineart\/catalogue|\/api\/cineart\/movies/);
});
