import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const app = path.join(root, "app");

function pngSize(relativePath) {
  const bytes = fs.readFileSync(path.join(app, relativePath));
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("manifest exposes installable any and maskable PNG icons", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(app, "manifest.json"), "utf8"));
  assert.ok(Array.isArray(manifest.icons));

  const bySrc = new Map(manifest.icons.map((icon) => [icon.src, icon]));
  assert.deepEqual(bySrc.get("./icons/icon-192.png"), {
    src: "./icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  });
  assert.deepEqual(bySrc.get("./icons/icon-512.png"), {
    src: "./icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  });
  assert.equal(bySrc.get("./icons/icon-maskable-512.png")?.purpose, "maskable");
});

test("committed PNG assets have their declared intrinsic dimensions", () => {
  assert.deepEqual(pngSize("icons/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("icons/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngSize("icons/icon-maskable-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngSize("icons/apple-touch-icon.png"), { width: 180, height: 180 });
});

test("document wires SVG favicon and Apple touch icon", () => {
  const html = fs.readFileSync(path.join(app, "index.html"), "utf8");
  assert.match(html, /rel="icon"[^>]+href="\.\/icons\/icon\.svg"/);
  assert.match(html, /rel="apple-touch-icon"[^>]+sizes="180x180"[^>]+href="\.\/icons\/apple-touch-icon\.png"/);
});

test("icon generator remains deterministic and dependency-free", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "generate-pwa-icons.py"), "utf8");
  assert.match(source, /import zlib/);
  assert.match(source, /"icon-192\.png": 192/);
  assert.match(source, /"icon-512\.png": 512/);
  assert.match(source, /"icon-maskable-512\.png": 512/);
  assert.match(source, /"apple-touch-icon\.png": 180/);
  assert.doesNotMatch(source, /PIL|cairo|numpy/i);
});
