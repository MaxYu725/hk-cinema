import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("M10A keeps both legacy Golden Harvest and current Bestar outside production provider universes", async () => {
  const registry = await read("app/provider-registry.js");
  const manifest = await read("worker/src/provider-manifest.js");
  const candidateId = /id:\s*["'](?:golden[-_ ]?harvest|gh|bestar|bestarfilm)["']/i;

  assert.doesNotMatch(registry, candidateId);
  assert.doesNotMatch(manifest, candidateId);
  assert.match(registry, /id:\s*"cineart"/);
  assert.match(manifest, /id:\s*"cineart"/);
});

test("M10A targets the current Bestar official support origin and retains legacy GH DNS evidence only", async () => {
  const source = await read("scripts/m10a-golden-harvest-reconnaissance.mjs");

  assert.match(source, /BESTAR_ORIGIN \|\| "https:\/\/www\.bestarfilm\.hk"/);
  assert.match(source, /LEGACY_GOLDEN_HARVEST_HOSTS/);
  assert.match(source, /"www\.goldenharvest\.com"/);
  assert.match(source, /"goldenharvest\.com"/);
  assert.match(source, /providerCandidate:\s*"bestar"/);
  assert.match(source, /predecessor:\s*"golden-harvest-hong-kong"/);
  assert.match(source, /successor-reconnaissance-only/);
});

test("M10A probe is bounded, GET-only and restricted to public reconnaissance", async () => {
  const source = await read("scripts/m10a-golden-harvest-reconnaissance.mjs");

  assert.match(source, /REQUEST_TIMEOUT_MS\s*=\s*12_000/);
  assert.match(source, /MAX_DOCUMENT_BYTES\s*=\s*2 \* 1024 \* 1024/);
  assert.match(source, /MAX_SCRIPT_BYTES\s*=\s*768 \* 1024/);
  assert.match(source, /MAX_SCRIPT_TOTAL_BYTES\s*=\s*6 \* 1024 \* 1024/);
  assert.match(source, /MAX_SCRIPTS\s*=\s*16/);
  assert.match(source, /method:\s*"GET"/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(source, /Authorization|Bearer|csrf|xsrf|document\.cookie|Cookie:/i);
  assert.match(source, /trustedCurrentHost/);
  assert.match(source, /url\.protocol !== "https:"/);
  assert.match(source, /bounded reconnaissance payload limit/);
  assert.match(source, /productionRegistryChanged:\s*false/);
  assert.match(source, /workerManifestChanged:\s*false/);
  assert.match(source, /productionRouteAdded:\s*false/);
  assert.match(source, /pwaChanged:\s*false/);
});

test("M10A follows only the Bestar page's explicitly declared icirena vendor bundles", async () => {
  const source = await read("scripts/m10a-golden-harvest-reconnaissance.mjs");

  assert.match(source, /function trustedDeclaredVendorScript\(url\)/);
  assert.match(source, /url\.hostname\.toLowerCase\(\) === "g\.alicdn\.com"/);
  assert.match(source, /url\.pathname\.startsWith\("\/icirena-fe\/icirena-web\/"\)/);
  assert.match(source, /fetchable: trustedCurrentHost\(url\.hostname\) \|\| trustedDeclaredVendorScript\(url\)/);
  assert.doesNotMatch(source, /assets\.alicdn\.com/);
  assert.doesNotMatch(source, /fetchText\([^\n]*api\.icirena\.ai/i, "static reconnaissance must discover API routes before custom API probing");
});

test("M10A passive browser capture performs no user action and stores network structure only", async () => {
  const source = await read("scripts/m10a-bestar-browser-reconnaissance.mjs");

  assert.doesNotThrow(() => new Function(source.replace(/^import .*?;$/gm, "").replace(/await main\(\);?\s*$/m, "")));
  assert.match(source, /page\.goto\(TARGET\.toString\(\)/);
  assert.match(source, /SETTLE_MS\s*=\s*6_000/);
  assert.match(source, /MAX_EVENTS\s*=\s*160/);
  assert.match(source, /MAX_RESPONSE_BODY_BYTES\s*=\s*1024 \* 1024/);
  assert.match(source, /host === "icirena\.ai" \|\| host\.endsWith\("\.icirena\.ai"\)/);
  assert.doesNotMatch(source, /\.click\s*\(|\.fill\s*\(|\.type\s*\(|\.press\s*\(/, "passive reconnaissance must not interact with the site");
  assert.doesNotMatch(source, /context\.addCookies|storageState|Authorization|Bearer/i);
  assert.match(source, /requestBodiesStored:\s*false/);
  assert.match(source, /headersStored:\s*false/);
  assert.match(source, /cookiesStored:\s*false/);
  assert.match(source, /responseValuesStored:\s*false/);
  assert.match(source, /bodyKeys:/);
  assert.match(source, /operationHints:/);
  assert.match(source, /jsonShape:/);
});

test("M10A report stores structural evidence rather than raw upstream documents", async () => {
  const source = await read("scripts/m10a-golden-harvest-reconnaissance.mjs");

  assert.match(source, /hash:\s*sha256\(text\)/);
  assert.match(source, /safeTitle/);
  assert.match(source, /declaredScripts/);
  assert.match(source, /discoveredCandidates/);
  assert.match(source, /sameBestarHostCandidates/);
  assert.doesNotMatch(source, /report\s*=\s*\{[\s\S]*?\btext\s*[,}]/, "raw document/script bodies must not be written into the report object");
});

test("M10A workflow is read-only and publishes both bounded Bestar reconnaissance reports", async () => {
  const workflow = await read(".github/workflows/golden-harvest-reconnaissance.yml");

  assert.match(workflow, /name:\s*Bestar Successor Reconnaissance/);
  assert.match(workflow, /default:\s*https:\/\/www\.bestarfilm\.hk/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /npm install/);
  assert.match(workflow, /node --test tests\/m10a-golden-harvest-reconnaissance\.test\.mjs/);
  assert.match(workflow, /node --check scripts\/m10a-bestar-browser-reconnaissance\.mjs/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /node scripts\/m10a-bestar-browser-reconnaissance\.mjs/);
  assert.match(workflow, /bestar-browser-reconnaissance\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /wrangler|deploy|pages|secrets\./i);
});

test("M10A checkpoint permits only a later Bestar Worker catalogue adapter after current-source proof", async () => {
  const checkpoint = await read("docs/checkpoints/m10a-golden-harvest-provider-reconnaissance.md");

  assert.match(checkpoint, /successor reconnaissance/i);
  assert.match(checkpoint, /M10B[^\n]*Bestar Worker catalogue adapter/i);
  assert.match(checkpoint, /does \*\*not register\*\* Bestar/i);
  assert.match(checkpoint, /adds no:[\s\S]*?PWA or Service Worker change/i);
});
