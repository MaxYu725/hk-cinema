import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

const [wrangler, entry, router, emperorShim, seatShim] = await Promise.all([
  read("worker/wrangler.jsonc"),
  read("worker/src/index.js"),
  read("worker/src/router.js"),
  read("worker/src/index-emperor.js"),
  read("worker/src/index-emperor-seat.js")
]);

test("Phase 10R2A keeps the production Worker on the single declarative route chain", () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/index\.js"/);
  assert.match(entry, /import \{ json, routeRequest \} from "\.\/router\.js"/);
  assert.match(entry, /routeRequest\(request, env, ctx\)/);
  assert.equal(emperorShim.trim(), 'export { default } from "./index.js";');
  assert.equal(seatShim.trim(), 'export { default } from "./index.js";');

  for (const route of [
    "/api/broadway/movies",
    "/api/mcl/ticketing",
    "/api/emperor/movies",
    "emperor-seatmap",
    "cineart-showtimes"
  ]) {
    assert.ok(router.includes(route), `missing route: ${route}`);
  }
});

test("Phase 10R2A preserves live-data cache ownership while public responses stay uncached", () => {
  assert.match(router, /export const PUBLIC_CACHE_CONTROL = "no-store"/);
  assert.match(router, /headers\.set\("cache-control", PUBLIC_CACHE_CONTROL\)/);
  assert.match(router, /export const CACHE_OWNERS = Object\.freeze/);
  for (const owner of ["catalogue", "showtimes", "price", "seatSummary", "seatMap", "shell"]) {
    assert.match(router, new RegExp(`\\b${owner}:`));
  }
  assert.doesNotMatch(router, /public, max-age=/);
});

test("Phase 10R2A keeps invalid provider identifiers out of upstream requests", () => {
  assert.match(router, /INVALID_DATE/);
  assert.match(router, /INVALID_MCL_CINEMA_CODE/);
  assert.match(router, /INVALID_MCL_MOVIE_ID/);
  assert.match(router, /INVALID_EMPEROR_FILM_ID/);
});

test("Phase 10R2A keeps health and telemetry responses uncached and traceable", () => {
  assert.match(router, /exact\("health", "\/health"/);
  assert.match(router, /PUBLIC_CACHE_CONTROL/);
  assert.match(entry, /x-request-id/);
  assert.match(entry, /server-timing/);
  assert.match(entry, /access-control-expose-headers/);
});
