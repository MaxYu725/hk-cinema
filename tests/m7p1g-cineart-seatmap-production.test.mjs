import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createCineArtSeatMapService } from "../worker/src/providers/cineart-seatmap.js";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");
const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const NOW_MS = Date.parse("2026-08-13T00:00:00.000Z");

function memoryCache() {
  const store = new Map();
  return {
    async match(request) {
      const response = store.get(request.url);
      return response ? response.clone() : null;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    }
  };
}

test("M7P1G Worker rebuilds official parametric CineArt geometry with strict states and wheelchair override", async () => {
  const html = await fixture("cineart-seatmap-parametric-flight.html");
  let calls = 0;
  const service = createCineArtSeatMapService({
    cache: memoryCache(),
    now: () => NOW_MS,
    fetchImpl: async url => {
      calls += 1;
      assert.equal(String(url), "https://cinearthouse.com.hk/hk/show/9001");
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
  });

  const result = await service.get("9001", "799");
  assert.equal(calls, 1);
  assert.equal(result.layoutMode, "positioned");
  assert.equal(result.bookingUrl, null);
  assert.deepEqual(result.counts, {
    total: 6,
    available: 3,
    held: 1,
    sold: 1,
    blocked: 1,
    unknown: 0,
    unavailable: 3,
    wheelchair: 1
  });
  const seats = result.sections[0].seats;
  assert.deepEqual(seats.map(seat => seat.id).sort(), ["A2", "A3", "B1", "B2", "B3", "B4"]);
  assert.equal(seats.some(seat => seat.id === "A1"), false);
  assert.equal(seats.some(seat => seat.id === "A4"), false);
  assert.equal(seats.find(seat => seat.id === "A2").status, "available");
  assert.equal(seats.find(seat => seat.id === "A3").status, "sold");
  assert.equal(seats.find(seat => seat.id === "B1").status, "held");
  assert.equal(seats.find(seat => seat.id === "B3").status, "blocked");
  assert.equal(seats.find(seat => seat.id === "B2").type, "wheelchair");
  assert.deepEqual(seats.find(seat => seat.id === "B2").position, {
    left: 130,
    top: 80,
    relativeLeftPercent: -50,
    relativeTopPercent: -50,
    rotate: 0
  });
  assert.deepEqual(seats.find(seat => seat.id === "A2").position, {
    left: 130,
    top: 120,
    relativeLeftPercent: -50,
    relativeTopPercent: -50,
    rotate: 0
  });
  assert.equal("seatStatus" in result, false);
  assert.equal("plan" in result, false);

  const cached = await service.get("9001", "799");
  assert.equal(calls, 1);
  assert.equal(cached.meta.cacheState, "fresh-edge");

  await assert.rejects(
    () => service.get("9001", "123"),
    error => error?.code === "CINEART_SEATMAP_MOVIE_MISMATCH"
  );
  assert.equal(calls, 2, "wrong movie id must not reuse a cached seat map for another movie id");
});

test("M7P1G refuses incomplete geometry instead of inventing a partial seat map", async () => {
  const original = await fixture("cineart-seatmap-parametric-flight.html");
  const broken = original.replace('\\"B4\\":\\"A\\"', '\\"C9\\":\\"A\\"');
  assert.notEqual(broken, original);
  const service = createCineArtSeatMapService({
    cache: memoryCache(),
    now: () => NOW_MS,
    fetchImpl: async () => new Response(broken, { status: 200, headers: { "content-type": "text/html" } })
  });
  await assert.rejects(
    () => service.get("9001", "799"),
    error => error?.code === "CINEART_SEATMAP_GEOMETRY_MISMATCH"
  );
});

test("M7P1G Registry keeps CineArt seatMap enabled while later booking capability advances independently", async () => {
  const registrySource = await source("app/provider-registry.js");
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const registry = window.HKCinemaProviderRegistry;
  const cineart = registry.get("cineart");
  assert.equal(typeof registry.version, "string");
  assert.ok(registry.version.length > 0);
  assert.equal(cineart.capabilities.seatMap, true);
  assert.equal(cineart.capabilities.booking, true);
});

test("M7P1G browser adapter owns request/view-model adaptation but never direct CineArt upstream transport", async () => {
  const adapterSource = await source("app/providers/cineart.js");
  assert.match(adapterSource, /seatMapRequest/);
  assert.match(adapterSource, /viewModels:\s*Object\.freeze\(\{[\s\S]*?seatMap:\s*seatMapViewModel[\s\S]*?\}\)/);
  assert.match(adapterSource, /layoutMode:\s*"positioned"/);
  assert.doesNotMatch(adapterSource, /cinearthouse\.com\.hk/);
  assert.doesNotMatch(adapterSource, /MutationObserver|IntersectionObserver/);
  assert.doesNotMatch(adapterSource, /comparison:\s*Object\.freeze\(\{[^}]*fetchShows/s);
});

test("M7P1G orientation hotfix keeps official coordinates and moves only the CineArt screen below positioned seats", async () => {
  const [css, shared, index] = await Promise.all([
    source("app/seatmap-shared.css"),
    source("app/seatmap-shared.js"),
    source("app/index.html")
  ]);
  assert.match(
    css,
    /\[data-seatmap-provider="cineart"\]\[data-layout-mode="positioned"\][\s\S]*?\.shared-seatmap-layout\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/
  );
  assert.match(
    css,
    /\[data-seatmap-provider="cineart"\]\[data-layout-mode="positioned"\][\s\S]*?\.shared-seatmap-screen\s*\{[\s\S]*?order:\s*2;/
  );
  assert.match(
    css,
    /\[data-seatmap-provider="cineart"\]\[data-layout-mode="positioned"\][\s\S]*?\.shared-seatmap-section\s*\{[\s\S]*?order:\s*1;/
  );
  assert.match(
    shared,
    /const top = \(\(Number\(position\.top \|\| 0\) - Number\(section\.bounds\?\.minTop \|\| 0\)\) \* metrics\.scale\) \+ 24;/
  );
  assert.doesNotMatch(shared, /scaleY\(-1\)|rotateX\(180deg\)|geometryHeight\s*-\s*Number\(position\.top/);
  assertAsset(index, "seatmap-shared.css");
});

test("M7P1G comparison renders authoritative CineArt show id directly into the seat-map trigger", async () => {
  const compare = await source("app/provider-compare-v4.js");
  assert.match(compare, /data-showtime-id/);
  assert.match(compare, /cineart-seatmap-launch/);
  assert.match(compare, /role=\"button\" tabindex=\"0\"/);
  assert.match(compare, /item\.provider === "cineart"/);
});

test("M7P1G CineArt launcher is delegated only and uses the shared seat-map owner", async () => {
  const launcher = await source("app/cineart-seatmap.js");
  assert.match(launcher, /HKCinemaSeatMapShared/);
  assert.match(launcher, /\/api\/cineart\/shows\/\$\{encodeURIComponent\(showId\)\}\/seats/);
  assert.match(launcher, /HKCinemaViewModels\.seatMap\("cineart"/);
  assert.doesNotMatch(launcher, /MutationObserver|IntersectionObserver/);
  assert.doesNotMatch(launcher, /cinearthouse\.com\.hk/);
});

test("M7P1G Worker route is GET-only and keeps the global health phase untouched", async () => {
  const [router, manifest] = await Promise.all([
    source("worker/src/router.js"),
    source("worker/src/provider-manifest.js")
  ]);
  assert.match(router, /\/api\\\/cineart\\\/shows/);
  assert.match(router, /phase:\s*"M7P1G"/);
  assert.match(router, /mode:\s*"read-only-seatmap-official-geometry"/);
  assert.match(router, /CineArt seat map is read-only/);
  assert.match(manifest, /catalogue-showtimes-detailed-price-strict-seats-seatmap-production-readonly/);
});

test("M7P1G begins only after M7P1F Android installed-PWA acceptance passed", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1g-cineart-seatmap-production.md");
  assert.match(checkpoint, /M7P1F Android installed-PWA acceptance:\s*\*\*PASS\*\*/i);
  assert.match(checkpoint, /This PASS is the release gate permitting M7P1G to begin/i);
});
