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

  assert.equal(contract.version, "m6c-2.1");
  assert.equal(contract.contracts.catalogueEntry.capability, "catalogue");
  assert.equal(contract.contracts.movieAggregate.capability, "catalogue");
  assert.equal(contract.contracts.showtime.capability, "showtimes");
  assert.equal(contract.contracts.price.capability, "prices");
  assert.equal(contract.contracts.seatSummary.capability, "seatSummary");
  assert.equal(contract.contracts.seatMap.capability, "seatMap");
  assert.equal(contract.contracts.booking.capability, "booking");

  assert.deepEqual(Array.from(contract.contracts.catalogueEntry.required), ["sourceId", "title"]);
  assert.deepEqual(Array.from(contract.contracts.movieAggregate.required), ["id", "title", "sources"]);
  assert.deepEqual(Array.from(contract.contracts.showtime.required), ["sourceId", "cinema", "date", "time"]);
});

test("movie aggregate contract follows the active Phase 8A runtime shape", async () => {
  const [phase8a, sample, loaded] = await Promise.all([
    source("app/phase8a-movie-navigation.js"),
    fixture(),
    loadContract()
  ]);

  assert.match(phase8a, /kind: "movie-aggregate",\s*schemaVersion: 1,\s*id,/);
  assert.match(phase8a, /title: \{\s*display:/);
  assert.match(phase8a, /sources: Object\.fromEntries\(PROVIDERS\.map/);
  assert.equal(sample.movieAggregate.kind, "movie-aggregate");
  assert.equal(sample.movieAggregate.schemaVersion, 1);
  assert.equal(sample.movieAggregate.id.startsWith("phase8a:"), true);
  assert.deepEqual(Array.from(loaded.contract.missingRequired("movieAggregate", sample.movieAggregate)), []);
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

test("empty normalized objects remain missing instead of becoming available", async () => {
  const { contract } = await loadContract();
  const sample = await fixture();
  const supported = {
    ...sample.provider,
    capabilities: {
      ...sample.provider.capabilities,
      prices: true,
      seatSummary: true
    }
  };

  const emptyPrice = contract.optionalCapability(supported, "prices", {});
  const emptySeatSummary = contract.optionalCapability(supported, "seatSummary", { available: null });

  assert.equal(emptyPrice.support, "supported");
  assert.equal(emptyPrice.availability, "unknown");
  assert.equal(emptyPrice.value, null);
  assert.equal(emptySeatSummary.availability, "unknown");
  assert.equal(emptySeatSummary.value, null);
  assert.deepEqual(
    Array.from(contract.missingRequired("catalogueEntry", { sourceId: "fixture-movie", title: {} })),
    ["title"]
  );
  assert.deepEqual(
    Array.from(contract.missingRequired("showtime", {
      sourceId: "fixture-session",
      cinema: {},
      date: "2026-08-12",
      time: ""
    })),
    ["cinema", "time"]
  );
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
