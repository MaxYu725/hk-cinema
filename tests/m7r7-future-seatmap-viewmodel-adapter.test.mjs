import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

function registry() {
  const descriptor = Object.freeze({
    id: "hotel",
    displayName: "Hotel Cinema",
    healthLabel: "Hotel",
    capabilities: Object.freeze({
      catalogue: true,
      showtimes: true,
      prices: false,
      seatSummary: false,
      seatMap: true,
      booking: false
    })
  });
  return Object.freeze({
    providers: Object.freeze([descriptor]),
    get(id) {
      return String(id || "").trim().toLowerCase() === "hotel" ? descriptor : null;
    },
    hasCapability(id, capability) {
      return Boolean(this.get(id)?.capabilities?.[capability]);
    }
  });
}

async function loadModels() {
  const window = {
    HKCinemaProviderRegistry: registry(),
    HKCinemaProviders: {
      hotel: {
        seatMapRequest(providerId, session) {
          return {
            supported: true,
            layoutMode: "fixture-grid",
            request: { providerId, sessionId: session.sourceId },
            reason: null
          };
        },
        viewModels: {
          seatMap(data, session) {
            return {
              kind: "seat-map",
              schemaVersion: 1,
              provider: { id: "hotel", label: "Hotel Cinema" },
              sessionId: session.sourceId,
              layoutMode: "fixture-grid",
              sections: data.sections
            };
          }
        }
      }
    }
  };
  const context = vm.createContext({ console, window });
  vm.runInContext(await source("app/view-models.js"), context, { filename: "view-models.js" });
  return { models: window.HKCinemaViewModels, code: await source("app/view-models.js") };
}

test("M7R7 future seat-map provider owns both request and raw ViewModel adapters", async () => {
  const { models } = await loadModels();
  const session = {
    id: "hotel:session-1",
    sourceId: "session-1",
    cinema: { id: "hotel-cinema", name: "Hotel Cinema" },
    house: { id: "hall-1", name: "Hall 1" }
  };

  const showtime = models.showtime("hotel", session);
  assert.equal(showtime.provider.id, "hotel");
  assert.equal(showtime.seatMap.supported, true);
  assert.equal(showtime.seatMap.layoutMode, "fixture-grid");
  assert.deepEqual(
    JSON.parse(JSON.stringify(showtime.seatMap.request)),
    { providerId: "hotel", sessionId: "session-1" }
  );

  const raw = { sections: [{ id: "future-layout" }] };
  const seatMap = models.seatMap("hotel", raw, session);
  assert.equal(seatMap.provider.id, "hotel");
  assert.equal(seatMap.sessionId, "session-1");
  assert.equal(seatMap.layoutMode, "fixture-grid");
  assert.deepEqual(JSON.parse(JSON.stringify(seatMap.sections)), raw.sections);
});

test("M7R7 shared ViewModel owner selects provider adapters by lookup, not provider-name branches", async () => {
  const { code } = await loadModels();
  assert.match(code, /HKCinemaProviders\?\.\[providerId\]\?\.seatMapRequest/);
  assert.match(code, /HKCinemaProviders\?\.\[info\.id\]\?\.viewModels/);
  assert.doesNotMatch(code, /if\s*\(providerId\s*===\s*"(?:broadway|mcl|emperor)"\)/);
});