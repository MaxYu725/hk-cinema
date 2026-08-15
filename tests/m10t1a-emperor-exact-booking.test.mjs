import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEmperorSessionBookingUrl } from "../worker/src/providers/emperor.js";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("M10T1A builds an exact Emperor /seat deep link from authoritative session identifiers", () => {
  const bookingUrl = buildEmperorSessionBookingUrl({
    scheduleId: "473045",
    filmUniqueId: "853c29ec0d05",
    cinemaId: "57005",
    cinemaLinkId: "57005"
  });

  assert.ok(bookingUrl);
  const url = new URL(bookingUrl);
  assert.equal(url.origin, "https://www.emperorcinemas.com");
  assert.equal(url.pathname, "/seat");
  assert.equal(url.searchParams.get("cinemaId"), "57005");
  assert.equal(url.searchParams.get("cinemaLinkId"), "57005");
  assert.equal(url.searchParams.get("filmUniqueId"), "853c29ec0d05");
  assert.equal(url.searchParams.get("scheduleId"), "473045");
  assert.equal(url.searchParams.get("wapid"), "ECML_WEB_PROD_S_MPS");
  assert.equal(url.searchParams.has("utm_source"), false);
});

test("M10T1A uses cinemaLinkId as the safe cinemaId fallback when upstream omits cinemaId", () => {
  const bookingUrl = buildEmperorSessionBookingUrl({
    scheduleId: "503011",
    filmUniqueId: "film-abc",
    cinemaLinkId: "57002"
  });
  const url = new URL(bookingUrl);

  assert.equal(url.searchParams.get("cinemaId"), "57002");
  assert.equal(url.searchParams.get("cinemaLinkId"), "57002");
});

test("M10T1A fails closed instead of falling back to a movie-level page when exact session identity is incomplete", () => {
  assert.equal(buildEmperorSessionBookingUrl({
    filmUniqueId: "853c29ec0d05",
    cinemaLinkId: "57005"
  }), null);

  assert.equal(buildEmperorSessionBookingUrl({
    scheduleId: "473045",
    cinemaLinkId: "57005"
  }), null);

  assert.equal(buildEmperorSessionBookingUrl({
    scheduleId: "473045",
    filmUniqueId: "853c29ec0d05"
  }), null);
});

test("M10T1A session normalization owns the exact booking URL while movie-level fallback remains separate", async () => {
  const source = await read("worker/src/providers/emperor.js");
  const normalizeSchedule = source.match(/function normalizeSchedule\(group, schedule\) \{[\s\S]*?\n\}\n\nasync function getScheduleDates/)?.[0] || "";

  assert.match(normalizeSchedule, /bookingUrl:\s*buildEmperorSessionBookingUrl\(/);
  assert.match(normalizeSchedule, /scheduleId,/);
  assert.match(normalizeSchedule, /filmUniqueId,/);
  assert.match(normalizeSchedule, /cinemaId,/);
  assert.match(normalizeSchedule, /cinemaLinkId/);
  assert.doesNotMatch(normalizeSchedule, /\/showtimes\?/);

  const normalizeMovie = source.match(/function normalizeMovie\(movie\) \{[\s\S]*?\n\}\n\nfunction normalizePurchase/)?.[0] || "";
  assert.match(normalizeMovie, /\/showtimes\?wapid=/, "movie-level official action remains a distinct fallback outside session booking");
});
