import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const app = path.join(root, "app");

function read(relativePath) {
  return fs.readFileSync(path.join(app, relativePath), "utf8");
}

test("home sticky hotfix separates transient stuck state from compact layout", () => {
  const css = read("phase9d0-home-sticky-scroll.css");
  assert.match(css, /\.home-library-tools\.is-stuck \.home-library-filter-options\s*\{\s*display:\s*flex/);
  assert.match(css, /\.home-library-tools\.is-stuck \.home-library-footer\s*\{\s*display:\s*flex/);
  assert.match(css, /\.home-library-tools\.is-stuck-latched \.home-library-filter-options/);
  assert.match(css, /\.home-library-tools\.is-stuck-latched \.home-library-footer/);
  assert.match(css, /display:\s*none/);
});

test("sticky latch has a buffered enter threshold and independent exit threshold", () => {
  const js = read("phase9d0-home-sticky-scroll.js");
  assert.match(js, /MIN_ENTER_BUFFER\s*=\s*64/);
  assert.match(js, /EXIT_BUFFER\s*=\s*8/);
  assert.match(js, /expandedHeight - compactHeight \+ 16/);
  assert.match(js, /edge >= anchor \+ enterBuffer\(element\)/);
  assert.match(js, /edge <= anchor - EXIT_BUFFER/);
  assert.match(js, /is-stuck-latched/);
  assert.match(js, /addEventListener\("scroll", schedule, \{ passive: true \}\)/);
});

test("production loads sticky hotfix after home library runtime and late in CSS cascade", () => {
  const html = read("index.html");
  const homeScript = html.indexOf("./home-library.js?v=8e3");
  const hotfixScript = html.indexOf("./phase9d0-home-sticky-scroll.js?v=9d0-scroll1");
  assert.ok(homeScript >= 0 && hotfixScript > homeScript);

  const homeCss = html.indexOf("./home-library.css?v=6k1");
  const hotfixCss = html.indexOf("./phase9d0-home-sticky-scroll.css?v=9d0-scroll1");
  assert.ok(homeCss >= 0 && hotfixCss > homeCss);
});
