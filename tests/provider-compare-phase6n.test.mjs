import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 6N seat-trigger regression remains closed through the native renderer", async () => {
  const [compare, phase6m, mclSeats, compareSeats, emperorSeats] = await Promise.all([
    source("app/provider-compare-v3.js"),
    source("app/provider-compare-phase6m.js"),
    source("app/mcl-seatmap.js"),
    source("app/provider-compare-seats.js"),
    source("app/emperor-seatmap.js")
  ]);

  assert.match(compare, /phase6o-native-show/);
  assert.match(compare, /data-booking-url=/);
  assert.doesNotMatch(phase6m, /replaceWith\(replacement\)|innerHTML = card\.innerHTML/);
  assert.match(mclSeats, /dataset\?\.bookingUrl \|\| card\?\.getAttribute\("href"\)/);
  assert.match(compareSeats, /card\?\.dataset\?\.bookingUrl \|\| card\?\.getAttribute\("href"\)/);
  assert.match(compareSeats, /refresh\(\) \{\s*queueMicrotask\(observeCards\)/);
  assert.match(emperorSeats, /refresh: scheduleEnhance/);
});

test("Phase 6N observer-loop regression remains closed without ownership markers", async () => {
  const [phase6m, insights] = await Promise.all([
    source("app/provider-compare-phase6m.js"),
    source("app/provider-compare-insights-v3.js")
  ]);

  assert.doesNotMatch(phase6m, /phase6mOwned/);
  assert.match(phase6m, /shortcut\.textContent !== label/);
  assert.match(insights, /function mutationTouchesTimeline\(record\)/);
  assert.match(insights, /records\.some\(mutationTouchesTimeline\)/);
  assert.doesNotMatch(insights, /isPhase6MOwnedMutation|data-phase6m-owned/);
});
