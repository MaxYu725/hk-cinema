import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 6N preserves seat trigger identity and rebinds replaced showtime cards", async () => {
  const [phase6m, mclSeats, emperorSeats] = await Promise.all([
    source("app/provider-compare-phase6m.js"),
    source("app/provider-compare-seats.js"),
    source("app/emperor-seatmap.js")
  ]);

  assert.match(phase6m, /replacement\.append\(\.\.\.card\.childNodes\)/);
  assert.doesNotMatch(phase6m, /replacement\.innerHTML = card\.innerHTML/);
  assert.match(phase6m, /delete replacement\.dataset\.seatObserved/);
  assert.match(phase6m, /HKCinemaProviderCompareSeats\?\.refresh\?\.\(\)/);
  assert.match(phase6m, /HKCinemaEmperorSeatMap\?\.refresh\?\.\(\)/);
  assert.match(mclSeats, /refresh\(\) \{\s*queueMicrotask\(observeCards\)/);
  assert.match(emperorSeats, /refresh: scheduleEnhance/);
});

test("Phase 6N isolates owned UI mutations and avoids no-op date label rewrites", async () => {
  const [phase6m, insights] = await Promise.all([
    source("app/provider-compare-phase6m.js"),
    source("app/provider-compare-insights-v3.js")
  ]);

  assert.match(phase6m, /dataset\.phase6mOwned = "true"/);
  assert.match(phase6m, /shortcut\.textContent !== label/);
  assert.match(insights, /function isPhase6MOwnedMutation\(record\)/);
  assert.match(insights, /target\?\.closest\?\.\("\[data-phase6m-owned\]"\)/);
  assert.match(insights, /records\.every\(isPhase6MOwnedMutation\)/);
});
