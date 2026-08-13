import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

function registryWithFixture() {
  const providers = [
    { id: "broadway", displayName: "Broadway", capabilities: {} },
    { id: "mcl", displayName: "MCL", capabilities: {} },
    { id: "emperor", displayName: "Emperor Cinemas", capabilities: {} },
    { id: "fixture", displayName: "Fixture Cinema", healthLabel: "Fixture", capabilities: {} }
  ];
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  return {
    providers,
    get(id) { return byId.get(String(id || "").trim().toLowerCase()) || null; }
  };
}

function documentStub() {
  return {
    readyState: "loading",
    body: {},
    addEventListener() {},
    querySelector() { return null; }
  };
}

async function loadSharedContext() {
  const window = {
    HKCinemaProviderRegistry: registryWithFixture(),
    addEventListener() {},
    setTimeout,
    clearTimeout
  };
  const document = documentStub();
  const context = vm.createContext({
    Array,
    CSS: { escape: value => String(value) },
    Date,
    Intl,
    Map,
    Math,
    Node: { ELEMENT_NODE: 1 },
    Number,
    Object,
    Set,
    String,
    clearTimeout,
    console,
    document,
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    queueMicrotask,
    requestAnimationFrame() {},
    setTimeout,
    window
  });
  vm.runInContext(await source("app/provider-shared-core.js"), context, {
    filename: "provider-shared-core.js"
  });
  return context;
}

function comparisonCard(provider = "fixture") {
  const dataset = {
    provider,
    showLanguage: "english",
    showSubtitle: "chinese",
    showFormat: "2d"
  };
  return {
    dataset,
    hidden: false,
    querySelector(selector) {
      if (selector === ".provider-compare-source") {
        return {
          textContent: provider,
          classList: { contains() { return false; } }
        };
      }
      if (selector === ".provider-compare-show-time") return { textContent: "18:30" };
      if (selector === ".provider-compare-show-topline strong") return { textContent: "Fixture Harbour Cinema" };
      if (selector === ".provider-compare-show-price") return { textContent: "$98" };
      if (selector === ".provider-compare-seat") return null;
      return null;
    }
  };
}

test("M7R4 comparison filters preserve a fourth provider identity and registry order", async () => {
  const context = await loadSharedContext();
  const resolutions = [];
  context.window.HKCinemaCinemaRegistry = {
    normalize(value) { return String(value || "").toLowerCase().replace(/\s+/g, "-"); },
    resolve(provider, cinema) {
      resolutions.push({ provider, cinema });
      return {
        provider,
        canonical: cinema,
        region: "unknown",
        district: null
      };
    }
  };
  vm.runInContext(await source("app/provider-compare-insights-v4.js"), context, {
    filename: "provider-compare-insights-v4.js"
  });

  const api = context.window.HKCinemaProviderCompareFilters;
  const card = comparisonCard();
  const parsed = api.parseCardForTest(card, 0);

  assert.equal(api.providerForCard(card), "fixture");
  assert.equal(parsed.provider, "fixture");
  assert.equal(parsed.providerLabel, "Fixture Cinema");
  assert.equal(parsed.cinemaMeta.provider, "fixture");
  assert.equal(parsed.region, "unknown");
  assert.equal(resolutions.at(-1).provider, "fixture");

  const options = api.providerOptionsFor([
    { provider: "fixture" },
    { provider: "mcl" },
    { provider: "broadway" },
    { provider: "emperor" }
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(options)),
    [
      { key: "broadway", label: "Broadway" },
      { key: "mcl", label: "MCL" },
      { key: "emperor", label: "Emperor Cinemas" },
      { key: "fixture", label: "Fixture Cinema" }
    ]
  );

  assert.equal(api.setFilter("provider", "fixture"), "fixture");
  assert.equal(api.getState().provider, "fixture");
  assert.equal(api.setFilter("provider", "not-registered"), "all");
  assert.equal(api.getState().provider, "all");
});

test("M7R4 Smart Picks uses registry identity instead of Broadway fallback", async () => {
  const context = await loadSharedContext();
  context.window.HKCinemaProviderCompare = {
    getState() { return { selectedDate: "2026-08-15" }; }
  };
  vm.runInContext(await source("app/provider-compare-recommendations-v4.js"), context, {
    filename: "provider-compare-recommendations-v4.js"
  });

  const api = context.window.HKCinemaSmartPicks2;
  const card = comparisonCard();
  const provider = api.providerOf(card);
  const item = api.itemForCard(card, 3);

  assert.deepEqual(JSON.parse(JSON.stringify(provider)), {
    key: "fixture",
    label: "Fixture Cinema"
  });
  assert.equal(item.provider, "fixture");
  assert.equal(item.providerLabel, "Fixture Cinema");
  assert.equal(item.price, 98);
  assert.equal(item.time, "18:30");
});

test("M7R4 saved preferences accept registered providers and reject unknown provider IDs", async () => {
  const context = await loadSharedContext();
  vm.runInContext(await source("app/provider-compare-preferences-v2.js"), context, {
    filename: "provider-compare-preferences-v2.js"
  });

  const api = context.window.HKCinemaProviderComparePreferences;
  assert.equal(api.sanitize({ provider: "FIXTURE" }).provider, "fixture");
  assert.equal(api.sanitize({ provider: "not-registered" }).provider, "all");
  assert.equal(api.sanitize({ provider: "broadway" }).provider, "broadway");
});

test("M7R4 Phase 6M active filter labels come from Provider Registry", async () => {
  const context = await loadSharedContext();
  context.window.HKCinemaProviderCompareFilters = {
    getState() {
      return {
        provider: "fixture",
        language: "all",
        subtitle: "all",
        format: "all",
        region: "all",
        cinema: "all",
        period: "all",
        sort: "time"
      };
    }
  };
  vm.runInContext(await source("app/provider-compare-phase6m.js"), context, {
    filename: "provider-compare-phase6m.js"
  });

  const filters = context.window.HKCinemaProviderComparePhase6M.getActiveFilters();
  assert.equal(filters.length, 1);
  assert.equal(filters[0].key, "provider");
  assert.equal(filters[0].label, "Fixture Cinema");
});

test("M7R4 source owners no longer enumerate Broadway, MCL and Emperor as the provider universe", async () => {
  const [insights, recommendations, preferences, phase6m, index] = await Promise.all([
    source("app/provider-compare-insights-v4.js"),
    source("app/provider-compare-recommendations-v4.js"),
    source("app/provider-compare-preferences-v2.js"),
    source("app/provider-compare-phase6m.js"),
    source("app/index.html")
  ]);

  assert.equal(insights.includes("PROVIDER_LABELS"), false);
  assert.equal(insights.includes("PROVIDER_ORDER"), false);
  assert.equal(insights.includes('data-insight-provider="broadway"'), false);
  assert.equal(insights.includes('data-insight-provider="mcl"'), false);
  assert.equal(insights.includes('data-insight-provider="emperor"'), false);
  assert.equal(recommendations.includes('classList.contains("emperor")'), false);
  assert.equal(recommendations.includes('classList.contains("mcl")'), false);
  assert.equal(preferences.includes('provider: new Set(["all", "broadway", "mcl", "emperor"])'), false);
  assert.equal(phase6m.includes('broadway: "Broadway"'), false);
  assert.match(index, /provider-compare-insights-v4\.js\?v=8c1-m7r4-1/);
  assert.match(index, /provider-compare-preferences-v2\.js\?v=8c1-m7r4-1/);
  assert.match(index, /provider-compare-recommendations-v4\.js\?v=10r3b-m7r4-1/);
  assert.match(index, /provider-compare-phase6m\.js\?v=7a1-m7r4-1/);
});
