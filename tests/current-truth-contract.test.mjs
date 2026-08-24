import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/src/index.js";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("canonical project documents describe the current four-provider runtime", async () => {
  const [readme, architecture, matrix] = await Promise.all([
    read("README.md"),
    read("docs/architecture.md"),
    read("docs/provider-matrix.md")
  ]);

  for (const provider of ["Broadway", "MCL", "Emperor", "CineArt"]) {
    assert.match(readme, new RegExp(provider, "i"));
    assert.match(matrix, new RegExp(provider, "i"));
  }

  assert.match(readme, /docs\/architecture\.md/);
  assert.match(readme, /docs\/provider-matrix\.md/);
  assert.match(architecture, /DOM text must no longer be a business-data input/);
  assert.match(architecture, /normal Hong Kong network/i);
  assert.match(matrix, /VPN\/proxy/i);
});

test("Worker health exposes a versioned schema and Cloudflare deployment identity", async () => {
  const env = {
    CF_VERSION_METADATA: {
      id: "worker-version-123",
      tag: "cleanup-c1",
      timestamp: "2026-08-23T12:00:00.000Z"
    }
  };
  const response = await worker.fetch(
    new Request("https://hk-cinema.test/health"),
    env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.phase, "6G");
  assert.deepEqual(payload.deployment, {
    versionId: "worker-version-123",
    versionTag: "cleanup-c1",
    createdAt: "2026-08-23T12:00:00.000Z"
  });
  assert.deepEqual(Object.keys(payload.providers).sort(), [
    "broadway",
    "cineart",
    "emperor",
    "mcl"
  ]);
});

test("Worker health remains deterministic when version metadata is unavailable locally", async () => {
  const response = await worker.fetch(new Request("https://hk-cinema.test/health"));
  const payload = await response.json();

  assert.deepEqual(payload.deployment, {
    versionId: null,
    versionTag: null,
    createdAt: null
  });
});

test("Wrangler declares the Cloudflare version metadata binding", async () => {
  const config = JSON.parse(await read("worker/wrangler.jsonc"));
  assert.equal(config.version_metadata?.binding, "CF_VERSION_METADATA");
});

test("obsolete PWA manifest template is no longer repository state", async () => {
  await assert.rejects(access(new URL("app/manifest-9c2.template.json", ROOT)));
});
