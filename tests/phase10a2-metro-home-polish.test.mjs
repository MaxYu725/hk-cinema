import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 10A2 wires Metro home polish after the Phase 10A foundation", async () => {
  const index = await read("app/index.html");

  assert.match(index, /metro-skin\.css\?v=10a1/);
  assert.match(index, /metro-home-polish\.css\?v=10a2-1/);
  assert.match(index, /home-library\.js\?v=8e3[\s\S]*metro-home-polish\.js\?v=10a2-1/);
});

test("Metro home polish uses Live Tiles and typography-first commands", async () => {
  const [css, runtime] = await Promise.all([
    read("app/metro-home-polish.css"),
    read("app/metro-home-polish.js")
  ]);

  assert.match(css, /html\[data-skin="metro"\] \.movie-card[\s\S]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /html\[data-skin="metro"\] \.movie-info[\s\S]*position:\s*absolute/);
  assert.match(css, /\.movie-title-en,[\s\S]*\.movie-meta[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /html\[data-skin="metro"\] \.home-movie-sort[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /html\[data-skin="metro"\] \.metro-sort-command[\s\S]*border-bottom:\s*3px solid var\(--color-accent\)/);
  assert.match(css, /home-library-filter-options button[\s\S]*border:\s*0/);

  assert.match(runtime, /SORTS\s*=\s*\["default", "release", "title"\]/);
  assert.match(runtime, /select\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(runtime, /data-metro-sort-command/);
});