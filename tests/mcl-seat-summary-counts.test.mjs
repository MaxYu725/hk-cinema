import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMCLSeats } from "../worker/src/providers/mcl-seats.js";

function seats(status, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${status}-${index + 1}`,
    status
  }));
}

test("MCL K11 IMAX summary counts each physical seat once", () => {
  const summary = summarizeMCLSeats([
    ...seats("available", 173),
    ...seats("wheelchair", 4),
    ...seats("sold", 180)
  ]);

  assert.equal(summary.total, 357);
  assert.equal(summary.available, 177);
  assert.equal(summary.sold, 180);
  assert.equal(summary.wheelchair, 4);
  assert.notEqual(summary.available, 350);
  assert.notEqual(summary.available + summary.sold + summary.blocked, 710);
});

test("MCL Festival Suite summary does not double standard available seats", () => {
  const summary = summarizeMCLSeats([
    ...seats("available", 14),
    ...seats("wheelchair", 4)
  ]);

  assert.equal(summary.total, 18);
  assert.equal(summary.available, 18);
  assert.equal(summary.sold, 0);
  assert.equal(summary.wheelchair, 4);
  assert.notEqual(summary.available, 32);
});

test("MCL subtype counters remain separate from aggregate inventory counters", () => {
  const summary = summarizeMCLSeats([
    { status: "sofa-available" },
    { status: "sofa-sold" },
    { status: "broken" },
    { status: "unknown" }
  ]);

  assert.deepEqual(summary, {
    total: 4,
    available: 1,
    sold: 1,
    blocked: 1,
    wheelchair: 0,
    "sofa-available": 1,
    "sofa-sold": 1,
    broken: 1,
    unknown: 1
  });
});
