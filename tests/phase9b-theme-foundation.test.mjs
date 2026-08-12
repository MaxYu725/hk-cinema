import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app/theme-foundation.css", import.meta.url), "utf8");

test("Phase 9B1 keeps the Classic skin foundation available after Metro becomes default", () => {
  assert.match(index, /<html lang="zh-HK" data-skin="metro">/);
  assert.match(index, /const resolved = skin === "classic" \? "classic" : "metro"/);
  const phase8d = index.indexOf("phase8d-smart-picks.css?v=8d1");
  const themeLink = index.indexOf("theme-foundation.css?v=9b1");
  assert.ok(phase8d >= 0, "Phase 8D stylesheet should remain loaded");
  assert.ok(themeLink > phase8d, "theme foundation must load after feature styles so tokens can normalize presentation");
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
