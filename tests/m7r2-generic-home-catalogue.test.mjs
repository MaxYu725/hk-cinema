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
  vm.runInContext(await source("app/catalogue-store.js"), context, {
    filename: "catalogue-store.js"
  });
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
  const storeEvent = events.find(event => event.type === "hkcinema:catalogue-store");
  const compatibilityEvent = events.find(event => event.type === "hkcinema:provider-catalogue");
  assert.equal(storeEvent.detail.provider, "fixture");
  assert.equal(storeEvent.detail.record.catalogue, catalogue);
  assert.equal(compatibilityEvent.detail.provider, "fixture");
  assert.equal(compatibilityEvent.detail.catalogue, catalogue);
  assert.equal(core.publishCatalogue("not-registered", catalogue), false);
});

test("M7R2 home aggregation owns provider sources and catalogue loops generically", async () => {
  const [domain, multi] = await Promise.all([
    source("app/catalogue-domain.js"),
    source("app/multi-provider.js")
  ]);

  assert.match(domain, /sharedCore\?\.providers\?\.\(\)/);
  assert.match(domain, /store\?\.entries\?\.\(section\)/);
  assert.match(multi, /data-provider-sources=/);
  assert.match(domain, /function sourceIdsFor/);
  assert.match(domain, /for \(const provider of PROVIDER_IDS\)/);
  assert.match(multi, /hkcinema:catalogue-store/);
  assert.match(multi, /model\.maxProviderCount/);

  const combined = `${domain}\n${multi}`;
  assert.equal(combined.includes("const PROVIDER_OPTIONS"), false);
  assert.equal(combined.includes("let mclCatalogue"), false);
  assert.equal(combined.includes("let emperorCatalogue"), false);
  assert.equal(combined.includes("tripleMatched"), false);
  assert.equal(combined.includes("function getMCLMovies"), false);
  assert.equal(combined.includes("function getEmperorMovies"), false);
  assert.equal(combined.includes('addEventListener("hkcinema:mcl-catalogue"'), false);
  assert.equal(combined.includes('addEventListener("hkcinema:emperor-catalogue"'), false);
});

test("M7R2 current provider loaders publish through the neutral catalogue bus", async () => {
  const [broadwayStatus, mclStatus, emperorStatus, cineartStatus, controls] = await Promise.all([
    source("app/broadway-status.js"),
    source("app/mcl-status.js"),
    source("app/emperor-status.js"),
    source("app/cineart-status.js"),
    source("app/shared-final-controls.js")
  ]);

  assert.match(broadwayStatus, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("broadway", catalogue/);
  assert.match(mclStatus, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("mcl", catalogue/);
  assert.match(emperorStatus, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("emperor", catalogue/);
  assert.match(cineartStatus, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("cineart", catalogue/);
  assert.match(controls, /sharedCore\?\.providers\?\.\(\)/);
  assert.match(controls, /PROVIDERS\.flatMap/);
  assert.match(controls, /hkcinema:provider-catalogue/);
  assert.equal(controls.includes("HKCinemaMCLCatalogue"), false);
  assert.equal(controls.includes("HKCinemaEmperorCatalogue"), false);
});

test("M7R2 runtime assets remain explicitly loaded in source order", async () => {
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
