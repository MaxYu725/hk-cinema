import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

test("M7D grouped movie sources propagate into Phase 8A variant inputs", async () => {
  const extension = await read("app/multi-provider-registry-extension.js");
  assert.match(extension, /syncGroupedProviderSources\(card, clean\)/);
  assert.match(extension, /groupMemberOf/);
  assert.match(extension, /variant\.sourceIds = sourceIds/);
  assert.match(extension, /delete groupCard\.dataset\.phase8aAggregateId/);
});

test("M7D CineArt enrichment distinguishes simultaneous houses using rendered secondary text", async () => {
  const enrichment = await read("app/cineart-compare-enrichment.js");
  assert.match(enrichment, /querySelector\("\.provider-compare-show-main > p"\)/);
  assert.doesNotMatch(enrichment, /querySelector\("\.provider-compare-show-secondary"\)/);
  assert.match(enrichment, /normalize\(identity\.secondary\)\.includes\(house\)/);
  assert.match(enrichment, /identity\.secondary/);
});

test("M7D browser enrichment never coerces missing price or seat values to zero", async () => {
  const enrichment = await read("app/cineart-compare-enrichment.js");
  assert.match(enrichment, /function numberOrNull\(value\)/);
  assert.match(enrichment, /value === null \|\| value === undefined \|\| value === ""/);
  assert.match(enrichment, /const display = numberOrNull\(price\?\.adult \?\? price\?\.display\)/);
  assert.match(enrichment, /const available = numberOrNull\(summary\?\.available\)/);
});
