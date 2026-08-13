import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

function fixtureRegistry() {
  const providers = [
    { id: "broadway", displayName: "Broadway", capabilities: {} },
    { id: "mcl", displayName: "MCL", capabilities: {} },
    { id: "emperor", displayName: "Emperor", capabilities: {} },
    { id: "fixture", displayName: "Fixture Cinema", capabilities: {} }
  ];
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  return {
    providers,
    get(id) { return byId.get(String(id || "").toLowerCase()) || null; }
  };
}

test("M7R2 shared catalogue bus stores and broadcasts a fourth registered provider snapshot", async () => {
  const events = [];
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const window = {
    HKCinemaProviderRegistry: fixtureRegistry(),
    dispatchEvent(event) { events.push(event); }
  };
  const context = vm.createContext({ window, CustomEvent });
  vm.runInContext(await source("app/provider-shared-core.js"), context, {
    filename: "provider-shared-core.js"
  });

  const catalogue = {
    now: [{ provider: "fixture", sourceId: "fixture-1", title: { zh: "第四院線電影" } }],
    coming: []
  };
  const core = window.HKCinemaProviderSharedCore;

  assert.equal(core.publishCatalogue("fixture", catalogue, { source: "test" }), true);
  assert.equal(core.catalogue("fixture"), catalogue);
  assert.equal(core.catalogueMap().fixture, catalogue);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "hkcinema:provider-catalogue");
  assert.equal(events[0].detail.provider, "fixture");
  assert.equal(events[0].detail.catalogue, catalogue);
  assert.equal(core.publishCatalogue("not-registered", catalogue), false);
});

test("M7R2 home aggregation owns provider sources and catalogue loops generically", async () => {
  const multi = await source("app/multi-provider.js");

  assert.match(multi, /sharedCore\?\.providers\?\.\(\)/);
  assert.match(multi, /data-provider-sources=/);
  assert.match(multi, /function cardProviderSources/);
  assert.match(multi, /function writeProviderSources/);
  assert.match(multi, /const alternateProviders = PROVIDERS\.filter/);
  assert.match(multi, /for \(const provider of alternateProviders\)/);
  assert.match(multi, /hkcinema:provider-catalogue/);
  assert.match(multi, /maxProviderCount/);

  assert.equal(multi.includes("const PROVIDER_OPTIONS"), false);
  assert.equal(multi.includes("let mclCatalogue"), false);
  assert.equal(multi.includes("let emperorCatalogue"), false);
  assert.equal(multi.includes("tripleMatched"), false);
  assert.equal(multi.includes("function getMCLMovies"), false);
  assert.equal(multi.includes("function getEmperorMovies"), false);
  assert.equal(multi.includes('addEventListener("hkcinema:mcl-catalogue"'), false);
  assert.equal(multi.includes('addEventListener("hkcinema:emperor-catalogue"'), false);
});

test("M7R2 current provider loaders publish through the neutral catalogue bus", async () => {
  const [mclStatus, emperorStatus, controls] = await Promise.all([
    source("app/mcl-status.js"),
    source("app/emperor-status.js"),
    source("app/shared-final-controls.js")
  ]);

  assert.match(mclStatus, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("mcl", catalogue/);
  assert.match(emperorStatus, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("emperor", catalogue/);
  assert.match(controls, /sharedCore\?\.providers\?\.\(\)/);
  assert.match(controls, /PROVIDERS\.flatMap/);
  assert.match(controls, /hkcinema:provider-catalogue/);
  assert.equal(controls.includes("HKCinemaMCLCatalogue"), false);
  assert.equal(controls.includes("HKCinemaEmperorCatalogue"), false);
});

test("M7R2 changed runtime assets remain independently cache-busted", async () => {
  const index = await source("app/index.html");

  for (const asset of [
    "provider-shared-core.js",
    "multi-provider.js",
    "mcl-status.js",
    "emperor-status.js",
    "shared-final-controls.js"
  ]) {
    assertAsset(index, asset);
  }
});
