import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("final Classic homepage removes redundant branding and exposes tab counts", async () => {
  const [index, css, js] = await Promise.all([
    read("app/index.html"),
    read("app/classic-final-ui-polish.css"),
    read("app/classic-final-ui-polish.js")
  ]);

  assert.match(index, /classic-final-ui-polish\.css\?v=classic-final-1/);
  assert.match(index, /classic-final-ui-polish\.js\?v=classic-final-m2-1/);
  assert.match(css, /\.topbar-brand\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /#refreshButton\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.section-heading\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(js, /dataset\.classicFinalTabCount\s*=\s*tab/);
  assert.match(js, /document\.documentElement\.dataset\.skin === "metro"/);
  assert.match(js, /document\.querySelector\("#refreshButton"\)\?\.click\(\)/);
});

test("final Classic comparison uses a 3 by 3 compact filter matrix and heading sort", async () => {
  const [css, js] = await Promise.all([
    read("app/classic-final-ui-polish.css"),
    read("app/classic-final-ui-polish.js")
  ]);

  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  for (const key of ["provider", "language", "subtitle", "format", "region", "district", "cinema", "period", "seats"]) {
    assert.match(css, new RegExp(`data-phase9b3-group=\\"${key}\\"`));
  }
  assert.match(css, /data-phase9b3-group="price"[\s\S]*data-phase9b3-group="sort"[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.phase8c-active-filters[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.phase8b-movie-details[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /data-mcl-seat-lazy-note[\s\S]*display:\s*none\s*!important/);
  assert.match(js, /data-classic-final-sort-select/);
  assert.match(js, /setFilter\?\.\("sort"/);
});

test("installed PWA uses fullscreen while retaining standalone fallback", async () => {
  const manifest = JSON.parse(await read("app/manifest.json"));
  assert.equal(manifest.display, "fullscreen");
  assert.deepEqual(manifest.display_override.slice(0, 2), ["fullscreen", "standalone"]);
});
