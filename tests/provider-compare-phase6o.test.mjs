import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 6O renders the comparison contract once in the current primary renderer", async () => {
  const [renderer, phase6m, insights, seats, broadwaySeats, mclSeats] = await Promise.all([
    source("app/provider-compare-v4.js"),
    source("app/provider-compare-phase6m.js"),
    source("app/provider-compare-insights-v4.js"),
    source("app/provider-compare-seats.js"),
    source("app/seatmap.js"),
    source("app/mcl-seatmap.js")
  ]);

  assert.match(renderer, /<article class="provider-compare-show phase6m-show-card phase6o-native-show"/);
  assert.match(renderer, /data-booking-url=/);
  assert.match(renderer, /class="provider-compare-booking"/);
  assert.doesNotMatch(phase6m, /cloneNode|replaceWith|convertLinkedCard|addBookingAction/);
  assert.match(insights, /function renderActiveFilters\(items\)/);
  assert.match(insights, /records\.some\(mutationTouchesTimeline\)/);
  assert.doesNotMatch(insights, /phase6mOwned/);

  for (const seatReader of [seats, broadwaySeats, mclSeats]) {
    assert.match(seatReader, /dataset\?\.bookingUrl/);
  }
});

test("Phase 6O ships a deterministic mobile visual regression fixture", async () => {
  const fixture = await source("tests/provider-compare-phase6o-visual.html");

  assert.match(fixture, /name="viewport"/);
  assert.equal((fixture.match(/phase6o-native-show/g) || []).length, 3);
  assert.equal((fixture.match(/class="provider-compare-booking"/g) || []).length, 3);
  assert.match(fixture, /data-insight-provider='mcl'/);
  assert.match(fixture, /activeFilter:/);
  assert.match(fixture, /mclOnly:/);
  assert.match(fixture, /stable: mutations < 80/);
  assert.match(fixture, /document\.body\.dataset\.phase6oFixture/);
});
