import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAsset, assertAssetOrder } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase M3 loads the Metro comparison presentation after the consolidated Metro theme", async () => {
  const index = await read("app/index.html");
  assertAssetOrder(index, "metro-theme.css", "metro-m3-comparison.css");
  assert.doesNotMatch(index, /metro-m2-home-polish\.css/);
  assertAsset(index, "phase10r3a-mobile-shell-date-strip.js");
  assertAsset(index, "metro-runtime.js");
});

test("Phase M3 comparison shell follows the supplied Metro structure without forking provider logic", async () => {
  const [css, runtime, phase10] = await Promise.all([
    read("app/metro-m3-comparison.css"),
    read("app/metro-runtime.js"),
    read("app/phase10r3a-mobile-shell-date-strip.js")
  ]);

  assert.match(css, /provider-compare-overlay\[hidden\][\s\S]*display:\s*none\s*!important/);
  assert.match(css, /html\[data-skin="metro"\] \.provider-compare-sheet[\s\S]*width:\s*min\(100%,\s*500px\)/);
  assert.match(css, /\.metro-compare-nav[\s\S]*justify-content:\s*space-between/);
  assert.match(css, /\.provider-compare-hero[\s\S]*grid-template-columns:\s*92px minmax\(0,\s*1fr\)/);
  assert.match(css, /\.provider-compare-date\.active[\s\S]*background:\s*var\(--metro-accent\)/);
  assert.match(css, /phase8b-movie-details[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /data-mcl-seat-lazy-note[\s\S]*display:\s*none\s*!important/);
  assert.match(runtime, /MOVIEMETRO \/ 場次比較/);
  assert.match(runtime, /actions\.insertBefore\(health, close\)/);
  assert.doesNotMatch(runtime, /metro-meta-separator/);
  assert.match(runtime, /電影場次比較/);
  assert.match(runtime, /syncComparisonShell/);
  assert.match(phase10, /dataset\.skin === "metro"\) return false/);
  assert.doesNotMatch(runtime, /fetch\(|API_BASE|providerSourceIds/);
});

test("Phase M3 comparison remains compatible with the current controlled shell cache", async () => {
  const worker = await read("app/sw.js");
  assert.match(worker, /CACHE_NAME = `\$\{CACHE_PREFIX\}m5-1`/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  const installBlock = worker.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
});
