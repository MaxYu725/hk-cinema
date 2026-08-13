import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertAssetOrder } from "./index-assets.mjs";

const index = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app/theme-foundation.css", import.meta.url), "utf8");

test("Phase 9B1 keeps the Classic skin foundation available after Metro becomes default", () => {
  assert.match(index, /<html lang="zh-HK" data-skin="metro">/);
  assert.match(index, /const resolved = skin === "classic" \? "classic" : "metro"/);
  assertAssetOrder(index, "phase8d-smart-picks.css", "theme-foundation.css");
});

test("Phase 9B1 exposes skin, semantic and legacy token layers", () => {
  assert.match(theme, /html\[data-skin="classic"\]/);
  assert.match(theme, /--skin-background:/);
  assert.match(theme, /--color-background: var\(--skin-background\)/);
  assert.match(theme, /--radius-card: var\(--skin-radius-card\)/);
  assert.match(theme, /--bg: var\(--color-background\)/);
  assert.match(theme, /--surface: var\(--color-surface\)/);
  assert.match(theme, /--accent: var\(--color-accent\)/);
});

test("Phase 9B1 retires preview-era shell copy", () => {
  assert.doesNotMatch(index, /電影資料來源將於下一階段接入/);
  assert.doesNotMatch(index, /HK Cinema · Preview/);
  assert.match(index, /正在同步各院線最新電影資料/);
  assert.match(index, /HK Cinema · 香港戲院場次比較/);
});

test("Phase 9B1 keeps reduced-motion behavior in the presentation layer", () => {
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/);
});
