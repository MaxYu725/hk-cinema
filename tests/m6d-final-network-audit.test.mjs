import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("M6D 2D home card capture has one showtime owner per click", async () => {
  const navigation = await read("app/phase8a-movie-navigation.js");
  const captureListener = navigation.indexOf('window.addEventListener("click"');
  const stopImmediate = navigation.indexOf("event.stopImmediatePropagation()", captureListener);
  const openCard = navigation.indexOf("openCard(card)", captureListener);

  assert.ok(captureListener >= 0);
  assert.ok(stopImmediate > captureListener);
  assert.ok(openCard > stopImmediate);
  assert.match(navigation, /window\.HKCinemaProviderCompare\?\.open\?\.\(aggregate\.id\)/);
});

test("M6D 2D provider catalogue refresh owners prevent status re-entry", async () => {
  const [mcl, emperor, health] = await Promise.all([
    read("app/mcl-status.js"),
    read("app/emperor-status.js"),
    read("app/data-health.js")
  ]);

  assert.match(mcl, /let refreshInFlight = false/);
  assert.match(mcl, /if \(refreshInFlight\)[\s\S]*return/);
  assert.match(mcl, /finally \{[\s\S]*refreshInFlight = false/);

  assert.match(emperor, /let refreshInFlight = false/);
  assert.match(emperor, /if \(refreshInFlight\) return/);
  assert.match(emperor, /finally \{[\s\S]*refreshInFlight = false/);

  assert.match(health, /button\.disabled = loading/);
  assert.match(health, /REFRESH_BUSY_MAX_MS/);
});

test("M6D 2D adjacent-date prefetch is cancelled before a new lifecycle owner proceeds", async () => {
  const prefetch = await read("app/provider-compare-prefetch.js");

  assert.match(prefetch, /function cancelScheduled\(\)[\s\S]*activeController\.abort\("superseded"\)/);
  assert.match(prefetch, /type === "open" \|\| type === "close" \|\| type === "date-change" \|\| type === "reload"/);
  assert.match(prefetch, /providerIds\(\)\.map\(provider => \(\{/);
  assert.match(prefetch, /cache\.prefetchProvider\(entry\.provider, sourceId, date, signal\)/);
  assert.doesNotMatch(prefetch, /prefetchBroadway\(context\.broadwayId/);
  assert.doesNotMatch(prefetch, /prefetchEmperor\(context\.emperorId/);
});

test("M6D 2D live cinema and Worker data remain outside the Service Worker shell cache", async () => {
  const sw = await read("app/sw.js");

  assert.match(sw, /url\.origin !== self\.location\.origin \|\| !url\.pathname\.startsWith\(SCOPE_URL\.pathname\)/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
  assert.doesNotMatch(sw, /caches\.open\([^\n]+\)[\s\S]{0,500}hk-cinema-api\.max-yu-jp\.workers\.dev/);
});

test("M6D 2D avoids generic global request coalescing and keeps bounded provider-specific caches", async () => {
  const cache = await read("app/provider-compare-main-cache-v3.js");

  assert.match(cache, /const DEFAULT_TTL_MS = 60 \* 1000/);
  assert.match(cache, /PROVIDER_TTL_OVERRIDES = Object\.freeze\(\{ mcl: 90 \* 1000 \}\)/);
  assert.match(cache, /Object\.fromEntries\(PROVIDERS\.map\(provider => \[provider, new Map\(\)\]\)\)/);
  assert.match(cache, /function ttlForProvider\(provider\)/);
  assert.match(cache, /function rememberWorkerShows\(/);
  assert.match(cache, /payload\?\.ok !== true/);
  assert.match(cache, /async function getWorkerShows\(/);
  assert.doesNotMatch(cache, /window\.fetch\s*=/);
  assert.doesNotMatch(cache, /const\s+(?:inFlight|inflight|pendingRequests)\s*=\s*new Map/);
});
