import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9D assets extend M9C and load after the established Metro owners", async () => {
  const html = await readApp("index.html");
  const m9cCss = html.indexOf("m9c-navigation-transitions.css");
  const m9dCss = html.indexOf("m9d-micro-interactions.css");
  const m9cRuntime = html.indexOf("m9c-navigation-transitions.js");
  const m9dRuntime = html.indexOf("m9d-micro-interactions.js");

  assert.ok(m9cCss >= 0 && m9dCss > m9cCss, "M9D CSS must extend M9C");
  assert.ok(m9cRuntime >= 0 && m9dRuntime > m9cRuntime, "M9D runtime must observe installed Metro owners");
  assert.match(html, /m9d-micro-interactions\.css\?v=[^"']+/);
  assert.match(html, /m9d-micro-interactions\.js\?v=[^"']+/);
});

test("M9D runtime remains presentation-only", async () => {
  const source = await readApp("m9d-micro-interactions.js");

  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /\bfetch\s*\(/, "micro-interactions must not start network requests");
  assert.doesNotMatch(source, /HKCinemaProviderCompare\s*=/, "comparison owner must remain untouched");
  assert.doesNotMatch(source, /HKCinemaSeatMapShared\s*=/, "seat-map owner must remain untouched");
  assert.doesNotMatch(source, /preventDefault\s*\(/, "micro-interactions must not block controls");
  assert.doesNotMatch(source, /stopPropagation\s*\(/, "micro-interactions must not block controls");
  assert.doesNotMatch(source, /stopImmediatePropagation\s*\(/, "micro-interactions must not block controls");
});

test("M9D gives shallow card press and date/filter/sort acknowledgements", async () => {
  const source = await readApp("m9d-micro-interactions.js");
  const css = await readApp("m9d-micro-interactions.css");

  assert.match(source, /m9d-pressed/);
  assert.match(source, /PRESS_CANCEL_DISTANCE\s*=\s*10/);
  assert.match(source, /data-provider-compare-date/);
  assert.match(source, /data-provider-filter-toggle/);
  assert.match(source, /provider-compare-control-group button/);
  assert.match(source, /home-movie-sort select/);
  assert.match(source, /classic-final-sort select/);
  assert.match(css, /movie-card\.m9d-pressed[\s\S]*?scale\(\.985\)/);
  assert.match(css, /\.m9d-control-ack/);
});

test("M9D seat-map hint is first-use only and cannot confuse automatic centering with user scrolling", async () => {
  const source = await readApp("m9d-micro-interactions.js");
  const css = await readApp("m9d-micro-interactions.css");

  assert.match(source, /hkcinema:m9d-seat-scroll-hint-seen/);
  assert.match(source, /localStorage\?\.getItem/);
  assert.match(source, /localStorage\?\.setItem/);
  assert.match(source, /pointerArmed\s*=\s*true/);
  assert.match(source, /if \(!pointerArmed\) return/);
  assert.match(source, /Math\.abs\(Number\(scroller\.scrollLeft/);
  assert.doesNotMatch(source, /scroller\.scrollLeft\s*=/, "M9D must not own seat-map centering or scroll position");
  assert.match(css, /data-m9d-seat-hint-seen="true"/);
  assert.match(css, /m9d-first-use-hint::before/);
});

test("M9D keeps Smart Pick target emphasis cheap and reduced-motion safe", async () => {
  const css = await readApp("m9d-micro-interactions.css");

  assert.match(css, /provider-compare-show\.is-recommendation-jump::before/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@keyframes m9d-seat-hint-nudge/);
  assert.doesNotMatch(
    css,
    /@keyframes[\s\S]*?\b(?:width|height|top|right|bottom|left|margin|padding|background|border)\s*:/,
    "M9D keyframes must stay on transform/opacity"
  );
  assert.doesNotMatch(css, /\.shared-seat\s*\{[\s\S]*?animation\s*:/, "individual seats must never animate");
});
