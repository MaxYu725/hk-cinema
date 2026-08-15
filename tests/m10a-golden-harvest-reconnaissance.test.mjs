import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("M10A keeps Golden Harvest outside production browser and Worker provider universes", async () => {
  const registry = await read("app/provider-registry.js");
  const manifest = await read("worker/src/provider-manifest.js");

  assert.doesNotMatch(registry, /id:\s*["'](?:golden[-_ ]?harvest|gh)["']/i);
  assert.doesNotMatch(manifest, /id:\s*["'](?:golden[-_ ]?harvest|gh)["']/i);
  assert.match(registry, /id:\s*"cineart"/);
  assert.match(manifest, /id:\s*"cineart"/);
});

test("M10A probe is bounded, GET-only and restricted to public reconnaissance", async () => {
  const source = await read("scripts/m10a-golden-harvest-reconnaissance.mjs");

  assert.match(source, /REQUEST_TIMEOUT_MS\s*=\s*12_000/);
  assert.match(source, /MAX_HTML_BYTES\s*=\s*2 \* 1024 \* 1024/);
  assert.match(source, /MAX_SCRIPT_BYTES\s*=\s*768 \* 1024/);
  assert.match(source, /MAX_SCRIPT_TOTAL_BYTES\s*=\s*6 \* 1024 \* 1024/);
  assert.match(source, /MAX_SCRIPTS\s*=\s*16/);
  assert.match(source, /method:\s*"GET"/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(source, /Authorization|Bearer|csrf|xsrf|document\.cookie|Cookie:/i);
  assert.match(source, /trustedGoldenHarvestHost/);
  assert.match(source, /url\.protocol !== "https:"/);
  assert.match(source, /bounded reconnaissance payload limit/);
  assert.match(source, /productionRegistryChanged:\s*false/);
  assert.match(source, /workerManifestChanged:\s*false/);
  assert.match(source, /productionRouteAdded:\s*false/);
  assert.match(source, /pwaChanged:\s*false/);
});

test("M10A report stores structural evidence rather than raw upstream documents", async () => {
  const source = await read("scripts/m10a-golden-harvest-reconnaissance.mjs");

  assert.match(source, /hash:\s*sha256\(text\)/);
  assert.match(source, /safeTitle/);
  assert.match(source, /discoveredCandidates/);
  assert.match(source, /sameGoldenHarvestHostCandidates/);
  assert.doesNotMatch(source, /report\s*=\s*\{[\s\S]*?\btext\s*[,}]/, "raw page/script bodies must not be written into the report object");
});

test("M10A workflow is read-only and only publishes the bounded reconnaissance artifact", async () => {
  const workflow = await read(".github/workflows/golden-harvest-reconnaissance.yml");

  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /node --test tests\/m10a-golden-harvest-reconnaissance\.test\.mjs/);
  assert.match(workflow, /node --check scripts\/m10a-golden-harvest-reconnaissance\.mjs/);
  assert.match(workflow, /node scripts\/m10a-golden-harvest-reconnaissance\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /wrangler|deploy|pages|secrets\./i);
});

test("M10A checkpoint permits only a later Worker-only adapter after current-source proof", async () => {
  const checkpoint = await read("docs/checkpoints/m10a-golden-harvest-provider-reconnaissance.md");

  assert.match(checkpoint, /reconnaissance only/i);
  assert.match(checkpoint, /M10B[^\n]*Worker adapter only/i);
  assert.match(checkpoint, /不註冊|not register/i);
  assert.match(checkpoint, /不改[^\n]*PWA|no PWA/i);
});
