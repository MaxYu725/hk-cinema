import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function loadContract() {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(await source("app/provider-registry.js"), context, { filename: "provider-registry.js" });
  vm.runInContext(await source("app/provider-contract.js"), context, { filename: "provider-contract.js" });
  return {
    registry: window.HKCinemaProviderRegistry,
    contract: window.HKCinemaProviderContract
  };
}

async function fixture() {
  return JSON.parse(await source("tests/fixtures/provider-contract-minimal.json"));
}

test("M6C Checkpoint 2 defines one shared data surface contract", async () => {
  const { contract } = await loadContract();

  assert.equal(contract.version, "m6c-2");
  assert.equal(contract.contracts.catalogueEntry.capability, "catalogue");
  assert.equal(contract.contracts.movieAggregate.capability, "catalogue");
  assert.equal(contract.contracts.showtime.capability, "showtimes");
  assert.equal(contract.contracts.price.capability, "prices");
  assert.equal(contract.contracts.seatSummary.capability, "seatSummary");
  assert.equal(contract.contracts.seatMap.capability, "seatMap");
  assert.equal(contract.contracts.booking.capability, "booking");

  assert.deepEqual(Array.from(contract.contracts.catalogueEntry.required), ["sourceId", "title"]);
  assert.deepEqual(Array.from(contract.contracts.showtime.required), ["sourceId", "cinema", "date", "time"]);
});

test("minimal fourth-provider-shaped data satisfies catalogue and showtime requirements", async () => {
  const { contract } = await loadContract();
  const sample = await fixture();

  assert.deepEqual(Array.from(contract.missingRequired("catalogueEntry", sample.catalogueEntry)), []);
  assert.deepEqual(Array.from(contract.missingRequired("movieAggregate", sample.movieAggregate)), []);
  assert.deepEqual(Array.from(contract.missingRequired("showtime", sample.showtime)), []);
});

test("unsupported optional capabilities are distinct from supported-but-missing data", async () => {
  const { contract } = await loadContract();
  const sample = await fixture();

  const price = contract.optionalCapability(sample.provider, "prices", sample.price);
  const seatSummary = contract.optionalCapability(sample.provider, "seatSummary", sample.seatSummary);
  const seatMap = contract.optionalCapability(sample.provider, "seatMap", sample.seatMap);
  const booking = contract.optionalCapability(sample.provider, "booking", sample.showtime.bookingUrl);
  const supportedButMissingBooking = contract.optionalCapability(sample.provider, "booking", null);

  assert.deepEqual(
    { support: price.support, availability: price.availability, value: price.value },
    { support: "unsupported", availability: "unsupported", value: null }
  );
  assert.equal(seatSummary.availability, "unsupported");
  assert.equal(seatMap.availability, "unsupported");
  assert.equal(booking.support, "supported");
  assert.equal(booking.availability, "available");
  assert.equal(booking.value, sample.showtime.bookingUrl);
  assert.equal(supportedButMissingBooking.support, "supported");
  assert.equal(supportedButMissingBooking.availability, "unknown");
});

test("capability evaluation is descriptor-driven rather than provider-name-driven", async () => {
  const { registry, contract } = await loadContract();
  const sample = await fixture();

  assert.equal(contract.capabilityState(sample.provider, "prices"), "unsupported");
  assert.equal(contract.capabilityState(sample.provider, "booking"), "supported");
  assert.equal(contract.capabilityState("broadway", "prices"), "supported");
  assert.equal(contract.capabilityState("mcl", "seatMap"), "supported");
  assert.equal(contract.capabilityState("emperor", "seatSummary"), "supported");
  assert.equal(contract.capabilityState("not-registered", "prices"), "unknown");
  assert.deepEqual(Array.from(registry.capabilityKeys), [
    "catalogue",
    "showtimes",
    "prices",
    "seatSummary",
    "seatMap",
    "booking"
  ]);
});

test("missing required fields fail contract validation without inventing values", async () => {
  const { contract } = await loadContract();

  assert.deepEqual(
    Array.from(contract.missingRequired("showtime", { sourceId: "s1", date: "2026-08-12" })),
    ["cinema", "time"]
  );
  assert.deepEqual(Array.from(contract.missingRequired("unknown-surface", {})), []);
});
