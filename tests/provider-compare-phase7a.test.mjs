import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assetPosition, assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function loadMetadata() {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(await source("app/showtime-metadata.js"), context, {
    filename: "showtime-metadata.js"
  });
  return window.HKCinemaShowtimeMetadata;
}

test("Phase 7A normalizes Broadway, MCL and Emperor session metadata", async () => {
  const metadata = await loadMetadata();
  const broadway = metadata.normalizeSession({
    language: "日語",
    subtitles: ["中文", "英文"],
    format: "IMAX2D with Laser"
  });
  const mcl = metadata.normalizeSession({
    language: "日語 · 字幕: 中文, 英文",
    displayVersion: "2D 日語"
  });
  const emperor = metadata.normalizeSession({
    language: "粵語",
    subtitle: "沒有",
    format: "2D"
  });
  const hindi = metadata.normalizeSession({ language: "印度語" });
  const japaneseSpelling = metadata.normalizeSession({ language: "日本語" });
  const versionFallback = metadata.normalizeSession({
    versionName: "日語 · 字幕: 英文"
  });
  const compactEnglishSubtitles = metadata.normalizeSession({ versionName: "英文字幕" });
  const compactJapaneseSubtitles = metadata.normalizeSession({ versionName: "日文字幕" });
  const compactChineseSubtitles = metadata.normalizeSession({ versionName: "中文字幕" });
  const compactMixedVersion = metadata.normalizeSession({ versionName: "日語中文字幕" });

  assert.deepEqual(Array.from(broadway.languages), ["japanese"]);
  assert.deepEqual(Array.from(broadway.subtitles), ["chinese", "english"]);
  assert.deepEqual(Array.from(broadway.formats), ["imax-laser"]);
  assert.deepEqual(Array.from(mcl.languages), ["japanese"]);
  assert.deepEqual(Array.from(mcl.subtitles), ["chinese", "english"]);
  assert.deepEqual(Array.from(mcl.formats), ["2d"]);
  assert.deepEqual(Array.from(emperor.languages), ["cantonese"]);
  assert.deepEqual(Array.from(emperor.subtitles), ["none"]);
  assert.deepEqual(Array.from(emperor.formats), ["2d"]);
  assert.deepEqual(Array.from(hindi.languages), ["hindi"]);
  assert.deepEqual(Array.from(hindi.languageLabels), ["印地語"]);
  assert.deepEqual(Array.from(japaneseSpelling.languages), ["japanese"]);
  assert.deepEqual(Array.from(versionFallback.languages), ["japanese"]);
  assert.deepEqual(Array.from(versionFallback.subtitles), ["english"]);
  assert.deepEqual(Array.from(compactEnglishSubtitles.languages), ["unknown"]);
  assert.deepEqual(Array.from(compactEnglishSubtitles.subtitles), ["english"]);
  assert.deepEqual(Array.from(compactJapaneseSubtitles.languages), ["unknown"]);
  assert.deepEqual(Array.from(compactJapaneseSubtitles.subtitles), ["japanese"]);
  assert.deepEqual(Array.from(compactChineseSubtitles.languages), ["unknown"]);
  assert.deepEqual(Array.from(compactChineseSubtitles.subtitles), ["chinese"]);
  assert.deepEqual(Array.from(compactMixedVersion.languages), ["japanese"]);
  assert.deepEqual(Array.from(compactMixedVersion.subtitles), ["chinese"]);
});

test("Phase 7A preserves partial browser sessions when Worker fallback fails", async () => {
  const browserData = {
    sessions: [{ sourceId: "mcl-session-1", language: "日語" }],
    allSessions: [{ sourceId: "mcl-session-1", language: "日語" }],
    metadataComplete: false,
    source: { transport: "browser-direct" }
  };
  const window = {
    HKCinemaProviders: {
      mcl: {
        getTicketing: async () => browserData
      }
    },
    addEventListener() {}
  };
  const context = vm.createContext({
    window,
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      throw new Error("Worker unavailable");
    }
  });

  vm.runInContext(await source("app/mcl-ticketing-hybrid.js"), context, {
    filename: "mcl-ticketing-hybrid.js"
  });

  const result = await window.HKCinemaProviders.mcl.getTicketing(
    "mcl:123",
    "2026-08-10"
  );

  assert.equal(result, browserData);
  assert.equal(result.sessions.length, 1);
});

test("Phase 7A bridges only ordinary language variants to an MCL general MovieSet", async () => {
  const metadata = await loadMetadata();
  const japanese = metadata.criteriaFromVariant(["日語版"]);
  const english = metadata.criteriaFromVariant(["English Version"]);
  const ordinary2d = metadata.criteriaFromVariant(["2D 日語版"]);
  const imax = metadata.criteriaFromVariant(["IMAX 日語版"]);
  const threeD = metadata.criteriaFromVariant(["3D English Version"]);
  const chineseSubtitle = metadata.criteriaFromVariant(["英文字幕"]);
  const englishSubtitle = metadata.criteriaFromVariant(["English Subtitles"]);
  const japaneseSubtitle = metadata.criteriaFromVariant(["日文字幕"]);
  const special = metadata.criteriaFromVariant(["期間限定", "Meet & Greet", "日語版"]);
  const combinedMeetAndGreet = metadata.criteriaFromVariant(["日語版 Meet & Greet"]);
  const combinedLimited = metadata.criteriaFromVariant(["日語版 期間限定"]);
  const audioDescription = metadata.criteriaFromVariant(["English Audio Description"]);

  assert.equal(japanese.bridgeEligible, true);
  assert.deepEqual(Array.from(japanese.languages), ["japanese"]);
  assert.deepEqual(Array.from(japanese.formats), ["unknown", "2d"]);
  assert.equal(metadata.isGenericBridgeSource([]), true);
  assert.equal(metadata.isGenericBridgeSource(["2D"]), true);
  assert.equal(metadata.isGenericBridgeSource(["2D", "日語版"]), false);
  assert.equal(metadata.isGenericBridgeSource(["IMAX"]), false);
  assert.equal(english.bridgeEligible, true);
  assert.deepEqual(Array.from(english.languages), ["english"]);
  assert.equal(ordinary2d.bridgeEligible, true);
  assert.equal(imax.bridgeEligible, false);
  assert.equal(threeD.bridgeEligible, false);
  assert.equal(chineseSubtitle.bridgeEligible, false);
  assert.deepEqual(Array.from(chineseSubtitle.languages), []);
  assert.equal(englishSubtitle.bridgeEligible, false);
  assert.deepEqual(Array.from(englishSubtitle.languages), []);
  assert.equal(japaneseSubtitle.bridgeEligible, false);
  assert.deepEqual(Array.from(japaneseSubtitle.languages), []);
  assert.equal(special.bridgeEligible, false);
  assert.equal(combinedMeetAndGreet.bridgeEligible, false);
  assert.equal(combinedLimited.bridgeEligible, false);
  assert.equal(audioDescription.bridgeEligible, false);

  const japaneseSession = metadata.normalizeSession({ language: "日語" });
  const japanese2dSession = metadata.normalizeSession({ language: "日語", format: "2D" });
  const japanese3dSession = metadata.normalizeSession({ language: "日語", format: "3D" });
  const japaneseImaxSession = metadata.normalizeSession({ language: "日語", format: "IMAX" });
  const cantoneseSession = metadata.normalizeSession({ language: "粵語" });
  assert.equal(metadata.matchesCriteria(japaneseSession, japanese), true);
  assert.equal(metadata.matchesCriteria(japanese2dSession, japanese), true);
  assert.equal(metadata.matchesCriteria(japanese3dSession, japanese), false);
  assert.equal(metadata.matchesCriteria(japaneseImaxSession, japanese), false);
  assert.equal(metadata.matchesCriteria(cantoneseSession, japanese), false);
});

test("Phase 7A moves to the next valid date after MCL enrichment rejects the selection", async () => {
  const content = { innerHTML: "" };
  const overlay = {
    hidden: true,
    querySelector(selector) {
      return selector === "#providerCompareContent" ? content : null;
    }
  };
  const document = {
    body: {
      classList: {
        add() {},
        remove() {}
      }
    },
    addEventListener() {},
    querySelector(selector) {
      return selector === "#providerCompareOverlay" ? overlay : null;
    }
  };
  const mclDates = [];
  const broadwayDates = [];
  const window = {
    addEventListener() {},
    dispatchEvent() {},
    HKCinemaProviderRegistry: {
      providers: [
        { id: "broadway", displayName: "Broadway Circuit" },
        { id: "mcl", displayName: "MCL Cinemas" }
      ]
    },
    HKCinemaProviderMatches: new Map(),
    HKCinemaProviders: {
      mcl: {
        async getTicketing(_movieSetId, selectedDate) {
          mclDates.push(selectedDate);
          if (!selectedDate) {
            return {
              availableDates: ["2026-08-10"],
              selectedDate: "2026-08-10",
              allSessions: [{ date: "2026-08-10", language: null }],
              sessions: [{ date: "2026-08-10", language: null }],
              metadataComplete: false
            };
          }
          return {
            availableDates: ["2026-08-10"],
            selectedDate,
            allSessions: [{ date: "2026-08-10", language: null }],
            sessions: [{ date: selectedDate, language: "粵語" }],
            metadataComplete: true
          };
        }
      }
    }
  };
  const fetch = async url => {
    const selectedDate = new URL(url).searchParams.get("date");
    broadwayDates.push(selectedDate);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          data: {
            availableDates: ["2026-08-11"],
            selectedDate: selectedDate || "2026-08-11",
            sessions: [{ date: "2026-08-11", language: "日語", time: "12:00" }]
          },
          meta: { updatedAt: "2026-08-09T00:00:00.000Z" }
        };
      }
    };
  };
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document,
    fetch,
    setTimeout,
    URL,
    window
  });

  vm.runInContext(await source("app/showtime-metadata.js"), context, {
    filename: "showtime-metadata.js"
  });
  const criteria = window.HKCinemaShowtimeMetadata.criteriaFromVariant(["日語版"]);
  window.HKCinemaProviderMatches.set("date-refinement", {
    id: "date-refinement",
    title: "日期修正測試",
    matchType: "normalized-variant",
    confidence: 1,
    broadway: { sourceId: "broadway:1" },
    mcl: { sourceId: "mcl:1", movie: {} },
    sessionCriteria: criteria,
    comparisonOnlyProviders: ["mcl"]
  });
  vm.runInContext(await source("app/provider-compare-v4.js"), context, {
    filename: "provider-compare-v4.js"
  });

  assert.equal(window.HKCinemaProviderCompare.open("date-refinement"), true);
  for (let index = 0; index < 20; index++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const state = window.HKCinemaProviderCompare.getState();
  assert.equal(state.selectedDate, "2026-08-11");
  assert.deepEqual(Array.from(state.availableDates.mcl), []);
  assert.deepEqual(mclDates, [null, "2026-08-10"]);
  assert.deepEqual(broadwayDates, [null, "2026-08-11"]);
  assert.match(content.innerHTML, /data-provider-compare-date="2026-08-11"/);
  assert.match(content.innerHTML, /provider-compare-date active/);
});

test("Phase 7A keeps unresolved MCL dates until enriched sessions settle the language", async () => {
  const metadata = await loadMetadata();
  const japanese = metadata.criteriaFromVariant(["日語版"]);
  const result = {
    availableDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    selectedDate: "2026-08-10",
    allSessions: [
      { date: "2026-08-10", language: null },
      { date: "2026-08-11", versionName: null },
      { date: "2026-08-12", language: "粵語" }
    ],
    sessions: [{ date: "2026-08-10", language: "日語" }]
  };

  assert.deepEqual(
    Array.from(metadata.candidateDatesForCriteria(result, japanese)),
    ["2026-08-10", "2026-08-11"]
  );
  assert.equal(metadata.criteriaStatus({ language: null }, japanese), "unknown");
  assert.equal(metadata.criteriaStatus({ language: "日語" }, japanese), "match");
  assert.equal(metadata.criteriaStatus({ language: "粵語" }, japanese), "mismatch");

  result.sessions = [{ date: "2026-08-10", language: "粵語" }];
  assert.deepEqual(
    Array.from(metadata.candidateDatesForCriteria(result, japanese)),
    ["2026-08-11"]
  );

  const rejected = metadata.selectedDateDecisionForCriteria(result, japanese);
  assert.deepEqual({ date: rejected.date, status: rejected.status }, {
    date: "2026-08-10",
    status: "mismatch"
  });
  const nextDateResult = {
    availableDates: ["2026-08-10", "2026-08-11"],
    selectedDate: "2026-08-11",
    allSessions: [
      { date: "2026-08-10", language: null },
      { date: "2026-08-11", language: null }
    ],
    sessions: [{ date: "2026-08-11", language: "日語" }]
  };
  assert.deepEqual(
    Array.from(metadata.candidateDatesForCriteria(
      nextDateResult,
      japanese,
      new Map([[rejected.date, rejected.status]])
    )),
    ["2026-08-11"]
  );
});

test("Phase 7A comparison contract links MCL general sessions and dynamic facets", async () => {
  const [index, multiProvider, compare, insights, preferences, phase6m, fixture, browserMcl, hybridMcl, workerMcl, workerIndex] = await Promise.all([
    source("app/index.html"),
    source("app/multi-provider.js"),
    source("app/provider-compare-v4.js"),
    source("app/provider-compare-insights-v4.js"),
    source("app/provider-compare-preferences-v2.js"),
    source("app/provider-compare-phase6m.js"),
    source("tests/provider-compare-phase6o-visual.html"),
    source("app/mcl-ticketing-worker.js"),
    source("app/mcl-ticketing-hybrid.js"),
    source("worker/src/providers/mcl-webapi-ticketing.js"),
    source("worker/src/index.js")
  ]);

  for (const asset of [
    "showtime-metadata.js",
    "multi-provider.js",
    "provider-compare-v4.js",
    "provider-compare-insights-v4.js",
    "provider-compare-preferences-v2.js",
    "mcl-ticketing-worker.js",
    "mcl-ticketing-hybrid.js"
  ]) assertAsset(index, asset);
  const metadataIndex = assetPosition(index, "showtime-metadata.js");
  assert.ok(metadataIndex < assetPosition(index, "multi-provider.js"));
  assert.ok(metadataIndex < assetPosition(index, "provider-compare-v4.js"));
  assert.match(multiProvider, /genericMCL/);
  assert.match(multiProvider, /isGenericBridgeSource/);
  assert.match(multiProvider, /comparisonMclSourceId/);
  assert.match(multiProvider, /sessionCriteria/);
  assert.doesNotMatch(multiProvider, /MCL 會按每場語言加入此版本比較/);
  assert.match(compare, /filteredRawSessions/);
  assert.match(compare, /availableDatesFor/);
  assert.match(compare, /criteriaDateDecisions/);
  assert.match(compare, /rememberCriteriaDateDecision/);
  assert.match(compare, /!combinedDates\(\)\.includes\(state\.selectedDate\)/);
  assert.match(compare, /fetchShows:\s*fetchMCLShows/);
  assert.match(compare, /const lifecycle = childController\(signal, timeoutForProvider\(provider\)\)/);
  assert.match(compare, /signal: lifecycle\.controller\.signal/);
  assert.match(compare, /const reusePolicy = comparisonAdapter\(key\)\?\.canReuse/);
  assert.doesNotMatch(compare, /key !== "mcl"/);
  assert.match(compare, /data-show-language/);
  assert.match(compare, /if \(aggregateForMatch\(match\)\) return false/);

  for (const kind of ["language", "subtitle", "format"]) {
    assert.match(insights, new RegExp(`data-insight-\\$\\{escapeHtml\\(kind\\)\\}`));
    assert.match(insights, new RegExp(`data-insight-\\$\\{escapeHtml\\(kind\\)\\}[\\s\\S]*aria-pressed`));
    assert.match(preferences, new RegExp(`${kind}: "all"`));
    assert.match(phase6m, new RegExp(`${kind}: "all"`));
  }
  assert.match(hybridMcl, /browserGetTicketing\([\s\S]*options/);
  assert.match(hybridMcl, /browserData\?\.metadataComplete !== false/);
  assert.match(hybridMcl, /getWorkerTicketing\([\s\S]*options/);
  assert.match(hybridMcl, /parentSignal\?\.addEventListener/);
  assert.match(hybridMcl, /options\?\.signal\?\.aborted/);
  assert.match(fixture, /phase7aLanguageFilter/);
  for (const adapter of [browserMcl, workerMcl]) {
    assert.match(adapter, /enrichSelectedSessions/);
    assert.match(adapter, /enrichSessionMetadata/);
    assert.match(adapter, /enrichSessionPrice/);
    assert.match(adapter, /REQUEST_BUDGET_MS\s*=\s*13500/);
    assert.match(adapter, /ENRICHMENT_BUDGET_MS\s*=\s*10000/);
    assert.match(adapter, /controller\.abort\("enrichment-deadline"\)/);
    assert.match(adapter, /const results = \[\.\.\.items\]/);
    assert.match(adapter, /metadataComplete/);
    assert.match(adapter, /isSessionInfoPayload/);
    assert.match(adapter, /return \{ session, metadataComplete: false \}/);
    assert.match(adapter, /metadataComplete: hasSessionLanguageMetadata\(enrichedSession\)/);
    assert.match(adapter, /subtitleLanguagePattern/);
    assert.match(adapter, /hasRecognizedSpokenLanguage/);
    assert.match(adapter, /metadataResults\.every\(result => result\?\.metadataComplete === true\)/);
    assert.doesNotMatch(adapter, /(?:selectedSessions|sessions)\s*=\s*await mapLimit\([^\n]*slice\(0, 40\)/);
  }
  assert.match(browserMcl, /mcl-webapi-ticketing:\$\{movieSetId\}:\$\{date \|\| "default"\}:v5/);
  assert.match(browserMcl, /if \(enrichment\.metadataComplete && !signal\?\.aborted\)/);
  assert.match(workerIndex, /result\.metadataComplete[\s\S]*public, max-age=60[\s\S]*no-store/);
});
