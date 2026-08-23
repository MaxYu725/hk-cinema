import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAssetOrder } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

async function runtime() {
  const events = [];
  const window = {
    dispatchEvent(event) { events.push(event); },
    addEventListener() {}
  };
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const context = vm.createContext({ CustomEvent, console, window });
  for (const path of [
    "app/provider-registry.js",
    "app/catalogue-store.js",
    "app/provider-shared-core.js",
    "app/home-discovery-core.js",
    "app/showtime-metadata.js",
    "app/catalogue-domain.js"
  ]) vm.runInContext(await read(path), context, { filename: path });
  return { window, events };
}

function movie(provider, sourceId, title, extras = {}) {
  return {
    id: `${provider}:${sourceId}`,
    provider,
    sourceId,
    title: { zh: title, en: extras.titleEn || null },
    status: extras.status || "now-showing",
    poster: extras.poster || null,
    releaseDate: extras.releaseDate || null,
    rating: extras.rating || null,
    durationMinutes: extras.durationMinutes || null,
    language: extras.language || [],
    formats: extras.formats || []
  };
}

test("C3 load graph makes CatalogueStore and CatalogueDomain canonical before rendering", async () => {
  const index = await read("app/index.html");
  assertAssetOrder(index, "provider-registry.js", "catalogue-store.js", "provider-shared-core.js");
  assertAssetOrder(index, "home-discovery-core.js", "catalogue-domain.js", "multi-provider.js");
  assertAssetOrder(index, "providers/broadway.js", "broadway-status.js");
  assert.doesNotMatch(index, /\.\/app\.js|phase8a-movie-navigation-refresh/);
});

test("CatalogueStore is the only provider snapshot owner and preserves failure isolation", async () => {
  const { window, events } = await runtime();
  const store = window.HKCinemaCatalogueStore;

  store.report("broadway", { status: "error", detail: "fixture failure" });
  assert.equal(store.current("broadway").error, "fixture failure");
  store.report("broadway", { status: "loading" });
  assert.equal(store.current("broadway").error, null);
  store.report("broadway", { status: "error", detail: "fixture failure" });
  assert.equal(store.publish("mcl", {
    now: [movie("mcl", "10", "只在 MCL")],
    coming: [],
    festival: [],
    meta: { provider: "mcl", updatedAt: "2026-08-23T00:00:00.000Z" }
  }), true);

  const summary = store.summary("now");
  assert.equal(summary.usable, 1);
  assert.equal(summary.failed, 1);
  assert.equal(store.catalogue("mcl").now.length, 1);
  assert.equal(events.some(event => event.type === "hkcinema:provider-catalogue"), true);

  const model = window.HKCinemaCatalogueDomain.build("now");
  assert.equal(model.aggregates.length, 1);
  assert.equal(model.aggregates[0].title.display, "只在 MCL");
  assert.deepEqual(Array.from(model.aggregates[0].sources.mcl), ["10"]);
});

test("CatalogueDomain matches providers and builds MovieAggregate records before DOM rendering", async () => {
  const { window } = await runtime();
  const store = window.HKCinemaCatalogueStore;
  store.publish("broadway", {
    now: [movie("broadway", "20", "共同電影", { rating: "IIA", durationMinutes: 118 })],
    coming: [],
    meta: { provider: "broadway" }
  });
  store.publish("emperor", {
    now: [movie("emperor", "E20", "共同電影", { poster: "https://example.test/poster.jpg" })],
    coming: [],
    meta: { provider: "emperor" }
  });

  const model = window.HKCinemaCatalogueDomain.build("now");
  assert.equal(model.aggregates.length, 1);
  const aggregate = model.aggregates[0];
  assert.equal(aggregate.providerCount, 2);
  assert.equal(aggregate.facts.classification, "IIA");
  assert.equal(aggregate.facts.durationMinutes, 118);
  assert.equal(aggregate.posterUrl, "https://example.test/poster.jpg");
  assert.equal(window.HKCinemaProviderMatches.get(aggregate.id).broadway.sourceId, "20");
  assert.equal(window.HKCinemaProviderMatches.get(aggregate.id).emperor.sourceId, "E20");
});

test("variant grouping retains the generic MCL bridge without a Broadway base renderer", async () => {
  const { window } = await runtime();
  const store = window.HKCinemaCatalogueStore;
  store.publish("broadway", {
    now: [movie("broadway", "30", "版本電影（日語版）", { language: ["日語"] })],
    coming: [],
    meta: { provider: "broadway" }
  });
  store.publish("mcl", {
    now: [movie("mcl", "M30", "版本電影")],
    coming: [],
    festival: [],
    meta: { provider: "mcl" }
  });

  const model = window.HKCinemaCatalogueDomain.build("now");
  assert.equal(model.aggregates.length, 1);
  const aggregate = model.aggregates[0];
  assert.equal(aggregate.groupId, "versions:版本電影");
  const japanese = aggregate.variants.find(variant => variant.tags.includes("日語版"));
  assert.equal(japanese.sourceIds.broadway, "30");
  assert.equal(japanese.sourceIds.mcl, "M30");
  const match = window.HKCinemaProviderMatches.get(japanese.matchId);
  assert.deepEqual(Array.from(match.sessionCriteria.languages), ["japanese"]);
  assert.deepEqual(Array.from(match.comparisonOnlyProviders), ["mcl"]);
});

test("C3 removes Broadway bootstrap and adapter-side catalogue mirrors", async () => {
  const [shared, renderer, navigation, controls, mcl, emperor, cineart] = await Promise.all([
    read("app/provider-shared-core.js"),
    read("app/multi-provider.js"),
    read("app/phase8a-movie-navigation.js"),
    read("app/shared-final-controls.js"),
    read("app/mcl-status.js"),
    read("app/emperor-status.js"),
    read("app/cineart-status.js")
  ]);
  const production = [shared, renderer, navigation, controls, mcl, emperor, cineart].join("\n");
  assert.doesNotMatch(production, /HKCinemaBroadwayApp|homeBaseProvider|baseProvider\(|provider-only-card/);
  assert.doesNotMatch(production, /movie-group-member|phase8aAggregateId|data-phase8a-aggregate-id/);
  assert.doesNotMatch(production, /HKCinemaMCLCatalogue|HKCinemaEmperorCatalogue/);
  assert.doesNotMatch(`${mcl}\n${emperor}\n${cineart}`, /provider\.catalogue\s*=|adapter\.catalogue\s*=/);
  await assert.rejects(access(new URL("app/app.js", ROOT)));
  await assert.rejects(access(new URL("app/phase8a-movie-navigation-refresh.js", ROOT)));
});
