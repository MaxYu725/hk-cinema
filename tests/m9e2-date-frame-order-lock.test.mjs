import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9E2 ships a fresh M9B stylesheet cache key", async () => {
  const html = await readApp("index.html");
  assert.match(html, /m9b-loading-states\.css\?v=m9b-1-m9e3/);
});

test("M9E2 locks Metro comparison structure into a stable visual order", async () => {
  const css = await readApp("m9b-loading-states.css");

  assert.match(css, /provider-compare-timeline-section\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?flex-direction:\s*column\s*!important;/);
  assert.match(css, /provider-compare-date-rail\s*\{\s*order:\s*10;/);
  assert.match(css, /\[data-provider-insights\]\s*\{\s*order:\s*20;/);
  assert.match(css, /\[data-phase8b-recommendation-toggle\]\s*\{\s*order:\s*30;/);
  assert.match(css, /\[data-provider-recommendations\]\s*\{\s*order:\s*40;/);
  assert.match(css, /provider-compare-section-heading\s*\{\s*order:\s*50;/);
  assert.match(css, /\[data-insight-result\]\s*\{\s*order:\s*60;/);
  assert.match(css, /provider-compare-timeline[\s\S]*?order:\s*70;/);
  assert.match(css, /provider-compare-note\s*\{\s*order:\s*80;/);
});

test("M9E2 disables structural decorator animation only while date data is stale", async () => {
  const css = await readApp("m9b-loading-states.css");
  const loadingRule = css.match(/m9b-date-loading\s*>\s*\[data-provider-insights\][\s\S]*?transition:\s*none\s*!important;\s*\}/)?.[0] || "";
  assert.match(loadingRule, /animation:\s*none\s*!important/);
  assert.match(loadingRule, /transition:\s*none\s*!important/);
  assert.doesNotMatch(css, /\.provider-compare-date\s*\{[^}]*animation:\s*none/i, "date selection acknowledgement should remain available");
});

test("M9E2 keeps the frame-level mobile regression in the E2E suite", async () => {
  const source = await readFile(new URL("./e2e/m9e1-date-loading-stability.spec.mjs", new URL("../tests/", import.meta.url)), "utf8");
  assert.match(source, /requestAnimationFrame\(sample\)/);
  assert.match(source, /__m9e2Frames/);
  assert.match(source, /filter painted above date/);
  assert.match(source, /date\/filter\/reset should remain present through the sampled loading window/);
});
