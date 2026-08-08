import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function loadCore() {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(await source("app/home-discovery-core.js"), context, {
    filename: "home-discovery-core.js"
  });
  return window.HKCinemaHomeDiscoveryCore;
}

test("language and presentation variants share one conservative base title", async () => {
  const core = await loadCore();
  const japanese = core.parseVariantTitle("劇場版 CHIIKAWA 人魚島的秘密 (日語版)");
  const cantonese = core.parseVariantTitle("劇場版 CHIIKAWA 人魚島的秘密（粵語版）");
  const imax = core.parseVariantTitle("IMAX 奧德賽");
  const standard = core.parseVariantTitle("奧德賽");

  assert.equal(japanese.base, "劇場版 CHIIKAWA 人魚島的秘密");
  assert.equal(japanese.key, cantonese.key);
  assert.deepEqual(Array.from(japanese.tags), ["日語版"]);
  assert.equal(imax.key, standard.key);
  assert.equal(imax.hasVariant, true);
});

test("special screenings group while years and festival labels remain part of titles", async () => {
  const core = await loadCore();
  const special = core.parseVariantTitle("(8.15-8.16) (特典場) 蜘蛛俠：英雄重生");
  const bookSpecial = core.parseVariantTitle("《蜘蛛俠：英雄重生》特典場");
  const normal = core.parseVariantTitle("蜘蛛俠：英雄重生");
  const year = core.parseVariantTitle("ATEEZ : LIGHT THE WAY IN CINEMAS (2026)");
  const festival = core.parseVariantTitle("傷痕之下 (EADF2026)");
  const extended = core.parseVariantTitle("《嚇房：Everything Must Go》（加長版）");
  const meetAndGreet = core.parseVariantTitle("【 期間限定 】《劇場版 CHIIKAWA 人魚島的秘密》 Meet & Greet 見面場");
  const chiikawa = core.parseVariantTitle("劇場版 CHIIKAWA 人魚島的秘密");
  const nestedBookTitle = core.parseVariantTitle("25週年魔法之旅：《哈利波特神秘的魔法石》");
  const mclMeetAndGreet = core.parseVariantTitle("【期間限定】《劇場版 CHIIKAWA 人魚島的秘密》 Meet & Greet 見面場 日語版");
  const emperorMeetAndGreet = core.parseVariantTitle("【期間限定】（日語版）《劇場版 CHIIKAWA 人魚島的秘密》 Meet & Greet 見面場");

  assert.equal(special.key, normal.key);
  assert.equal(bookSpecial.key, normal.key);
  assert.ok(special.tags.includes("8.15-8.16"));
  assert.equal(year.base, "ATEEZ : LIGHT THE WAY IN CINEMAS (2026)");
  assert.equal(festival.base, "傷痕之下 (EADF2026)");
  assert.equal(extended.base, "嚇房：Everything Must Go");
  assert.equal(meetAndGreet.key, chiikawa.key);
  assert.ok(meetAndGreet.tags.includes("期間限定"));
  assert.ok(meetAndGreet.tags.includes("Meet & Greet"));
  assert.ok(meetAndGreet.tags.includes("見面場"));
  assert.equal(nestedBookTitle.base, "25週年魔法之旅：《哈利波特神秘的魔法石》");
  assert.equal(core.variantSignature(mclMeetAndGreet), core.variantSignature(emperorMeetAndGreet));
});

test("provider filters use inclusive multi-select semantics", async () => {
  const core = await loadCore();
  assert.equal(core.filterMatches(["broadway"], []), true);
  assert.equal(core.filterMatches(["broadway", "mcl"], ["mcl", "emperor"]), true);
  assert.equal(core.filterMatches(["broadway"], ["mcl", "emperor"]), false);
});

test("equivalent language variants share a provider-independent signature", async () => {
  const core = await loadCore();
  const suffix = core.parseVariantTitle("劇場版 CHIIKAWA 人魚島的秘密（日語版）");
  const prefix = core.parseVariantTitle("（日語版）劇場版 CHIIKAWA 人魚島的秘密");
  const cantonese = core.parseVariantTitle("劇場版 CHIIKAWA 人魚島的秘密（粵語版）");

  assert.equal(core.variantSignature(suffix), core.variantSignature(prefix));
  assert.notEqual(core.variantSignature(suffix), core.variantSignature(cantonese));
  assert.equal(core.variantSignature(core.parseVariantTitle("奧德賽")), "standard");
});

test("English language labels are treated as versions without removing release years", async () => {
  const core = await loadCore();
  const japanese = core.parseVariantTitle("Chiikawa The Movie (Japanese Version)");
  const cantonese = core.parseVariantTitle("Chiikawa The Movie (Cantonese Version)");
  const year = core.parseVariantTitle("ATEEZ: Light The Way (2026)");

  assert.equal(japanese.key, cantonese.key);
  assert.deepEqual(Array.from(japanese.tags), ["Japanese Version"]);
  assert.equal(year.base, "ATEEZ: Light The Way (2026)");
});

test("Phase 6H home discovery controls and version chooser stay wired", async () => {
  const [index, multiProvider, styles, health, compare] = await Promise.all([
    source("app/index.html"),
    source("app/multi-provider.js"),
    source("app/multi-provider.css"),
    source("app/data-health.js"),
    source("app/provider-compare-v3.js")
  ]);

  assert.ok(index.indexOf("home-discovery-core.js?v=6i3") < index.indexOf("multi-provider.js?v=6k1"));
  assert.match(multiProvider, /data-home-provider/);
  assert.match(multiProvider, /applyVariantGrouping/);
  assert.match(multiProvider, /data-movie-group-provider/);
  assert.match(styles, /\.home-provider-filters/);
  assert.match(styles, /\.movie-group-sheet/);
  assert.match(health, /document\.createElement\("details"\)/);
  assert.match(compare, /normalized-variant/);
  assert.match(compare, /版本配對/);
});
