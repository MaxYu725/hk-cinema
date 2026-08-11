import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 10A3 loads after the Metro home foundation", async () => {
  const index = await read("app/index.html");

  assert.match(index, /metro-home-polish\.css\?v=10a2-1[\s\S]*metro-home-real-device\.css\?v=10a3-1/);
});

test("Phase 10A3 keeps the health flyout compact and preserves complete posters", async () => {
  const css = await read("app/metro-home-real-device.css");

  assert.match(css, /\.data-health-body[\s\S]*width:\s*min\(280px, calc\(100vw - 24px\)\)/);
  assert.match(css, /\.data-health-source-detail[\s\S]*display:\s*none/);
  assert.match(css, /\.movie-poster img[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.home-library-tools\.is-stuck-latched[\s\S]*\.home-movie-search,[\s\S]*\.metro-sort-command[\s\S]*min-height:\s*34px/);
  assert.match(css, /\.home-library-tools\.is-stuck-latched \.metro-sort-command span[\s\S]*display:\s*none/);
});
