import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertAssetOrder } from "./index-assets.mjs";

const root = process.cwd();
const app = path.join(root, "app");

function read(relativePath) {
  return fs.readFileSync(path.join(app, relativePath), "utf8");
}

test("Classic latch is isolated while the transient sticky marker remains neutral", () => {
  const js = read("phase9d0-home-sticky-scroll.js");
  const home = read("home-library.js");
  assert.match(js, /dataset\.skin !== "classic"/);
  assert.match(js, /function setLatched\(element, next\)/);
  assert.match(js, /classList\.toggle\("is-stuck-latched", latched\)/);
  assert.doesNotMatch(js, /classList\.toggle\("is-stuck",/);
  assert.match(home, /classList\.toggle\("is-stuck", stuck\)/);
  assert.match(js, /version:\s*VERSION/);
  assert.match(js, /const VERSION\s*=\s*["'][^"']+["']/);
});

test("sticky latch keeps the buffered enter threshold and independent exit threshold", () => {
  const js = read("phase9d0-home-sticky-scroll.js");
  assert.match(js, /MIN_ENTER_BUFFER\s*=\s*64/);
  assert.match(js, /EXIT_BUFFER\s*=\s*8/);
  assert.match(js, /expandedHeight - compactHeight \+ 16/);
  assert.match(js, /edge >= anchor \+ enterBuffer\(element\)/);
  assert.match(js, /edge <= anchor - EXIT_BUFFER/);
  assert.match(js, /addEventListener\("scroll", schedule, \{ passive: true \}\)/);
});

test("sticky presentation effects are scoped to Classic instead of being counteracted by Metro JS", () => {
  const baseCss = read("home-library.css");
  const stickyCss = read("phase9d0-home-sticky-scroll.css");
  const metro = read("metro-runtime.js");

  assert.match(baseCss, /html\[data-skin="classic"\] \.home-library-tools\.is-stuck/);
  assert.match(baseCss, /html\[data-skin="classic"\] \.home-library-tools\.is-stuck \.home-library-filter-options/);
  assert.match(stickyCss, /html\[data-skin="classic"\] \.home-library-tools\.is-stuck-latched/);
  assert.doesNotMatch(stickyCss, /html\[data-skin="metro"\]/);
  assert.doesNotMatch(metro, /syncLegacyStickyState|style\.display\s*=\s*"grid"/);
  assert.doesNotMatch(metro, /addEventListener\("scroll", scheduleSync/);
});

test("production versions the consolidated sticky owner after the home library", () => {
  const html = read("index.html");
  assertAssetOrder(html, "home-library.js", "phase9d0-home-sticky-scroll.js");
  assertAssetOrder(html, "home-library.css", "phase9d0-home-sticky-scroll.css");
});
