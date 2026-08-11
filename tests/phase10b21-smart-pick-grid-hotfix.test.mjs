import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/metro-smart-pick-grid-hotfix.css", import.meta.url), "utf8");

test("Metro Smart Pick hotfix loads after the 10B2 comparison polish", () => {
  const polish = html.indexOf("metro-comparison-polish.css?v=10b2-1");
  const hotfix = html.indexOf("metro-smart-pick-grid-hotfix.css?v=10b2-2");
  assert.ok(polish >= 0, "10B2 comparison polish stylesheet must remain loaded");
  assert.ok(hotfix > polish, "Smart Pick hotfix must load after the 10B2 stylesheet");
});

test("Metro Smart Pick hotfix resets legacy mobile horizontal auto-flow", () => {
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /grid-auto-flow:\s*row/);
  assert.match(css, /grid-auto-columns:\s*auto/);
  assert.match(css, /grid-auto-rows:\s*auto/);
  assert.match(css, /overflow-x:\s*visible/);
  assert.match(css, /width:\s*100%/);
  assert.match(css, /grid-column:\s*auto/);
});
