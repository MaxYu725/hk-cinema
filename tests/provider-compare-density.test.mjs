import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 6L comparison keeps dates, filters and explanations compact on the current stack", async () => {
  const [index, compare, insights, recommendations, resilience, preferences, density] = await Promise.all([
    source("app/index.html"),
    source("app/provider-compare-v4.js"),
    source("app/provider-compare-insights-v4.js"),
    source("app/provider-compare-recommendations-v4.js"),
    source("app/provider-compare-resilience-v3.js"),
    source("app/provider-compare-preferences-v2.js"),
    source("app/provider-compare-density.css")
  ]);

  assert.match(index, /provider-compare-density\.css\?v=6l1/);
  assert.match(compare, /provider-compare-date-rail/);
  assert.doesNotMatch(compare, /provider-compare-dates-section/);
  assert.match(compare, /<details class="provider-compare-note">/);
  assert.match(insights, /data-provider-filter-toggle/);
  assert.match(insights, /provider-compare-controls phase8c-controls[^>]+hidden/);
  assert.match(insights, /data-provider-compare-reset/);
  assert.match(recommendations, /function recommendationPool\(items/);
  assert.match(recommendations, /function balanced\(items\)/);
  assert.match(resilience, /provider-resilience-mini-dot/);
  assert.match(resilience, /provider-resilience-disclosure/);
  assert.doesNotMatch(preferences, /sheet\.appendChild\(button\)/);
  assert.match(density, /grid-template-columns: 1fr 1fr/);
  assert.match(density, /min-height: 66px/);
  assert.match(density, /provider-compare-controls\[hidden\]/);
});
