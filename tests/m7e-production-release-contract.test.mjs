import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const liveConfig = await readFile(new URL("../playwright.live.config.mjs", import.meta.url), "utf8");
const liveSpec = await readFile(new URL("./e2e-live/m7e-production.spec.mjs", import.meta.url), "utf8");
const productionValidator = await readFile(new URL("../scripts/m7e-cineart-production-validation.mjs", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/live-provider-validation.yml", import.meta.url), "utf8");

test("M7E production Playwright config targets deployed Pages without a local webServer", () => {
  assert.match(liveConfig, /HK_CINEMA_PAGES_URL/);
  assert.match(liveConfig, /https:\/\/maxyu725\.github\.io\/hk-cinema\//);
  assert.match(liveConfig, /production-mobile-chromium/);
  assert.doesNotMatch(liveConfig, /webServer\s*:/);
});

test("M7E live UI smoke stays live instead of intercepting provider traffic", () => {
  assert.match(liveSpec, /data-provider=\\?"cineart\\?"/);
  assert.match(liveSpec, /data-cineart-enriched/);
  assert.match(liveSpec, /data-price-loaded/);
  assert.match(liveSpec, /data-seat-loaded/);
  assert.match(liveSpec, /serviceWorker\.getRegistrations/);
  assert.doesNotMatch(liveSpec, /page\.route\s*\(/);
  assert.doesNotMatch(liveSpec, /route\.fulfill\s*\(/);
});

test("M7E production validator checks only production CineArt contracts", () => {
  assert.match(productionValidator, /\/api\/cineart\/catalogue/);
  assert.match(productionValidator, /\/api\/cineart\/movies\/\$\{encodeURIComponent\(catalogue\.sampleMovieId\)\}\/shows/);
  assert.match(productionValidator, /\/api\/cineart\/shows\/\$\{encodeURIComponent\(sample\.sourceId\)\}\/detail/);
  assert.match(productionValidator, /strict-seat-state/);
  assert.match(productionValidator, /detail\.readOnly !== true/);
  assert.doesNotMatch(productionValidator, /\/api\/providers\/cineart\/discovery/);
  assert.doesNotMatch(productionValidator, /\/api\/providers\/probe\/cineart/);
});

test("live-provider workflow revalidates CineArt production contracts and deployed mobile UI", () => {
  assert.match(workflow, /m7e-cineart-production-validation\.mjs/);
  assert.match(workflow, /playwright\.live\.config\.mjs/);
  assert.match(workflow, /production-mobile-ui/);
  assert.match(workflow, /playwright-failure-live-/);
});
