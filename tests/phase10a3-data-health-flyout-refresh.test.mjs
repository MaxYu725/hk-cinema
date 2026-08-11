import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("data health refresh bridge keeps the programmatic refresh inside the open flyout", async () => {
  const runtime = await read("app/classic-final-ui-polish.js");

  assert.match(runtime, /function clickRefreshInsideDataHealth\(panel\)/);
  assert.match(runtime, /target === button \|\| previousContains\.call\(panel, target\)/);
  assert.match(runtime, /try \{\s*button\.click\(\);\s*\} finally/);
  assert.match(runtime, /clickRefreshInsideDataHealth\(panel\)/);
});
