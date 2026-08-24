import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function readApp(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("M9A loads the motion foundation after Metro presentation styles", async () => {
  const html = await readApp("index.html");
  const metroSeat = html.indexOf("metro-m4-seat-view.css");
  const motion = html.indexOf("motion-foundation.css");

  assert.ok(metroSeat >= 0, "Metro seat presentation stylesheet must remain loaded");
  assert.ok(motion > metroSeat, "motion foundation must load after Metro presentation owners");
});

test("M9A exposes one bounded timing and easing vocabulary", async () => {
  const css = await readApp("motion-foundation.css");

  for (const token of [
    "--motion-duration-press: 120ms",
    "--motion-duration-fast: 160ms",
    "--motion-duration-base: 200ms",
    "--motion-duration-slow: 240ms",
    "--motion-ease-standard",
    "--motion-ease-enter",
    "--motion-ease-exit"
  ]) {
    assert.ok(css.includes(token), `missing motion contract: ${token}`);
  }

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /--motion-distance-small:\s*0px/);
  assert.match(css, /--motion-distance-medium:\s*0px/);
});

test("M9A motion keyframes stay compositor-friendly", async () => {
  const css = await readApp("motion-foundation.css");
  const keyframes = Array.from(css.matchAll(/@keyframes\s+[^{]+\{([\s\S]*?)\n\}/g), match => match[1]);

  assert.ok(keyframes.length >= 4, "expected shared fade/slide/sheet/flyout motion primitives");
  for (const body of keyframes) {
    assert.doesNotMatch(body, /\b(?:width|height|top|right|bottom|left|margin|padding)\s*:/, "keyframes must not animate layout properties");
  }
});

test("M9A keeps overlay lifecycle and seat geometry out of the motion layer", async () => {
  const css = await readApp("motion-foundation.css");

  assert.match(css, /provider-compare-overlay:not\(\[hidden\]\)\s+\.provider-compare-sheet/);
  assert.match(css, /shared-seatmap-overlay:not\(\[hidden\]\)\s+\.shared-seatmap-sheet/);
  assert.doesNotMatch(css, /\.shared-seat(?:\s|\{|\.|\[)[\s\S]{0,120}animation\s*:/, "individual seats must not be animated");
  assert.doesNotMatch(css, /display\s*:\s*none/, "motion foundation must not own open/close lifecycle");
});
