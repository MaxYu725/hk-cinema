import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, manifestText, sw] = await Promise.all([
  read("app/index.html"),
  read("app/manifest.json"),
  read("app/sw.js")
]);
const manifest = JSON.parse(manifestText);

test("Metro is the production default while Classic remains an explicit fallback", () => {
  assert.match(index, /<html lang="zh-HK" data-skin="metro">/);
  assert.match(index, /const resolved = skin === "classic" \? "classic" : "metro"/);
  assert.match(index, /applySkin\(new URLSearchParams\(window\.location\.search\)\.get\("skin"\)\)/);
  assert.match(index, /resolved === "classic" \? "#17191d" : "#000000"/);
});

test("PWA install metadata now matches the Metro shell", () => {
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.background_color, "#000000");
  assert.equal(manifest.theme_color, "#000000");
  assert.match(index, /manifest\.json\?v=m5-1/);
});

test("M5 rotates the controlled shell cache without restoring automatic activation", () => {
  assert.match(sw, /CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}m5-1`/);
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
  assert.match(sw, /event\.data\?\.type\s*===\s*"SKIP_WAITING"/);
});
