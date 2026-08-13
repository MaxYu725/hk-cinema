import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("M8A4 CineArt seat-map presentation contract", async () => {
  const [index, css] = await Promise.all([
    read("app/index.html"),
    read("app/metro-m4-seat-view.css")
  ]);
  const rules = css.slice(css.indexOf("/* M8A4:"));
  assert.ok(rules.includes("cineart"));
  assert.ok(rules.includes("padding-bottom: 52px"));
  assert.ok(rules.includes("content: \"銀幕\""));
  assert.ok(rules.includes("width: 20px !important"));
  assert.ok(rules.includes("height: 20px !important"));
  assert.ok(index.includes("m6gate-1-m8a4-1"));
});
