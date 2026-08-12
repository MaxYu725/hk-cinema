import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, css] = await Promise.all([
  read("app/index.html"),
  read("app/metro-theme.css")
]);

const marker = "/* Phase M2: real-device homepage polish, consolidated into the owning Metro theme during M6B. */";
const start = css.indexOf(marker);
const polish = start >= 0 ? css.slice(start) : "";

test("M6B loads one consolidated Metro home theme before the comparison layer", () => {
  const theme = index.indexOf("metro-theme.css?v=m6b-5");
  const comparison = index.indexOf("metro-m3-comparison.css?v=m3-1");
  assert.ok(theme >= 0 && comparison > theme);
  assert.doesNotMatch(index, /metro-m2-home-polish\.css/);
});

test("consolidated M2 block preserves accepted homepage search and sort dimensions", () => {
  assert.ok(polish);
  assert.match(polish, /\.home-library-primary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(118px,\s*132px\)[^}]*gap:\s*10px/s);
  assert.match(polish, /\.home-movie-search,\s*\nhtml\[data-skin="metro"\] \.home-movie-sort\s*\{[^}]*min-height:\s*48px[^}]*border-width:\s*1px/s);
  assert.match(polish, /\.home-movie-search\s*\{[^}]*padding:\s*0\s+12px/s);
  assert.match(polish, /\.home-movie-search input\s*\{[^}]*min-height:\s*44px[^}]*font-size:\s*\.9rem/s);
  assert.match(polish, /\.home-movie-sort\s*\{[^}]*display:\s*block[^}]*padding:\s*0\s+10px/s);
  assert.match(polish, /\.home-movie-sort > span\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(polish, /\.home-movie-sort select\s*\{[^}]*min-height:\s*46px[^}]*padding:\s*0\s+22px\s+0\s+0[^}]*font-size:\s*\.82rem/s);
});

test("consolidated M2 block preserves the narrow-phone overrides", () => {
  assert.match(polish, /@media \(max-width:\s*380px\)[\s\S]*\.home-library-primary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+112px[^}]*gap:\s*8px/s);
  assert.match(polish, /@media \(max-width:\s*380px\)[\s\S]*\.home-movie-sort\s*\{[^}]*padding-inline:\s*8px/s);
  assert.match(polish, /@media \(max-width:\s*380px\)[\s\S]*\.home-movie-sort select\s*\{[^}]*font-size:\s*\.78rem/s);
});

test("homepage polish remains Metro presentation-only", () => {
  assert.doesNotMatch(polish, /data-seatmap-provider|provider-compare|broadway|mcl|emperor|fetch\(|API_BASE/i);
});
