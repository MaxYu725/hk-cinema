import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9E3 curtain assets load after the established Metro motion layers", async () => {
  const html = await readApp("index.html");
  const m9dCss = html.indexOf("m9d-micro-interactions.css");
  const curtainCss = html.indexOf("m9e3-comparison-curtain.css");
  const m9dJs = html.indexOf("m9d-micro-interactions.js");
  const curtainJs = html.indexOf("m9e3-comparison-curtain.js");

  assert.ok(m9dCss >= 0 && curtainCss > m9dCss);
  assert.ok(m9dJs >= 0 && curtainJs > m9dJs);
  assert.match(html, /m9e3-comparison-curtain\.css\?v=/);
  assert.match(html, /m9e3-comparison-curtain\.js\?v=/);
});

test("M9E3 runtime stays presentation-only and scopes observation to comparison content", async () => {
  const source = await readApp("m9e3-comparison-curtain.js");
  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /HKCinemaProviderCompare\s*=/);
  assert.doesNotMatch(source, /preventDefault|stopPropagation|stopImmediatePropagation/);
  assert.doesNotMatch(source, /observe\(document\.body/);
  assert.match(source, /observer\.observe\(root/);
  assert.match(source, /window\.addEventListener\("click", handleClickCapture, true\)/);
  assert.match(source, /\[data-provider-compare-date\]/);
  assert.match(source, /\[data-provider-compare-retry\]/);
  assert.doesNotMatch(source, /cloneNode\s*\(/);
});

test("M9E3 waits for a decorated final structure and three quiet frames before reveal", async () => {
  const source = await readApp("m9e3-comparison-curtain.js");
  assert.match(source, /QUIET_FRAMES_REQUIRED\s*=\s*3/);
  assert.match(source, /phase8b-timeline-section/);
  assert.match(source, /\[data-provider-insights\]/);
  assert.match(source, /\[data-provider-compare-reset\]/);
  assert.match(source, /provider-compare-section-heading/);
  assert.match(source, /quietFrames\s*>=\s*QUIET_FRAMES_REQUIRED/);
  assert.match(source, /requestAnimationFrame\(checkSettledFrame\)/);
  assert.match(source, /FORCE_RELEASE_MS/);
});

test("M9E3 curtain is an opaque non-layout Metro surface with reduced-motion support", async () => {
  const css = await readApp("m9e3-comparison-curtain.css");
  assert.match(css, /#providerCompareContent\[data-m9e3-curtain\]::after/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /top:\s*var\(--m9e3-curtain-top/);
  assert.match(css, /background:\s*#000/);
  assert.match(css, /border-top:\s*2px solid var\(--metro-accent\)/);
  assert.match(css, /data-m9e3-curtain="releasing"/);
  assert.match(css, /transition:\s*opacity\s*140ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /@keyframes/);
  assert.doesNotMatch(css, /\.provider-compare-(?:date|timeline-section)\s*\{[^}]*display:\s*none/i);
});
