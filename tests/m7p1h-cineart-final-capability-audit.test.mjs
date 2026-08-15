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

test("M7P1H records that CineArt booking was disabled at that checkpoint while the current Registry may advance later", async () => {
  const [checkpoint, registry] = await Promise.all([
    source("docs/checkpoints/m7p1h-cineart-final-capability-audit.md"),
    source("app/provider-registry.js")
  ]);
  assert.match(checkpoint, /booking:\s*false/i);
  const cineartBlock = registry.match(/id:\s*"cineart"[\s\S]*?capabilities:\s*\{([\s\S]*?)\}\s*\}\)/)?.[1] || "";
  assert.match(cineartBlock, /catalogue:\s*true/);
  assert.match(cineartBlock, /showtimes:\s*true/);
  assert.match(cineartBlock, /prices:\s*true/);
  assert.match(cineartBlock, /seatSummary:\s*true/);
  assert.match(cineartBlock, /seatMap:\s*true/);
  assert.match(cineartBlock, /booking:\s*true/);
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

test("M7P1H defers the shared seat-map display redesign until CineArt completion", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1h-cineart-final-capability-audit.md");
  assert.match(checkpoint, /separate display-only phase/i);
  assert.match(checkpoint, /begins only after this CineArt final-capability checkpoint is merged/i);
  assert.match(checkpoint, /no PWA\/Service Worker file changes/i);
});
