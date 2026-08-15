import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9B loads after the M9A motion vocabulary and after Metro runtime", async () => {
  const html = await readApp("index.html");
  const motionCss = html.indexOf("motion-foundation.css");
  const loadingCss = html.indexOf("m9b-loading-states.css");
  const metroRuntime = html.indexOf("metro-runtime.js");
  const loadingRuntime = html.indexOf("m9b-loading-states.js");

  assert.ok(motionCss >= 0, "M9A motion foundation must remain loaded");
  assert.ok(loadingCss > motionCss, "M9B loading CSS must build on M9A motion tokens");
  assert.ok(loadingRuntime > metroRuntime, "M9B runtime must run after the existing Metro owners");
});

test("M9B runtime parses and never owns provider/network requests", async () => {
  const source = await readApp("m9b-loading-states.js");

  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /\bfetch\s*\(/, "loading presentation must not start network requests");
  assert.doesNotMatch(source, /HKCinemaProviderCompare\s*=/, "loading presentation must not replace comparison owner");
  assert.doesNotMatch(source, /HKCinemaSeatMapShared\s*=/, "loading presentation must not replace seat-map owner");
  assert.doesNotMatch(source, /preventDefault\s*\(/, "M9B must not block the original click lifecycle");
  assert.doesNotMatch(source, /stopPropagation\s*\(/, "M9B must not block close/date controls");
});

test("M9B provides home, comparison, seat-map and data-refresh waiting states", async () => {
  const source = await readApp("m9b-loading-states.js");

  assert.match(source, /Array\.from\(\{ length: 6 \}, homeSkeletonCard\)/, "home first load should expose six movie skeletons");
  assert.match(source, /m9b-compare-skeleton/, "comparison loading skeleton is required");
  assert.match(source, /m9b-seatmap-skeleton/, "seat-map loading skeleton is required");
  assert.match(source, /hkcinema:data-health/, "top progress must follow the existing Data Health lifecycle");
  assert.match(source, /refreshButton\?\.classList\.contains\("is-loading"\)/, "refresh indicator must follow the existing busy owner");
});

test("M9B preserves the live comparison DOM during date requests before the next paint", async () => {
  const source = await readApp("m9b-loading-states.js");

  assert.match(source, /window\.addEventListener\("click", captureComparisonDate, true\)/, "date state must be captured before the document-level request handler runs");
  assert.match(source, /comparisonSnapshot = section \? cleanSnapshot\(section\) : null/, "the actual rendered section must be preserved instead of a clone");
  assert.doesNotMatch(source, /cloneNode\(/, "date loading must not clone decorated comparison DOM");
  assert.match(source, /queueMicrotask\(/, "the preserved section must be restored in the same event-loop paint cycle");
  assert.match(source, /loaderSection\.replaceWith\(restored\)/, "date-only loader should be replaced by the preserved live content");
  assert.match(source, /aria-busy/, "preserved content must expose a busy semantic");
});

test("M9B date progress is non-layout and Metro Smart Picks have a raw-panel dark fallback", async () => {
  const css = await readApp("m9b-loading-states.css");
  const smartCss = await readApp("metro-m3-smart-picks.css");

  assert.match(css, /\.m9b-date-loading::before/);
  assert.match(css, /\.m9b-local-loading-bar[\s\S]*?width:\s*1px\s*!important/);
  assert.match(css, /\.m9b-local-loading-bar[\s\S]*?clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(css, /\.m9b-local-loading-bar\s*\{[\s\S]*?min-height:\s*34px/, "date loading must not insert a visible 34px notice row");

  assert.match(
    smartCss,
    /provider-compare-recommendations\.phase8d-smart-picks[\s\S]*?background:\s*#0c0c0c\s*!important/,
    "Metro must paint raw Smart Picks panels dark even before Phase 8B decoration"
  );
  assert.match(
    smartCss,
    /provider-compare-recommendations\.phase8d-smart-picks[\s\S]*?phase8d-smart-pick[\s\S]*?background:\s*var\(--metro-tile\)\s*!important/,
    "transient Smart Pick cards must never fall back to Classic white"
  );
});

test("M9B animation remains cheap and reduced-motion safe", async () => {
  const css = await readApp("m9b-loading-states.css");

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /m9b-progress-travel/);
  assert.match(css, /m9b-local-progress/);

  const keyframes = Array.from(css.matchAll(/@keyframes\s+[^{]+\{([\s\S]*?)\n\}/g), match => match[1]);
  assert.ok(keyframes.length >= 2, "M9B should have only lightweight progress keyframes");
  for (const body of keyframes) {
    assert.doesNotMatch(body, /\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/, "M9B keyframes must avoid layout properties");
  }

  assert.doesNotMatch(css, /\.shared-seat\s*\{[\s\S]*?animation\s*:/, "individual seats must not be animated");
  assert.doesNotMatch(css, /shimmer/i, "long shimmer effects are intentionally excluded");
});
