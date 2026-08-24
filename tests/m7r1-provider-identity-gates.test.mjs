import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createProviderProbeRunner } from "../worker/src/provider-probe.js";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

function registryWithFixture() {
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

test("shared provider identity is registry-only and recognizes a fourth provider node", async () => {
  const window = { HKCinemaProviderRegistry: registryWithFixture() };
  vm.runInContext(await source("app/provider-shared-core.js"), vm.createContext({ window }));
  const core = window.HKCinemaProviderSharedCore;

  assert.deepEqual(Array.from(core.providerIds()), ["broadway", "mcl", "emperor", "fixture"]);
  assert.equal(core.registeredProviderId("FIXTURE"), "fixture");
  assert.equal(core.providerFromNode({ dataset: { provider: "fixture" } }), "fixture");
  assert.equal(core.providerFromNode({
    dataset: {},
    classList: { contains(value) { return value === "fixture"; } }
  }), "fixture");

  const sharedSource = await source("app/provider-shared-core.js");
  assert.equal(sharedSource.includes("FALLBACK_PROVIDERS"), false);
});

test("final cinema registry preserves an unregistered venue provider instead of relabeling it Broadway", async () => {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(await source("app/cinema-registry.js"), context);
  vm.runInContext(await source("app/cinema-registry-emperor.js"), context);

  const result = window.HKCinemaCinemaRegistry.resolve("fixture", "Fixture Harbour Cinema");
  assert.equal(result.provider, "fixture");
  assert.equal(result.canonical, "Fixture Harbour Cinema");
  assert.equal(result.region, "unknown");
});

test("provider probe runner accepts an additional provider handler without a second allow-list", async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes("cinema.com.hk")) {
      return { ok: true, status: 200, async text() { return "self.__next_f.push([]) openingDate movieTypes title_lang"; } };
    }
    if (target.includes("GetCinemaDetails.aspx")) {
      return { ok: true, status: 200, async text() { return JSON.stringify([{ id: 1 }]); } };
    }
    throw new TypeError(`unexpected fetch ${target}`);
  };

  const runner = createProviderProbeRunner({
    fetchImpl,
    emperorProbe: async () => ({ ok: true, count: 1 }),
    additionalProbes: {
      cineart: async () => ({ evidence: "cineart-test", source: "cineart-test-source", count: 1 }),
      fixture: async () => ({ evidence: "fixture-contract", source: "fixture-source", count: 2 })
    }
  });
  const result = await runner.probeAll();

  assert.deepEqual(Array.from(runner.supportedProviders), ["broadway", "mcl", "emperor", "cineart", "fixture"]);
  assert.equal(result.total, 5);
  assert.equal(result.providers.cineart.healthy, true);
  assert.equal(result.providers.fixture.healthy, true);
  assert.equal(result.providers.fixture.evidence.evidence, "fixture-contract");
});

test("comparison provider guard no longer enumerates three provider CSS classes", async () => {
  const guard = await source("app/provider-compare-provider-guard.js");
  assert.match(guard, /providerFromNode/);
  assert.equal(guard.includes('classList.contains("broadway")'), false);
  assert.equal(guard.includes('classList.contains("mcl")'), false);
  assert.equal(guard.includes('classList.contains("emperor")'), false);
});

test("provider probe route rejection copy is derived from the registered provider set", async () => {
  const worker = await source("worker/src/router.js");
  assert.match(worker, /SUPPORTED_PROVIDERS\.join/);
  assert.equal(worker.includes("provider must be broadway, mcl or emperor"), false);
});