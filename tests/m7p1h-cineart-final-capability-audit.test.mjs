import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

test("M7P1H starts only after M7P1G Android installed-PWA acceptance passed", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1h-cineart-final-capability-audit.md");
  assert.match(checkpoint, /M7P1G Android installed-PWA acceptance:\s*\*\*PASS\*\*/i);
  assert.match(checkpoint, /seat-map presentation improvements[\s\S]*deferred/i);
});

test("M7P1H keeps CineArt production booking disabled during reconnaissance", async () => {
  const registry = await source("app/provider-registry.js");
  const cineartBlock = registry.match(/id:\s*"cineart"[\s\S]*?capabilities:\s*\{([\s\S]*?)\}\s*\}\)/)?.[1] || "";
  assert.match(cineartBlock, /catalogue:\s*true/);
  assert.match(cineartBlock, /showtimes:\s*true/);
  assert.match(cineartBlock, /prices:\s*true/);
  assert.match(cineartBlock, /seatSummary:\s*true/);
  assert.match(cineartBlock, /seatMap:\s*true/);
  assert.match(cineartBlock, /booking:\s*false/);
});

test("M7P1H audit is GET-only reconnaissance and requires route plus key evidence before claiming booking", async () => {
  const audit = await source("scripts/m7p1h-cineart-final-capability-audit.mjs");
  assert.match(audit, /method:\s*"GET"/);
  assert.doesNotMatch(audit, /method:\s*"POST"/);
  assert.match(audit, /bookingContractProven:\s*bookingKeyEvidence\.length\s*>\s*0\s*&&\s*bookingRouteEvidence\.length\s*>\s*0/);
  assert.match(audit, /structuredFormatProven:/);
  assert.match(audit, /titleOnlyFormatHints:/);
  assert.doesNotMatch(audit, /MutationObserver|IntersectionObserver/);
});

test("M7P1H does not redesign the shared seat-map runtime", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1h-cineart-final-capability-audit.md");
  assert.match(checkpoint, /no seat-map presentation redesign in this phase/i);
  assert.match(checkpoint, /no PWA\/Service Worker changes/i);
});
