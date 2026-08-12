import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, manifestText, sw, metro, classic, phase10, audit] = await Promise.all([
  read("app/index.html"),
  read("app/manifest.json"),
  read("app/sw.js"),
  read("app/metro-runtime.js"),
  read("app/classic-final-ui-polish.js"),
  read("app/phase10r3a-mobile-shell-date-strip.js"),
  read("docs/m6a-production-baseline-audit.md")
]);
const manifest = JSON.parse(manifestText);

test("M6A freezes Metro as production default while retaining explicit Classic fallback", () => {
  assert.match(index, /<html[^>]*data-skin="metro"/);
  assert.match(index, /skin === "classic" \? "classic" : "metro"/);
  assert.match(index, /Metro is now the production default; Classic remains available as an explicit fallback/);
});

test("Metro presentation remains the final accepted CSS and runtime layer", () => {
  const classicCss = index.indexOf("classic-final-ui-polish.css");
  const phase10Css = index.indexOf("phase10r3a-mobile-shell-date-strip.css");
  const metroTheme = index.indexOf("metro-theme.css");
  const metroSeat = index.indexOf("metro-m4b-seat-scroll-fix.css");
  assert.ok(classicCss >= 0 && phase10Css > classicCss);
  assert.ok(metroTheme > phase10Css && metroSeat > metroTheme);

  const classicRuntime = index.indexOf("classic-final-ui-polish.js");
  const phase10Runtime = index.indexOf("phase10r3a-mobile-shell-date-strip.js");
  const metroRuntime = index.indexOf("metro-runtime.js");
  assert.ok(classicRuntime >= 0 && phase10Runtime > classicRuntime && metroRuntime > phase10Runtime);
  assert.match(metro, /dataset\.skin !== "metro"\) return/);
});

test("Classic Data Health refresh stays disabled in Metro while Classic fallback remains live", () => {
  assert.match(classic, /function wireDataHealthRefresh\(\)[\s\S]*dataset\.skin === "metro"\) return/);
  assert.match(phase10, /function placeComparisonDataHealth\(\)[\s\S]*dataset\.skin === "metro"\) return false/);
});

test("installed PWA keeps fullscreen preference and controlled update activation", () => {
  assert.equal(manifest.display, "fullscreen");
  assert.deepEqual(manifest.display_override.slice(0, 3), ["fullscreen", "standalone", "minimal-ui"]);
  assert.equal(manifest.theme_color, "#000000");
  assert.equal(manifest.background_color, "#000000");

  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(installBlock, /precacheShell\(\)/);
  assert.doesNotMatch(installBlock, /skipWaiting\(/);
  assert.match(sw, /event\.data\?\.type === "SKIP_WAITING"\) self\.skipWaiting\(\)/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
  assert.match(metro, /MOVIEMETRO \/ 場次比較/);
  assert.match(metro, /MOVIEMETRO \/ 座位圖/);
});

test("M6A audit records the known ownership risks instead of changing production behavior", () => {
  for (const heading of [
    "Data Health home placement has two Metro owners",
    "Classic final polish still creates shared controls used by Metro",
    "Comparison movie facts depend on a DOM text-format bridge",
    "CSS cascade is long and order-sensitive",
    "Provider-expansion blockers discovered during M6A"
  ]) {
    assert.match(audit, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(audit, /no cleanup should be justified by file\/phase age alone/i);
});
