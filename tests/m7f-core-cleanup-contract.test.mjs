import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sharedControls = readFileSync(new URL("../app/shared-final-controls.js", import.meta.url), "utf8");

test("M7F shared final control coalescing remains after the Service Worker optimization is withdrawn", () => {
  assert.match(sharedControls, /let syncQueued = false/);
  assert.match(sharedControls, /function scheduleSync\(\) \{\s+if \(syncQueued\) return;\s+syncQueued = true;/);
  assert.match(sharedControls, /requestAnimationFrame\(\(\) => \{\s+syncQueued = false;\s+syncTabCounts\(\);\s+syncComparison\(\);/);
  assert.match(sharedControls, /observer\.observe\(document\.body, \{ childList: true, subtree: true, characterData: true \}\)/);
});
