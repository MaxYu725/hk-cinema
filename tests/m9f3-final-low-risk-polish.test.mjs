import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9F3 assets extend M9F2 as the final low-risk Metro polish layer", async () => {
  const html = await readApp("index.html");
  const f2Css = html.indexOf("m9f2-loaded-surface-transitions.css");
  const f3Css = html.indexOf("m9f3-final-low-risk-polish.css");
  const f2Runtime = html.indexOf("m9f2-loaded-surface-transitions.js");
  const f3Runtime = html.indexOf("m9f3-final-low-risk-polish.js");

  assert.ok(f2Css >= 0 && f3Css > f2Css, "M9F3 CSS must load after M9F2");
  assert.ok(f2Runtime >= 0 && f3Runtime > f2Runtime, "M9F3 runtime must load after established owners and M9F2");
  assert.match(html, /m9f3-final-low-risk-polish\.css\?v=[^"']+/);
  assert.match(html, /m9f3-final-low-risk-polish\.js\?v=[^"']+/);
});

test("M9F3 stays presentation-only and leaves PWA/service-worker ownership untouched", async () => {
  const source = await readApp("m9f3-final-low-risk-polish.js");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /dataset\.skin !== "metro"/);
  assert.doesNotMatch(source, /\bfetch\s*\(/, "M9F3 must not start network requests");
  assert.doesNotMatch(source, /navigator\.serviceWorker|\bcaches\b|requestFullscreen|registration\.update/, "M9F3 must not touch PWA lifecycle ownership");
  assert.doesNotMatch(source, /preventDefault\s*\(|stopPropagation\s*\(|stopImmediatePropagation\s*\(/, "M9F3 must not block existing owners");
  assert.doesNotMatch(source, /innerHTML\s*=/, "M9F3 must not render live product content");
  assert.doesNotMatch(source, /scrollLeft\s*=/, "M9F3 must not take scroll ownership");
});

test("M9F3 Data Health close is a short passive after-image after user close intent", async () => {
  const source = await readApp("m9f3-final-low-risk-polish.js");
  const css = await readApp("m9f3-final-low-risk-polish.css");

  assert.match(source, /HEALTH_EXIT_MS\s*=\s*140/);
  assert.match(source, /#dataHealth > summary/);
  assert.match(source, /panel\.open && !panel\.contains\(event\.target\)/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /body\.cloneNode\(true\)/, "only the compact Data Health body is cloned for exit presentation");
  assert.match(source, /setAttribute\("inert", ""\)/);
  assert.match(source, /pointerEvents:\s*"none"/);
  assert.match(source, /translateY\(-3px\) scale\(\.99\)/);
  assert.match(css, /m9f3-data-health-exit-ghost[\s\S]*?pointer-events:\s*none/);
});

test("M9F3 poster loading only fades opacity from .7 to 1 over 160ms", async () => {
  const source = await readApp("m9f3-final-low-risk-polish.js");
  const css = await readApp("m9f3-final-low-risk-polish.css");

  assert.match(source, /POSTER_REVEAL_MS\s*=\s*160/);
  assert.match(source, /\.movie-poster img/);
  assert.match(source, /image\.complete && image\.naturalWidth > 0/);
  assert.match(source, /addEventListener\("load"/);
  assert.match(source, /gridObserver\.observe\(grid, \{ childList: true \}\)/, "poster discovery must stay scoped to direct movie-grid changes");
  assert.match(css, /m9f3-poster-media\s*\{[\s\S]*?opacity:\s*\.7/);
  assert.match(css, /opacity 160ms cubic-bezier\(0, 0, \.2, 1\)/);
  assert.match(css, /m9f3-poster-loaded\s*\{[\s\S]*?opacity:\s*1/);
  assert.doesNotMatch(css, /blur\s*\(|translate|scale\s*\(/, "poster reveal must not blur, move or zoom posters");
});

test("M9F3 reduced-motion path suppresses both poster transition and Data Health ghost", async () => {
  const source = await readApp("m9f3-final-low-risk-polish.js");
  const css = await readApp("m9f3-final-low-risk-polish.css");

  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /if \(reducedMotion\(\)\) return false/);
  assert.match(source, /if \(reducedMotion\(\) \|\| \(image\.complete/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?m9f3-poster-media[\s\S]*?transition:\s*none !important/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?m9f3-data-health-exit-ghost[\s\S]*?display:\s*none !important/);
});
