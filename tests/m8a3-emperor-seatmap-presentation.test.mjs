import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

const [index, viewCss, sharedJs] = await Promise.all([
  source("app/index.html"),
  source("app/emperor-seatmap-view.css"),
  source("app/seatmap-shared.js")
]);

test("C2 loads Emperor seat-map presentation directly without the retired detail stylesheet", () => {
  assertAsset(index, "emperor-seatmap-view.css");
  assert.doesNotMatch(index, /emperor-detail\.css/);
});

test("M8A3 keeps Emperor positioned seats at a fixed 20px visual size", () => {
  assert.match(viewCss, /data-seatmap-provider="emperor"/);
  assert.match(viewCss, /data-layout-mode="positioned"/);
  assert.match(viewCss, /shared-seatmap-positioned-canvas > \.shared-seat[\s\S]*width:\s*20px\s*!important/);
  assert.match(viewCss, /shared-seatmap-positioned-canvas > \.shared-seat[\s\S]*height:\s*20px\s*!important/);
});

test("M8A3 puts the visible Emperor screen in the horizontally scrolling first canvas", () => {
  assert.match(viewCss, /shared-seatmap-layout > \.shared-seatmap-screen[\s\S]*display:\s*none/);
  assert.match(viewCss, /shared-seatmap-section:first-of-type \.shared-seatmap-positioned-canvas\s*\{[\s\S]*margin-top:\s*52px/);
  assert.match(viewCss, /shared-seatmap-section:first-of-type \.shared-seatmap-positioned-canvas::before[\s\S]*left:\s*42px[\s\S]*right:\s*34px[\s\S]*top:\s*-52px/);
  assert.match(viewCss, /shared-seatmap-section:first-of-type \.shared-seatmap-positioned-canvas::after[\s\S]*content:\s*"銀幕"/);
  assert.match(viewCss, /shared-seatmap-section:first-of-type \.shared-seatmap-positioned-rows[\s\S]*top:\s*52px/);
});

test("M8A3 is presentation-only and does not modify shared positioned geometry", () => {
  assert.doesNotMatch(viewCss, /data-seatmap-provider="(?:mcl|broadway|cineart)"/);
  assert.match(sharedJs, /function positionedMetrics\(section\)/);
  assert.match(sharedJs, /const scale = Math\.max\(0\.75, Math\.min\(1,/);
});
