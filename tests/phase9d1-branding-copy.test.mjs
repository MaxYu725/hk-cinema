import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const app = path.join(root, "app");

test("HK Cinema icon follows blue-background white-pictogram app-family branding", () => {
  const svg = fs.readFileSync(path.join(app, "icons", "icon.svg"), "utf8");
  const generator = fs.readFileSync(path.join(root, "scripts", "generate-pwa-icons.py"), "utf8");

  assert.match(svg, /fill="#0A57B5"/);
  assert.match(svg, /stroke="#fff"/);
  assert.match(svg, /fill="#fff"/);
  assert.doesNotMatch(svg, /#17191d|#1c8f5b/i);

  assert.match(generator, /BLUE = \(10, 87, 181\)/);
  assert.match(generator, /WHITE = \(255, 255, 255\)/);
  assert.doesNotMatch(generator, /GREEN\s*=/);
});

test("Classic home section no longer repeats the active tab label", () => {
  const css = fs.readFileSync(path.join(app, "phase9d0-home-sticky-scroll.css"), "utf8");
  assert.match(css, /html\[data-skin="classic"\] #sectionTitle::after/);
  assert.match(css, /content:\s*"全部電影"/);
});

test("branding refresh keeps a versioned PWA shell cache without changing live-data boundary", () => {
  const sw = fs.readFileSync(path.join(app, "sw.js"), "utf8");
  assert.match(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}[a-z0-9-]+`/i);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
});
