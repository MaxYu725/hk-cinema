import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createBuildPlan } from "../scripts/build-app.mjs";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

function localReferences(html) {
  return Array.from(
    html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g),
    match => match[1]
  );
}

test("C7 source graph uses stable local paths without manual asset versions", async () => {
  const index = await read("app/index.html");
  const references = localReferences(index);

  assert.ok(references.length > 2);
  assert.deepEqual(
    references.filter(reference => new URL(reference, "https://source.invalid/").search),
    []
  );
  assert.doesNotMatch(index, /(?:src|href)=["'][^"']+\?v=/);
});

test("C7 production build remains the only browser asset identity owner", async () => {
  const plan = await createBuildPlan();

  assert.match(plan.assetManifest.version, /^c6-[a-f0-9]{12}$/);
  assert.match(plan.cssPath, /^assets\/app\.[a-f0-9]{12}\.css$/);
  assert.match(plan.jsPath, /^assets\/app\.[a-f0-9]{12}\.js$/);
  assert.match(plan.index, /href="\.\/manifest\.json\?v=[a-f0-9]{12}"/);
  assert.match(plan.index, /href="\.\/icons\/icon\.svg\?v=[a-f0-9]{12}"/);
  assert.deepEqual(
    plan.assetManifest.shellAssets.filter(asset => /\.(?:css|js)(?:\?|$)/.test(asset)),
    [`./${plan.cssPath}`, `./${plan.jsPath}`]
  );
});

test("C7 preserves every ordered source in the generated bundles", async () => {
  const plan = await createBuildPlan();
  const sourceIndex = await read("app/index.html");

  assert.ok(plan.assetManifest.bundles.styles.sources.length > 1);
  assert.ok(plan.assetManifest.bundles.scripts.sources.length > 1);
  for (const source of [
    ...plan.assetManifest.bundles.styles.sources,
    ...plan.assetManifest.bundles.scripts.sources
  ]) {
    assert.ok(sourceIndex.includes(`./${source}`), `${source} must remain in the ordered source graph`);
  }
});
