import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const paths = {
  registry: "app/provider-registry.js",
  comparison: "app/provider-compare-v4.js",
  comparisonCache: "app/provider-compare-main-cache-v3.js",
  viewModels: "app/view-models.js",
  manifest: "worker/src/provider-manifest.js",
  checkpoint: "docs/checkpoints/m7p1a-cineart-provider-reconnaissance.md"
};

test("M7P1A keeps CineArt outside production provider universes", async () => {
  const [registry, manifest] = await Promise.all([
    read(paths.registry),
    read(paths.manifest)
  ]);

  assert.doesNotMatch(registry, /id:\s*["']cineart["']/i);
  assert.doesNotMatch(manifest, /id:\s*["']cineart["']/i);
});

test("M7P1A retains the generic provider extension points required by a fresh CineArt integration", async () => {
  const [comparison, comparisonCache, viewModels] = await Promise.all([
    read(paths.comparison),
    read(paths.comparisonCache),
    read(paths.viewModels)
  ]);

  assert.match(comparison, /HKCinemaProviders\?\.\[provider\]\?\.comparison/);
  assert.match(comparisonCache, /HKCinemaProviders\?\.\[provider\]\?\.comparisonCache/);
  assert.match(viewModels, /HKCinemaProviders\?\.\[providerId\]\?\.seatMapRequest/);
  assert.match(viewModels, /HKCinemaProviders\?\.\[info\.id\]\?\.viewModels/);
});

test("M7P1A checkpoint records staged capabilities and rejects restoration of the old observer-based enrichment", async () => {
  const checkpoint = await read(paths.checkpoint);

  for (const capability of [
    "Catalogue",
    "Showtimes",
    "Detailed ticket prices",
    "Seat summary, strict",
    "Full seat-map source",
    "Booking URL",
    "Language metadata",
    "Subtitle metadata",
    "Format metadata"
  ]) {
    assert.match(checkpoint, new RegExp(`\\| ${capability.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} \\|`));
  }

  assert.match(checkpoint, /do not restore/i);
  assert.match(checkpoint, /cineart-compare-enrichment\.js/);
  assert.match(checkpoint, /Mutation\/Intersection observers/);
  assert.match(checkpoint, /The next permitted change is \*\*M7P1B — CineArt Worker adapter only\*\*/);
});
