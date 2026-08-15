import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { assertAssetOrder } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, registrySource, healthSource, fixtureSource] = await Promise.all([
  read("app/index.html"),
  read("app/provider-registry.js"),
  read("app/data-health.js"),
  read("tests/fixtures/provider-fourth.json")
]);

function loadRegistry() {
  const context = { window: {} };
  vm.runInNewContext(registrySource, context);
  return context.window.HKCinemaProviderRegistry;
}

function loadDataHealth(providers) {
  const window = {
    HKCinemaProviderRegistry: { providers },
    addEventListener() {},
    setInterval() {}
  };
  vm.runInNewContext(healthSource, { window });
  return window.HKCinemaDataHealth;
}

test("M6C provider registry loads before Data Health", () => {
  assertAssetOrder(index, "provider-registry.js", "data-health.js");
});

test("provider descriptors expose identity and current staged capabilities", () => {
  const registry = loadRegistry();
  assert.equal(typeof registry.version, "string");
  assert.ok(registry.version.length > 0);
  assert.deepEqual(Array.from(registry.providers, item => item.id), [
    "broadway",
    "mcl",
    "emperor",
    "cineart"
  ]);
  assert.equal(registry.get("MCL")?.displayName, "MCL");
  assert.equal(registry.hasCapability("broadway", "seatMap"), true);
  assert.equal(registry.hasCapability("cineart", "catalogue"), true);
  assert.equal(registry.hasCapability("cineart", "showtimes"), true);
  assert.equal(registry.hasCapability("cineart", "prices"), true);
  assert.equal(registry.hasCapability("cineart", "seatSummary"), true);
  assert.equal(registry.hasCapability("cineart", "seatMap"), true);
  assert.equal(registry.hasCapability("cineart", "booking"), true);
  assert.ok(Object.isFrozen(registry.providers));
});

test("Data Health scales beyond the current four-provider registry", () => {
  const registry = loadRegistry();
  const fixture = JSON.parse(fixtureSource);
  const providers = [...registry.providers, { ...fixture, id: "fixture-fifth" }];
  const health = loadDataHealth(providers);
  const now = 1_000_000;
  const records = Object.fromEntries(providers.map(provider => [provider.id, {
    status: "fresh",
    source: "network",
    updatedAt: now,
    detail: "ok"
  }]));
  const summary = health.summarize(records, { now, online: true });
  assert.equal(summary.total, 5);
  assert.equal(summary.usable, 5);
  assert.equal(summary.label, "院線資料最新");
  assert.equal(summary.detail, "5/5 個來源已完成更新");
});

test("future-provider fixture can omit optional price and seat capabilities", () => {
  const fixture = JSON.parse(fixtureSource);
  assert.equal(fixture.capabilities.catalogue, true);
  assert.equal(fixture.capabilities.showtimes, true);
  assert.equal(fixture.capabilities.prices, false);
  assert.equal(fixture.capabilities.seatSummary, false);
  assert.equal(fixture.capabilities.seatMap, false);
  assert.equal(fixture.capabilities.booking, true);
});

test("status presentation uses provider-neutral wording", () => {
  assert.doesNotMatch(healthSource, /三院線|三個院線|四院線|四個院線/);
  assert.doesNotMatch(index, /重新整理(?:三|四)院線資料|正在更新(?:三|四)院線資料|(?:三|四)院線資料狀態/);
  assert.match(index, /aria-label="重新整理戲院資料"/);
  assert.match(index, /正在同步各院線最新電影資料/);
});
