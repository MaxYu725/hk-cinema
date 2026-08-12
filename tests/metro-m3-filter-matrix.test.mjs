import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, css, compact] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m3-filter-matrix.css"),
  read("app/phase9b3-filter-compact.js")
]);

test("Metro loads the final filter matrix after the base M3 comparison skin", () => {
  const base = index.indexOf("metro-m3-comparison.css?v=m3-1");
  const matrix = index.indexOf("metro-m3-filter-matrix.css?v=m3-filter-3");
  assert.ok(base >= 0 && matrix > base);
  assert.match(index, /phase9b3-filter-compact\.js\?v=9b3-m5a-1/);
});

test("Metro comparison keeps the final 3x3 compact filter controls", () => {
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  for (const key of ["provider", "language", "subtitle", "format", "region", "district", "cinema", "period", "seats"]) {
    assert.match(css, new RegExp(`data-phase9b3-group=\\"${key}\\"`));
  }
  assert.match(css, /data-phase9b3-group=\"price\"[\s\S]*data-phase9b3-group=\"sort\"[\s\S]*display:\s*none\s*!important/);
});

test("Metro filter options float from their original tile without reflowing the matrix", () => {
  assert.match(css, /phase8c-controls\[data-phase9b3-compact=\"true\"\][\s\S]*position:\s*relative[\s\S]*overflow:\s*visible/);
  assert.match(css, /data-phase9b3-group\]\.phase9b3-open[\s\S]*grid-column:\s*auto[\s\S]*z-index:\s*30/);
  assert.doesNotMatch(css, /data-phase9b3-group\]\.phase9b3-open\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /phase9b3-open > \.phase9b3-filter-group-body:not\(\[hidden\]\)[\s\S]*position:\s*absolute[\s\S]*top:\s*calc\(100% \+ 6px\)[\s\S]*max-height:/);
  assert.match(css, /phase9b3-open > \.phase9b3-filter-group-summary[\s\S]*min-height:\s*72px\s*!important/);
  assert.match(css, /\.provider-compare-reset[\s\S]*display:\s*block\s*!important[\s\S]*width:\s*100%/);
});

test("Metro dropdown alignment keeps left, middle and right matrix columns inside the viewport", () => {
  assert.match(css, /data-phase9b3-group=\"provider\"[\s\S]*data-phase9b3-group=\"format\"[\s\S]*left:\s*0/);
  assert.match(css, /data-phase9b3-group=\"language\"[\s\S]*data-phase9b3-group=\"region\"[\s\S]*left:\s*50%[\s\S]*translateX\(-50%\)/);
  assert.match(css, /data-phase9b3-group=\"subtitle\"[\s\S]*data-phase9b3-group=\"district\"[\s\S]*right:\s*0/);
  assert.match(css, /width:\s*min\(280px,\s*calc\(100vw - 40px\)\)/);
});

test("Metro option selection and outside taps collapse the dropdown after the shared filter engine runs", () => {
  assert.match(compact, /function isMetro\(\)[\s\S]*dataset\.skin === "metro"/);
  assert.match(compact, /function queueMetroClose\(\)[\s\S]*queueMicrotask/);
  assert.match(compact, /phase9b3-filter-group-body button/);
  assert.match(compact, /document\.addEventListener\("change", handleChange, true\)/);
  assert.match(compact, /provider-compare-cinema-portal-option/);
  assert.match(compact, /if \(!group\) \{[\s\S]*closeActiveGroup\(\)/);
});

test("Metro cinema filter keeps the portalled list inside viewport gutters", () => {
  assert.match(css, /data-phase9b3-group=\"cinema\"\][\s\S]*display:\s*block\s*!important/);
  assert.match(css, /data-phase9b3-group=\"cinema\"[\s\S]*phase9b3-filter-group-body:not\(\[hidden\]\)[\s\S]*display:\s*block\s*!important/);
  assert.match(css, /data-phase9b3-group=\"cinema\"[\s\S]*phase9b3-filter-group-body\s*>\s*span[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /select\[data-insight-cinema\][\s\S]*width:\s*100%\s*!important[\s\S]*box-sizing:\s*border-box/);
  assert.match(css, /\.provider-compare-cinema-portal[\s\S]*left:\s*max\(12px,\s*env\(safe-area-inset-left\)\)\s*!important/);
  assert.match(css, /\.provider-compare-cinema-portal[\s\S]*right:\s*max\(12px,\s*env\(safe-area-inset-right\)\)\s*!important/);
  assert.match(css, /\.provider-compare-cinema-portal[\s\S]*width:\s*auto\s*!important/);
});
