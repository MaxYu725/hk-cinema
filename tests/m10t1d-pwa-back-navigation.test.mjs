import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M10T1D owns only same-document History API state", async () => {
  const source = await readApp("pwa-back-navigation.js");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /history\.replaceState/);
  assert.match(source, /history\.pushState/);
  assert.match(source, /history\.go\(-steps\)/);
  assert.match(source, /addEventListener\("popstate"/);
  assert.doesNotMatch(source, /location\.(?:assign|replace)|window\.open|requestFullscreen/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /preventDefault\s*\(|stopPropagation\s*\(|stopImmediatePropagation\s*\(/);
});

test("M10T1D tracks only the three full-screen app navigation layers", async () => {
  const source = await readApp("pwa-back-navigation.js");

  assert.match(source, /providerCompareOverlay:\s*"compare"/);
  assert.match(source, /movieDetailOverlay:\s*"detail"/);
  assert.match(source, /sharedSeatMapOverlay:\s*"seatmap"/);
  assert.match(source, /HKCinemaSeatMapShared\?\.close/);
  assert.match(source, /HKCinemaMovieDetail\?\.close/);
  assert.match(source, /HKCinemaProviderCompare\?\.close/);
  assert.doesNotMatch(source, /#dataHealth|data-provider-insights|data-provider-filter|provider-compare-recommendations|scrollLeft\s*=/);
});

test("M10T1D keeps body observation direct-child only and overlay observation hidden-only", async () => {
  const source = await readApp("pwa-back-navigation.js");

  assert.match(source, /bodyObserver\.observe\(document\.body, \{ childList: true \}\)/);
  assert.doesNotMatch(source, /bodyObserver\.observe\([^\n]*subtree:\s*true/);
  assert.match(source, /observer\.observe\(overlay, \{ attributes: true, attributeFilter: \["hidden"\] \}\)/);
});

test("M10T1D preserves external official-link behavior by never rewriting URLs", async () => {
  const source = await readApp("pwa-back-navigation.js");

  assert.match(source, /history\.pushState\(withNavigationState\(history\.state, next\), "", window\.location\.href\)/);
  assert.match(source, /history\.replaceState\(withNavigationState\(history\.state, stack\), "", window\.location\.href\)/);
  assert.doesNotMatch(source, /target=_blank|noopener|noreferrer/);
});

test("M10T1D asset loads after existing overlay/navigation owners", async () => {
  const html = await readApp("index.html");
  const compare = html.indexOf("provider-compare-v4.js");
  const detail = html.indexOf("movie-detail-shared.js");
  const seatmap = html.indexOf("seatmap-shared.js");
  const backNav = html.indexOf("pwa-back-navigation.js");

  assert.ok(compare >= 0 && detail >= 0 && seatmap >= 0 && backNav > compare && backNav > detail && backNav > seatmap);
  assert.match(html, /pwa-back-navigation\.js\?v=[^"']+/);
});
