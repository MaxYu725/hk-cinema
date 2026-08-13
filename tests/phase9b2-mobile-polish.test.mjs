import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertAssetOrder } from "./index-assets.mjs";

const index = fs.readFileSync("app/index.html", "utf8");
const css = fs.readFileSync("app/phase9b2-classic-mobile-polish.css", "utf8");

test("Phase 9B2 loads after the shared theme foundation", () => {
  assertAssetOrder(index, "theme-foundation.css", "phase9b2-classic-mobile-polish.css");
});

test("Phase 9B2 remains a Classic skin instead of forking product runtime", () => {
  assert.match(css, /html\[data-skin="classic"\]/);
  assert.doesNotMatch(css, /data-skin="metro"/);
  assert.doesNotMatch(index, /phase9b2[^\n]*\.js/);
});

test("Phase 9B2 covers the primary mobile browsing surfaces", () => {
  [
    ".movie-card",
    ".home-library-tools",
    ".provider-compare-hero",
    ".provider-compare-date",
    ".phase8b-section-toggle",
    ".phase8d-smart-pick",
    ".provider-compare-show.phase6m-show-card",
    ".provider-compare-booking"
  ].forEach(selector => assert.ok(css.includes(selector), `missing polish contract for ${selector}`));
});

test("Phase 9B2 keeps explicit narrow-phone fallbacks", () => {
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
});
