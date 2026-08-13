import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function loadDataHealth() {
  const listeners = new Map();
  const window = {
    addEventListener(name, handler) { listeners.set(name, handler); },
    dispatchEvent() {},
    setInterval() {}
  };
  const document = {
    readyState: "complete",
    addEventListener() {},
    querySelector() { return null; }
  };
  class CustomEvent {
    constructor(name, options) {
      this.type = name;
      this.detail = options?.detail;
    }
  }
  const context = vm.createContext({
    console,
    CustomEvent,
    document,
    navigator: { onLine: true },
    window
  });
  vm.runInContext(await source("app/provider-registry.js"), context, { filename: "provider-registry.js" });
  vm.runInContext(await source("app/data-health.js"), context, { filename: "data-health.js" });
  return { api: window.HKCinemaDataHealth, listeners };
}

test("data freshness thresholds and age labels stay deterministic", async () => {
  const { api } = await loadDataHealth();
  const now = Date.parse("2026-08-08T12:00:00Z");

  assert.equal(api.classify({ status: "fresh", updatedAt: now - 5 * 60000 }, now).level, "fresh");
  assert.equal(api.classify({ status: "fresh", updatedAt: now - 30 * 60000 }, now).level, "aging");
  assert.equal(api.classify({ status: "fresh", updatedAt: now - 3 * 60 * 60000 }, now).level, "stale");
  assert.equal(api.classify({ status: "degraded", source: "cache", updatedAt: now - 60000 }, now).level, "degraded");
  assert.equal(api.classify({ status: "error" }, now).level, "error");
  assert.equal(api.formatAge(now - 60000, now), "1 分鐘前");
});

test("overall health keeps partial and offline data usable", async () => {
  const { api } = await loadDataHealth();
  const now = Date.parse("2026-08-08T12:00:00Z");
  const records = {
    broadway: { status: "fresh", source: "network", updatedAt: now },
    mcl: { status: "degraded", source: "cache", updatedAt: now - 60000 },
    emperor: { status: "error", source: "network", updatedAt: null }
  };

  const partial = api.summarize(records, { now, online: true });
  assert.equal(partial.level, "degraded");
  assert.equal(partial.usable, 2);
  assert.equal(partial.total, 4);

  const offline = api.summarize(records, { now, online: false });
  assert.equal(offline.level, "degraded");
  assert.equal(offline.label, "離線模式");
  assert.equal(offline.usable, 2);
  assert.equal(offline.total, 4);
});

test("Phase 6G cache, comparison freshness and Worker observability stay wired", async () => {
  const [index, app, mcl, emperorStatus, emperorProvider, compare, resilience, worker, config] = await Promise.all([
    source("app/index.html"),
    source("app/app.js"),
    source("app/mcl-status.js"),
    source("app/emperor-status.js"),
    source("app/providers/emperor.js"),
    source("app/provider-compare-v4.js"),
    source("app/provider-compare-resilience-v3.js"),
    source("worker/src/index-emperor-seat.js"),
    source("worker/wrangler.jsonc")
  ]);

  assert.ok(index.indexOf("provider-registry.js") < index.indexOf("data-health.js"));
  assert.ok(index.indexOf("data-health.js") < index.indexOf("app.js"));
  assert.match(app, /BROADWAY_CACHE_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(app, /writeBroadwayCache\(cacheEntries\)/);
  assert.match(app, /reportBroadway\("degraded"/);
  assert.match(mcl, /HKCinemaDataHealth\?\.report\?\.\("mcl"/);
  assert.match(emperorStatus, /HKCinemaDataHealth\?\.report\?\.\("emperor"/);
  assert.match(emperorProvider, /fallbackSections/);
  assert.match(emperorProvider, /if \(!catalogue\.meta\.partial\)/);
  assert.match(compare, /freshness:/);
  assert.match(compare, /updatedAt: result\.meta\?\.updatedAt/);
  assert.match(resilience, /資料過期/);
  assert.match(worker, /request_complete/);
  assert.match(worker, /x-request-id/);
  assert.match(config, /"observability"/);
  assert.match(config, /"nodejs_compat"/);
});

test("Worker health response exposes Phase 6G telemetry without probing upstreams", async () => {
  const worker = (await import("../worker/src/index-emperor-seat.js")).default;
  const response = await worker.fetch(
    new Request("https://local.test/health", {
      headers: { "cf-ray": "phase6g-test-ray" }
    }),
    {},
    {}
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "phase6g-test-ray");
  assert.match(response.headers.get("server-timing"), /^worker;dur=\d+$/);
  assert.equal(body.phase, "6G");
  assert.equal(body.status, "operational");
  assert.equal(body.freshness.catalogueFallbackMaxAgeSeconds, 86400);
});

test("Emperor partial refresh preserves the failed catalogue section", async () => {
  const cacheKey = "hkcinema:emperor-catalogue:v1";
  const storage = new Map([[cacheKey, JSON.stringify({
    savedAt: Date.now(),
    catalogue: {
      now: [{ id: "cached-now" }],
      coming: [{ id: "cached-coming", title: { zh: "備用新片" } }],
      meta: { updatedAt: new Date().toISOString() }
    }
  })]]);
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  };
  const fetch = async url => {
    if (String(url).endsWith("/api/emperor/movies")) {
      return new Response(JSON.stringify({
        ok: true,
        data: [{ sourceId: "fresh-now", title: { zh: "新上映" } }],
        meta: { updatedAt: new Date().toISOString() }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: { message: "upcoming failed" } }), {
      status: 502,
      headers: { "content-type": "application/json" }
    });
  };
  const window = {};
  vm.runInContext(await source("app/providers/emperor.js"), vm.createContext({
    AbortController,
    Date,
    Error,
    JSON,
    Map,
    Number,
    Object,
    Response,
    String,
    URL,
    clearTimeout,
    fetch,
    localStorage,
    setTimeout,
    window
  }));

  const catalogue = await window.HKCinemaProviders.emperor.refreshCatalogue();
  assert.equal(catalogue.now[0].sourceId, "fresh-now");
  assert.equal(catalogue.coming[0].id, "cached-coming");
  assert.equal(catalogue.meta.partial, true);
  assert.equal(catalogue.meta.fallbackSections.now, false);
  assert.equal(catalogue.meta.fallbackSections.coming, true);
});
