import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const TEST_DIR = new URL("./", import.meta.url);
const SELF = "asset-version-contract.test.mjs";
const ASSET_VERSION_LITERAL = /(?:[A-Za-z0-9_./${}-]+)\.(?:js|css)\?v=([A-Za-z0-9._-]+)/g;
const INTENTIONAL_MARKER = "asset-version-contract: intentional";

async function testFiles() {
  return (await readdir(TEST_DIR, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".test.mjs") && entry.name !== SELF)
    .map(entry => entry.name)
    .sort();
}

function normalizeRegexEscapes(line) {
  return String(line || "")
    .replace(/\\+\./g, ".")
    .replace(/\\+\?/g, "?");
}

function versionPins(line) {
  const normalized = normalizeRegexEscapes(line);
  return Array.from(normalized.matchAll(ASSET_VERSION_LITERAL), match => match[0]);
}

test("asset-version scanner recognizes literal, regex-escaped and template cachebuster pins", () => {
  const samples = [
    "seatmap-shared.js?v=7b3-m8a1-1",
    String.raw`/provider-compare-v4\.js\?v=m6c-3-m7r5-1/`,
    String.raw`new RegExp(\`${"${script}"}\\.js\\?v=7b3-m7r3-1\`)`,
    "metro-theme.css?v=m6b-5"
  ];
  assert.deepEqual(
    samples.flatMap(versionPins),
    [
      "seatmap-shared.js?v=7b3-m8a1-1",
      "provider-compare-v4.js?v=m6c-3-m7r5-1",
      "${script}.js?v=7b3-m7r3-1",
      "metro-theme.css?v=m6b-5"
    ]
  );
});

test("historical regression tests do not pin mutable browser asset cachebusters", async () => {
  const findings = [];
  for (const file of await testFiles()) {
    const source = await readFile(new URL(file, TEST_DIR), "utf8");
    const lines = source.split("\n");
    lines.forEach((lineText, index) => {
      if (lineText.includes(INTENTIONAL_MARKER)) return;
      for (const pin of versionPins(lineText)) {
        findings.push(`${file}:${index + 1}: ${pin}`);
      }
    });
  }

  assert.deepEqual(
    findings,
    [],
    `Hard-coded browser asset versions make historical phase tests fail on legitimate cache rotation.\n` +
      `Assert asset identity/load order/behavior instead. If an exact cachebuster is genuinely the contract for a short-lived migration test, add "${INTENTIONAL_MARKER}" on that assertion line.\n\n` +
      findings.join("\n")
  );
});
