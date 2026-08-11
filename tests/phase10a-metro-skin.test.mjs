import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 10A keeps Classic as default and wires an explicit Metro preview", async () => {
  const [index, runtime] = await Promise.all([
    read("app/index.html"),
    read("app/skin-runtime.js")
  ]);

  assert.match(index, /<html[^>]+data-skin="classic"/);
  assert.match(index, /skin-runtime\.js\?v=10a1/);
  assert.match(index, /metro-skin\.css\?v=10a1/);
  assert.match(runtime, /new Set\(\["classic", "metro"\]\)/);
  assert.match(runtime, /params\.get\("skin"\)/);
  assert.match(runtime, /root\.dataset\.skin\s*=\s*next/);
  assert.match(runtime, /next === "metro" \? "dark" : "light"/);
});

test("Metro skin defines the Windows Phone visual grammar without modifying Classic tokens", async () => {
  const css = await read("app/metro-skin.css");

  assert.match(css, /html\[data-skin="metro"\]\s*\{/);
  assert.match(css, /--skin-background:\s*#000000/);
  assert.match(css, /--skin-accent:\s*#00a4ef/);
  assert.match(css, /--skin-radius-panel:\s*0px/);
  assert.match(css, /--skin-shadow-surface:\s*none/);
  assert.match(css, /\.topbar h1[\s\S]*font-weight:\s*300/);
  assert.match(css, /\.tab\.active::after[\s\S]*background:\s*var\(--color-accent\)/);
  assert.match(css, /\.movie-card[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.provider-compare-sheet[\s\S]*background:\s*#000000/);
});
