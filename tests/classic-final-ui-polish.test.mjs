import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("final Classic homepage removes redundant branding while shared runtime exposes tab counts", async () => {
  const [index, css, classic, shared] = await Promise.all([
    read("app/index.html"),
    read("app/classic-final-ui-polish.css"),
    read("app/classic-final-ui-polish.js"),
    read("app/shared-final-controls.js")
  ]);

  assert.match(index, /classic-final-ui-polish\.css\?v=classic-final-1/);
  assert.match(index, /shared-final-controls\.js\?v=m6b-1/);
  assert.match(index, /classic-final-ui-polish\.js\?v=classic-final-m6b-1/);
  assert.match(css, /\.topbar-brand\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /#refreshButton\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.section-heading\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(shared, /dataset\.classicFinalTabCount\s*=\s*tab/);
  assert.match(shared, /dataset\.sharedFinalTabCount\s*=\s*tab/);
  assert.match(classic, /document\.documentElement\.dataset\.skin === "metro"/);
  assert.match(classic, /document\.querySelector\("#refreshButton"\)\?\.click\(\)/);
  assert.doesNotMatch(classic, /syncTabCounts|ensureSortControl/);
});

test("final Classic comparison keeps its 3 by 3 matrix while shared runtime owns heading sort", async () => {
  const [css, classic, shared] = await Promise.all([
    read("app/classic-final-ui-polish.css"),
    read("app/classic-final-ui-polish.js"),
    read("app/shared-final-controls.js")
  ]);

  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  for (const key of ["provider", "language", "subtitle", "format", "region", "district", "cinema", "period", "seats"]) {
    assert.match(css, new RegExp(`data-phase9b3-group=\\"${key}\\"`));
  }
  assert.match(css, /data-phase9b3-group="price"[\s\S]*data-phase9b3-group="sort"[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.phase8c-active-filters[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.phase8b-movie-details[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /data-mcl-seat-lazy-note[\s\S]*display:\s*none\s*!important/);
  assert.match(shared, /data-classic-final-sort-select/);
  assert.match(shared, /data-shared-final-sort-select/);
  assert.match(shared, /setFilter\?\.\("sort"/);
  assert.doesNotMatch(classic, /data-classic-final-sort-select|setFilter\?\.\("sort"/);
});

test("installed PWA uses fullscreen while retaining standalone fallback", async () => {
  const manifest = JSON.parse(await read("app/manifest.json"));
  assert.equal(manifest.display, "fullscreen");
  assert.deepEqual(manifest.display_override.slice(0, 2), ["fullscreen", "standalone"]);
});
