import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, css] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m3-filter-matrix.css")
]);

test("Metro loads the final filter matrix after the base M3 comparison skin", () => {
  const base = index.indexOf("metro-m3-comparison.css?v=m3-1");
  const matrix = index.indexOf("metro-m3-filter-matrix.css?v=m3-filter-1");
  assert.ok(base >= 0 && matrix > base);
});

test("Metro comparison restores the final 3x3 compact filter controls", () => {
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  for (const key of ["provider", "language", "subtitle", "format", "region", "district", "cinema", "period", "seats"]) {
    assert.match(css, new RegExp(`data-phase9b3-group=\\"${key}\\"`));
  }
  assert.match(css, /data-phase9b3-group=\"price\"[\s\S]*data-phase9b3-group=\"sort\"[\s\S]*display:\s*none\s*!important/);
});

test("Metro expanded filters keep one full-width active group and a full-width reset action", () => {
  assert.match(css, /data-phase9b3-group\]\.phase9b3-open[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /\.provider-compare-reset[\s\S]*display:\s*block\s*!important[\s\S]*width:\s*100%/);
  assert.match(css, /provider-compare-filter-bar[\s\S]*display:\s*contents\s*!important/);
  assert.match(css, /provider-compare-insight-note[\s\S]*display:\s*none\s*!important/);
});
