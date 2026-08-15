import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9F2 assets extend M9F1 after all existing surface owners", async () => {
  const html = await readApp("index.html");
  const f1Css = html.indexOf("m9f1-home-content-continuity.css");
  const f2Css = html.indexOf("m9f2-loaded-surface-transitions.css");
  const f1Runtime = html.indexOf("m9f1-home-content-continuity.js");
  const f2Runtime = html.indexOf("m9f2-loaded-surface-transitions.js");

  assert.ok(f1Css >= 0 && f2Css > f1Css, "M9F2 CSS must load after M9F1");
  assert.ok(f1Runtime >= 0 && f2Runtime > f1Runtime, "M9F2 runtime must load after all existing owners and M9F1");
  assert.match(html, /m9f2-loaded-surface-transitions\.css\?v=[^"']+/);
  assert.match(html, /m9f2-loaded-surface-transitions\.js\?v=[^"']+/);
});

test("M9F2 remains a passive Metro presentation companion", async () => {
  const source = await readApp("m9f2-loaded-surface-transitions.js");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /dataset\.skin !== "metro"/);
  assert.doesNotMatch(source, /\bfetch\s*\(/, "M9F2 must not start network requests");
  assert.doesNotMatch(source, /preventDefault\s*\(/, "M9F2 must not block existing owners");
  assert.doesNotMatch(source, /stopPropagation\s*\(/, "M9F2 must not block existing owners");
  assert.doesNotMatch(source, /stopImmediatePropagation\s*\(/, "M9F2 must not block existing owners");
  assert.doesNotMatch(source, /scrollLeft\s*=/, "M9F2 must not take seat-map scroll ownership");
  assert.doesNotMatch(source, /innerHTML\s*=/, "M9F2 must not render live surface content");
  assert.match(source, /bodyObserver\.observe\(document\.body, \{ childList: true \}\)/, "body discovery must stay direct-child only");
});

test("M9F2 reveals the real seat map after the M9B skeleton is replaced", async () => {
  const source = await readApp("m9f2-loaded-surface-transitions.js");

  assert.match(source, /shared-seatmap-content/);
  assert.match(source, /dataset\.m9f2Loaded = "true"/);
  assert.match(source, /opacity:\s*\.76/);
  assert.match(source, /translateY\(6px\)/);
  assert.match(source, /seatmapReveals/);
});

test("M9F2 handles PWA notice entry and passive non-interactive exit after-images", async () => {
  const source = await readApp("m9f2-loaded-surface-transitions.js");
  const css = await readApp("m9f2-loaded-surface-transitions.css");

  assert.match(source, /#pwaNotice/);
  assert.match(source, /attributeFilter:\s*\["hidden"\]/);
  assert.match(source, /prepareGhost\(notice, "pwa"\)/);
  assert.match(source, /`m9f2-\$\{kind\}-exit-ghost`/);
  assert.match(source, /ghost\.hidden = false/);
  assert.match(css, /m9f2-pwa-exit-ghost/);
  assert.match(css, /m9f2-exit-ghost[\s\S]*?pointer-events:\s*none/);
});

test("M9F2 gives the cinema portal entry/exit continuity and clears stale ghosts on reopen", async () => {
  const source = await readApp("m9f2-loaded-surface-transitions.js");
  const css = await readApp("m9f2-loaded-surface-transitions.css");

  assert.match(source, /providerCompareCinemaPortal/);
  assert.match(source, /dataset\.m9f2Entered = "true"/);
  assert.match(source, /translateY\(4px\) scale\(\.985\)/);
  assert.match(source, /clearGhosts\("portal"\)/);
  assert.match(source, /addedPortals\.length/);
  assert.match(source, /prepareGhost\(portal, "portal"\)/);
  assert.match(source, /`m9f2-\$\{kind\}-exit-ghost`/);
  assert.match(css, /m9f2-portal-exit-ghost/);
});

test("M9F2 motion is short, compositor-only and reduced-motion safe", async () => {
  const source = await readApp("m9f2-loaded-surface-transitions.js");
  const css = await readApp("m9f2-loaded-surface-transitions.css");

  assert.match(source, /ENTRY_MS\s*=\s*180/);
  assert.match(source, /EXIT_MS\s*=\s*160/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(source, /\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/, "WAAPI frames must stay compositor-friendly");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
