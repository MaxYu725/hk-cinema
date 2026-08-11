import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, css] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m4b-seat-scroll-fix.css")
]);

test("M4B loads the Broadway horizontal-scroll guard after the base Metro seat-map layer", () => {
  const base = index.indexOf("metro-m4-seat-view.css?v=m4-seatmap-1");
  const fix = index.indexOf("metro-m4b-seat-scroll-fix.css?v=m4b-scroll-1");
  assert.ok(base >= 0 && fix > base);
});

test("M4B reserves an opaque sticky gutter for Broadway row labels only", () => {
  assert.match(css, /data-seatmap-provider="broadway"/);
  assert.match(css, /shared-seatmap-scroll\.is-scrollable/);
  assert.match(css, /shared-seatmap-row-label/);
  assert.match(css, /min-height:\s*calc\(var\(--seat-size,\s*24px\)\s*-\s*2px\)/);
  assert.match(css, /background:\s*#060606/);
  assert.match(css, /box-shadow:\s*8px\s+0\s+0\s+#060606/);
  assert.match(css, /z-index:\s*8/);
  assert.doesNotMatch(css, /data-seatmap-provider="mcl"/);
  assert.doesNotMatch(css, /data-seatmap-provider="emperor"/);
});
