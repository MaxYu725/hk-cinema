import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createBuildPlan } from "../scripts/build-app.mjs";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function stylesheetReferences(html) {
  return Array.from(
    html.matchAll(/<link\b[^>]*\brel="[^"]*\bstylesheet\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>/g),
    match => match[1]
  );
}

function scriptReferences(html) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g), match => match[1]);
}

function sourcePath(reference) {
  return new URL(reference, "https://bundle.invalid/").pathname.slice(1);
}

test("C6 emits one deterministic production CSS bundle and one JS bundle", async () => {
  const [sourceIndex, builtIndex, manifest] = await Promise.all([
    read("app/index.html"),
    read("dist/index.html"),
    read("dist/asset-manifest.json").then(JSON.parse)
  ]);

  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.version, /^c6-[a-f0-9]{12}$/);
  assert.deepEqual(stylesheetReferences(builtIndex), [`./${manifest.bundles.styles.path}`]);
  assert.deepEqual(scriptReferences(builtIndex), [`./${manifest.bundles.scripts.path}`]);
  assert.deepEqual(
    manifest.bundles.styles.sources,
    stylesheetReferences(sourceIndex).map(sourcePath)
  );
  assert.deepEqual(
    manifest.bundles.scripts.sources,
    scriptReferences(sourceIndex).map(sourcePath)
  );
  assert.ok(manifest.bundles.styles.sources.length > 1);
  assert.ok(manifest.bundles.scripts.sources.length > 1);
});

test("C6 content hashes every production bundle and public icon reference", async () => {
  const manifest = JSON.parse(await read("dist/asset-manifest.json"));
  const [builtIndex, builtManifest, css, js] = await Promise.all([
    read("dist/index.html"),
    read("dist/manifest.json").then(JSON.parse),
    read(`dist/${manifest.bundles.styles.path}`),
    read(`dist/${manifest.bundles.scripts.path}`)
  ]);

  assert.equal(manifest.bundles.styles.path, `assets/app.${digest(css)}.css`);
  assert.equal(manifest.bundles.scripts.path, `assets/app.${digest(js)}.js`);
  assert.match(builtIndex, /href="\.\/manifest\.json\?v=[a-f0-9]{12}"/);
  assert.match(builtIndex, /href="\.\/icons\/apple-touch-icon\.png\?v=[a-f0-9]{12}"/);
  for (const icon of builtManifest.icons) {
    assert.match(icon.src, /^\.\/icons\/.+\?v=[a-f0-9]{12}$/);
  }
});

test("C6 embeds one exact, local-only shell manifest in the production worker", async () => {
  const [manifest, sw] = await Promise.all([
    read("dist/asset-manifest.json").then(JSON.parse),
    read("dist/sw.js")
  ]);

  assert.match(sw, new RegExp(`version: "${manifest.version}"`));
  assert.doesNotMatch(sw, /version: "development"/);
  for (const asset of manifest.shellAssets) {
    assert.match(sw, new RegExp(JSON.stringify(asset).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(asset.startsWith("./"), `${asset} must stay inside the Pages scope`);
    assert.doesNotMatch(asset, /(?:\/api\/|workers\.dev|^https?:)/i);

    const output = asset === "./" ? "index.html" : sourcePath(asset);
    await access(new URL(`dist/${output}`, ROOT));
  }
});

test("C6 Service Worker caches only declared shell assets atomically", async () => {
  const sw = await read("app/sw.js");
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  const navigationBlock = sw.match(/async function networkFirstNavigation[\s\S]*?\n\}/)?.[0] || "";

  assert.match(sw, /function isDeclaredShellAsset\(request\)/);
  assert.match(sw, /SHELL_ASSET_URLS\.has\(url\.href\)/);
  assert.match(sw, /Promise\.all\(SHELL_ASSETS\.map/);
  assert.match(sw, /if \(!response\.ok\) throw new Error/);
  assert.doesNotMatch(sw, /discoverShellAssets|Promise\.allSettled/);
  assert.doesNotMatch(navigationBlock, /cache\.put\(/);
  assert.doesNotMatch(installBlock, /skipWaiting\(/);
  assert.match(sw, /event\.data\?\.type === "SKIP_WAITING"/);
});

test("C6 build planning is repeatable and does not depend on generated output", async () => {
  const [first, second] = await Promise.all([createBuildPlan(), createBuildPlan()]);
  assert.deepEqual(first.assetManifest, second.assetManifest);
  assert.equal(first.index, second.index);
  assert.equal(first.sw, second.sw);
  assert.equal(first.cssBundle, second.cssBundle);
  assert.equal(first.jsBundle, second.jsBundle);
});

test("C6 deployment and browser smoke consume dist instead of raw app sources", async () => {
  const [workflow, playwright, manifest] = await Promise.all([
    read(".github/workflows/pages.yml"),
    read("playwright.config.mjs"),
    read("dist/asset-manifest.json").then(JSON.parse)
  ]);

  assert.match(workflow, /name: Build production app\s+run: npm run build/);
  assert.match(workflow, /path: "\.\/dist"/);
  assert.doesNotMatch(workflow, /path: "\.\/app"/);
  assert.match(playwright, /--directory dist/);

  for (const output of manifest.outputFiles) {
    await access(new URL(`dist/${output}`, ROOT));
  }
  for (const source of [
    manifest.bundles.styles.sources[0],
    manifest.bundles.scripts.sources[0]
  ]) {
    await assert.rejects(access(path.join(new URL("dist/", ROOT).pathname, source)));
  }
});
