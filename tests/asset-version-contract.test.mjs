import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const TEST_DIR = new URL("./", import.meta.url);
const SELF = "asset-version-contract.test.mjs";
const ASSET_VERSION_LITERAL = /(?:[A-Za-z0-9_./-]+\.(?:js|css))\\?v=([A-Za-z0-9._-]+)/g;
const INTENTIONAL_MARKER = "asset-version-contract: intentional";

async function testFiles() {
  return (await readdir(TEST_DIR, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".test.mjs") && entry.name !== SELF)
    .map(entry => entry.name)
    .sort();
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

test("historical regression tests do not pin mutable browser asset cachebusters", async () => {
  const findings = [];
  for (const file of await testFiles()) {
    const source = await readFile(new URL(file, TEST_DIR), "utf8");
    for (const match of source.matchAll(ASSET_VERSION_LITERAL)) {
      const line = lineNumber(source, match.index ?? 0);
      const lineText = source.split("\n")[line - 1] || "";
      if (lineText.includes(INTENTIONAL_MARKER)) continue;
      findings.push(`${file}:${line}: ${match[0]}`);
    }
  }

  assert.deepEqual(
    findings,
    [],
    `Hard-coded browser asset versions make historical phase tests fail on legitimate cache rotation.\n` +
      `Assert asset identity/load order/behavior instead. If an exact cachebuster is genuinely the contract for a short-lived migration test, add "${INTENTIONAL_MARKER}" on that assertion line.\n\n` +
      findings.join("\n")
  );
});
