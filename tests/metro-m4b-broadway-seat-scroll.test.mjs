import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, css] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m4-seat-view.css")
]);

test("M4B Broadway guard is folded into the single Metro seat-map layer", () => {
  assert.match(index, /metro-m4-seat-view\.css\?v=m6b-4/);
  assert.doesNotMatch(index, /metro-m4b-seat-scroll-fix\.css/);
});

test("M4B reserves an opaque sticky gutter for Broadway row labels only", () => {
  assert.match(css, /data-seatmap-provider="broadway"/);
  assert.match(css, /shared-seatmap-scroll\.is-scrollable/);
  assert.match(css, /shared-seatmap-row-label/);
  assert.match(css, /min-height:\s*calc\(var\(--seat-size,\s*24px\)\s*-\s*2px\)/);
  assert.match(css, /background:\s*#060606/);
  assert.match(css, /box-shadow:\s*8px\s+0\s+0\s+#060606/);
  assert.match(css, /z-index:\s*8/);
  const broadwayGuard = css.match(/html\[data-skin="metro"\][\s\S]*?data-seatmap-provider="broadway"[\s\S]*?shared-seatmap-row-label\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(broadwayGuard);
  assert.doesNotMatch(broadwayGuard, /data-seatmap-provider="mcl"/);
  assert.doesNotMatch(broadwayGuard, /data-seatmap-provider="emperor"/);
});
