import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertAssetOrder } from "./index-assets.mjs";

const index = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app/theme-foundation.css", import.meta.url), "utf8");
const metro = readFileSync(new URL("../app/metro-theme.css", import.meta.url), "utf8");

test("the shared theme foundation feeds one Metro presentation runtime", () => {
  assert.match(index, /<html lang="zh-HK" data-skin="metro">/);
  assert.doesNotMatch(index, /applySkin|skin=classic|URLSearchParams/);
  assertAssetOrder(index, "phase8d-smart-picks.css", "theme-foundation.css", "metro-theme.css");
});

test("semantic and legacy tokens resolve from Metro skin values", () => {
  assert.doesNotMatch(theme, /data-skin="classic"/);
  assert.match(metro, /--skin-background:/);
  assert.match(theme, /--color-background: var\(--skin-background\)/);
  assert.match(theme, /--radius-card: var\(--skin-radius-card\)/);
  assert.match(theme, /--bg: var\(--color-background\)/);
  assert.match(theme, /--surface: var\(--color-surface\)/);
  assert.match(theme, /--accent: var\(--color-accent\)/);
});

test("production copy and reduced-motion presentation remain intact", () => {
  assert.doesNotMatch(index, /電影資料來源將於下一階段接入|HK Cinema · Preview/);
  assert.match(index, /正在同步各院線最新電影資料/);
  assert.match(index, /HK Cinema · 香港戲院場次比較/);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/);
});
