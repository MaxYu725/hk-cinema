import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9F1 assets extend the completed M9 stack", async () => {
  const html = await readApp("index.html");
  const m9eCss = html.indexOf("m9e3-comparison-curtain.css");
  const m9fCss = html.indexOf("m9f1-home-content-continuity.css");
  const m9eRuntime = html.indexOf("m9e3-comparison-curtain.js");
  const m9fRuntime = html.indexOf("m9f1-home-content-continuity.js");

  assert.ok(m9eCss >= 0 && m9fCss > m9eCss, "M9F1 CSS must extend the current Metro motion stack");
  assert.ok(m9eRuntime >= 0 && m9fRuntime > m9eRuntime, "M9F1 runtime must load after established owners and M9E3");
});

test("M9F1 remains a passive home presentation companion", async () => {
  const source = await readApp("m9f1-home-content-continuity.js");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /document\.documentElement\.dataset\.skin !== "metro"/);
  assert.doesNotMatch(source, /\bfetch\s*\(/, "M9F1 must not start network requests");
  assert.doesNotMatch(source, /preventDefault\s*\(/, "M9F1 must not block existing control owners");
  assert.doesNotMatch(source, /stopPropagation\s*\(/, "M9F1 must not block existing control owners");
  assert.doesNotMatch(source, /stopImmediatePropagation\s*\(/, "M9F1 must not block existing control owners");
  assert.doesNotMatch(source, /cloneNode\s*\(/, "M9F1 must not clone the movie grid");
  assert.doesNotMatch(source, /innerHTML\s*=/, "M9F1 must not render home content");
  assert.doesNotMatch(source, /getBoundingClientRect|offsetWidth|offsetHeight/, "M9F1 must not force layout reads");
});

test("M9F1 gives directional Pivot continuity and lightweight library refinement", async () => {
  const source = await readApp("m9f1-home-content-continuity.js");

  assert.match(source, /DURATION_MS\s*=\s*180/);
  assert.match(source, /translateX\(8px\)/);
  assert.match(source, /translateX\(-8px\)/);
  assert.match(source, /translateY\(4px\)/);
  assert.match(source, /currentTab === "now" && nextTab === "coming"/);
  assert.match(source, /currentTab === "coming" && nextTab === "now"/);
  assert.match(source, /data-home-library-view/);
  assert.match(source, /data-home-movie-sort/);
  assert.match(source, /data-movie-favorite/);
});

test("M9F1 does not animate every search keystroke", async () => {
  const source = await readApp("m9f1-home-content-continuity.js");

  assert.match(source, /data-home-movie-search/);
  assert.match(source, /const beforeEmpty = emptyVisible\(\)/);
  assert.match(source, /const afterEmpty = emptyVisible\(\)/);
  assert.match(source, /if \(beforeEmpty !== afterEmpty\) animateResult\("refine"\)/);
});

test("M9F1 motion stays compositor-friendly and reduced-motion safe", async () => {
  const source = await readApp("m9f1-home-content-continuity.js");
  const css = await readApp("m9f1-home-content-continuity.css");

  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /surface\.animate\(framesFor\(kind\)/);
  assert.doesNotMatch(source, /\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/, "WAAPI frames must not animate layout properties");
  assert.match(css, /home-movie-search[\s\S]*?border-color var\(--motion-fast\)/);
  assert.match(css, /home-movie-sort[\s\S]*?background-color var\(--motion-fast\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
