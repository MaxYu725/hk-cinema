import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9C assets load after M9B and the existing Metro runtime", async () => {
  const html = await readApp("index.html");
  const m9bCss = html.indexOf("m9b-loading-states.css");
  const m9cCss = html.indexOf("m9c-navigation-transitions.css");
  const metroRuntime = html.indexOf("metro-runtime.js");
  const m9bRuntime = html.indexOf("m9b-loading-states.js");
  const m9cRuntime = html.indexOf("m9c-navigation-transitions.js");

  assert.ok(m9bCss >= 0 && m9cCss > m9bCss, "M9C CSS must extend M9B");
  assert.ok(metroRuntime >= 0 && m9bRuntime > metroRuntime, "existing M9B load order must remain intact");
  assert.ok(m9cRuntime > m9bRuntime, "M9C runtime must observe the fully installed Metro owners");
  assert.match(html, /m9c-navigation-transitions\.css\?v=[^"']+/);
  assert.match(html, /m9c-navigation-transitions\.js\?v=[^"']+/);
});

test("M9C runtime is presentation-only and does not take lifecycle ownership", async () => {
  const source = await readApp("m9c-navigation-transitions.js");

  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /\bfetch\s*\(/, "transition layer must not start requests");
  assert.doesNotMatch(source, /HKCinemaProviderCompare\s*=/, "transition layer must not replace comparison owner");
  assert.doesNotMatch(source, /HKCinemaSeatMapShared\s*=/, "transition layer must not replace seat-map owner");
  assert.doesNotMatch(source, /preventDefault\s*\(/, "transition layer must not block original controls");
  assert.doesNotMatch(source, /stopPropagation\s*\(/, "transition layer must not block original controls");
  assert.doesNotMatch(source, /stopImmediatePropagation\s*\(/, "transition layer must not block original controls");
});

test("M9C observes close intent before document owners and keeps after-images passive", async () => {
  const source = await readApp("m9c-navigation-transitions.js");
  const css = await readApp("m9c-navigation-transitions.css");

  assert.match(source, /window\.addEventListener\("click", handleClickCapture, true\)/);
  assert.match(source, /window\.addEventListener\("keydown", handleKeyCapture, true\)/);
  assert.match(source, /spawnExitGhost\("comparison"\)/);
  assert.match(source, /spawnExitGhost\("seatmap"\)/);
  assert.match(source, /cloneNode\(true\)/, "small filter/Smart Pick panels may use passive visual snapshots");
  assert.match(css, /\.m9c-exit-ghost[\s\S]*?pointer-events:\s*none\s*!important/);
  assert.match(css, /\.m9c-node-exit-ghost,[\s\S]*?pointer-events:\s*none\s*!important/);
});

test("M9C covers filter, Smart Picks, date selection and source navigation feedback", async () => {
  const source = await readApp("m9c-navigation-transitions.js");
  const css = await readApp("m9c-navigation-transitions.css");

  assert.match(source, /data-provider-filter-toggle/);
  assert.match(source, /data-phase9b3-group-toggle/);
  assert.match(source, /data-phase8b-recommendation-toggle/);
  assert.match(source, /m9c-navigation-origin/);
  assert.match(source, /aria-current", "date"/);
  assert.match(css, /provider-compare-date::after/);
  assert.match(css, /phase8b-section-toggle\[aria-expanded="true"\]/);
  assert.match(css, /provider-compare-show\.is-recommendation-jump/);
});

test("M9C keyframes stay compositor-friendly and reduced-motion safe", async () => {
  const css = await readApp("m9c-navigation-transitions.css");

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /m9c-sheet-exit/);
  assert.match(css, /m9c-node-exit/);
  assert.doesNotMatch(
    css,
    /@keyframes[\s\S]*?\b(?:width|height|top|right|bottom|left|margin|padding|background|border)\s*:/,
    "M9C keyframes must animate only transform/opacity-class compositor properties"
  );
  assert.doesNotMatch(css, /\.shared-seat\s*\{[\s\S]*?animation\s*:/, "individual seats must never animate");
});
