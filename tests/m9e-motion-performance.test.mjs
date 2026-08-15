import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9E keeps M9 presentation runtimes parseable and lifecycle-passive", async () => {
  const files = [
    "m9b-loading-states.js",
    "m9c-navigation-transitions.js",
    "m9d-micro-interactions.js"
  ];

  for (const file of files) {
    const source = await readApp(file);
    assert.doesNotThrow(() => new Function(source), `${file} must parse`);
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${file} must not create network requests`);
    assert.doesNotMatch(source, /HKCinemaProviderCompare\s*=/, `${file} must not replace comparison ownership`);
    assert.doesNotMatch(source, /HKCinemaSeatMapShared\s*=/, `${file} must not replace seat-map ownership`);
    assert.doesNotMatch(source, /preventDefault\s*\(/, `${file} must not block existing controls`);
    assert.doesNotMatch(source, /stopImmediatePropagation\s*\(/, `${file} must not block existing controls`);
  }
});

test("M9E scopes loading observers away from unrelated class micro-interactions", async () => {
  const source = await readApp("m9b-loading-states.js");

  assert.match(source, /observeTarget\("#movieGrid", \["data-broadway-state"\]\)/);
  assert.match(source, /observeTarget\("#refreshButton", \["class"\]\)/);
  assert.match(source, /observeTarget\("#providerCompareOverlay", \["hidden"\]\)/);
  assert.match(source, /contentObserver\.observe\(document\.body, \{\s*childList: true,\s*subtree: true\s*\}\)/s);
  assert.doesNotMatch(
    source,
    /contentObserver\.observe\(document\.body,[\s\S]*?attributes:\s*true/,
    "body-wide M9B observation must not receive every class/attribute mutation"
  );
});

test("M9E scopes transition observers and clears stale exit surfaces on reopen", async () => {
  const source = await readApp("m9c-navigation-transitions.js");

  assert.match(source, /function clearExitGhosts\(\)/);
  assert.match(source, /m9c-exit-ghost, \.m9c-node-exit-ghost/);
  assert.match(source, /if \(!previous && current\) clearExitGhosts\(\)/);
  assert.match(source, /hkcinema:provider-compare-open[\s\S]*?clearExitGhosts\(\)/);
  assert.match(source, /hkcinema:seatmap-opening[\s\S]*?clearExitGhosts\(\)/);
  assert.match(source, /overlayObserver\.observe\(overlay, \{ attributes: true, attributeFilter: \["hidden"\] \}\)/);
  assert.match(source, /contentObserver\.observe\(document\.body, \{\s*childList: true,\s*subtree: true\s*\}\)/s);
  assert.doesNotMatch(
    source,
    /contentObserver\.observe\(document\.body,[\s\S]*?attributes:\s*true/,
    "body-wide M9C observation must stay child-list only"
  );
});

test("M9E motion CSS remains reduced-motion safe and excludes per-seat animation", async () => {
  const files = [
    "motion-foundation.css",
    "m9b-loading-states.css",
    "m9c-navigation-transitions.css",
    "m9d-micro-interactions.css"
  ];

  for (const file of files) {
    const css = await readApp(file);
    assert.match(css, /prefers-reduced-motion:\s*reduce/, `${file} must support reduced motion`);
    assert.doesNotMatch(css, /\.shared-seat\s*\{[\s\S]*?animation\s*:/, `${file} must not animate individual seats`);
  }
});

test("M9E animated keyframes stay on transform and opacity properties", async () => {
  const files = [
    "motion-foundation.css",
    "m9b-loading-states.css",
    "m9c-navigation-transitions.css",
    "m9d-micro-interactions.css"
  ];

  for (const file of files) {
    const css = await readApp(file);
    const keyframes = Array.from(css.matchAll(/@keyframes\s+[^{]+\{([\s\S]*?)\n\}/g), match => match[1]);
    for (const body of keyframes) {
      assert.doesNotMatch(
        body,
        /\b(?:width|height|top|right|bottom|left|margin|padding|background|border|box-shadow|filter)\s*:/,
        `${file} keyframes must avoid layout/paint-heavy properties`
      );
    }
  }
});
