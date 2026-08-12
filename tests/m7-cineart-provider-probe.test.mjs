import test from "node:test";
import assert from "node:assert/strict";
import {
  CINEART_PROBE_CONFIG,
  probeCineArt
} from "../worker/src/providers/cineart-probe.js";
import {
  CANDIDATE_PROVIDERS,
  PROBEABLE_PROVIDERS,
  SUPPORTED_PROVIDERS,
  createProviderProbeRunner
} from "../worker/src/provider-probe.js";

const CURRENT_SITE_HTML = `<!doctype html>
<html lang="zh-HK">
  <body>
    <footer>
      <h2>影藝戲院客戶服務熱線</h2>
      <p>青衣城 (2312-2600)</p>
      <p>翡翠明珠 (2396-6614)</p>
      <p>MegaBox (3547-2118)</p>
      <p>荷里活 (3547-2781)</p>
      <p>新港城中心 (2633-5305)</p>
      <script src="/_next/static/chunks/app.js"></script>
    </footer>
  </body>
</html>`;

function htmlResponse(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

test("M7A recognizes the current CineArt site shell and cinema directory", async () => {
  let requestedUrl = null;
  let requestedOptions = null;
  const result = await probeCineArt({
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedOptions = options;
      return htmlResponse(CURRENT_SITE_HTML);
    }
  });

  assert.equal(requestedUrl, CINEART_PROBE_CONFIG.url);
  assert.equal(requestedOptions.cache, "no-store");
  assert.equal(requestedOptions.method, "GET");
  assert.equal(result.evidence, "site-shell-cinema-directory");
  assert.equal(result.source, "cinearthouse-hk");
  assert.equal(result.cinemaCount, 5);
  assert.deepEqual(result.cinemas, [
    "maritime-square",
    "jp",
    "megabox",
    "hollywood",
    "mostown"
  ]);
  assert.equal(result.nextJsDetected, true);
  assert.ok(result.bytesRead > 0);
  assert.equal(result.stoppedEarly, true);
});

test("M7A rejects a reachable page that is not structurally identifiable as current CineArt", async () => {
  await assert.rejects(
    () => probeCineArt({
      fetchImpl: async () => htmlResponse("<html><body>generic holding page</body></html>")
    }),
    error => {
      assert.equal(error.code, "PROBE_INVALID_PAYLOAD");
      return true;
    }
  );
});

test("M7A rejects an oversized CineArt stream before unbounded buffering", async () => {
  await assert.rejects(
    () => probeCineArt({
      maxBytes: 32 * 1024,
      fetchImpl: async () => htmlResponse("x".repeat(64 * 1024))
    }),
    error => {
      assert.equal(error.code, "PROBE_PAYLOAD_TOO_LARGE");
      return true;
    }
  );
});

test("M7A makes CineArt individually probeable without adding it to production probeAll", async () => {
  assert.deepEqual(SUPPORTED_PROVIDERS, ["broadway", "mcl", "emperor"]);
  assert.deepEqual(CANDIDATE_PROVIDERS, ["cineart"]);
  assert.deepEqual(PROBEABLE_PROVIDERS, ["broadway", "mcl", "emperor", "cineart"]);

  const runner = createProviderProbeRunner({
    cineartProbe: async () => ({
      evidence: "site-shell-cinema-directory",
      source: "cinearthouse-hk",
      cinemaCount: 5,
      cinemas: ["maritime-square", "jp", "megabox", "hollywood", "mostown"]
    }),
    clock: (() => {
      let now = Date.parse("2026-08-12T09:40:00Z");
      return () => (now += 7);
    })()
  });

  const result = await runner.probeProvider("cineart");
  assert.equal(result.healthy, true);
  assert.equal(result.provider, "cineart");
  assert.equal(result.evidence.cinemaCount, 5);
});

test("M7A classifies oversized candidate payloads separately", async () => {
  const tooLarge = new Error("too large");
  tooLarge.code = "PROBE_PAYLOAD_TOO_LARGE";

  const runner = createProviderProbeRunner({
    cineartProbe: async () => { throw tooLarge; },
    clock: (() => {
      let now = Date.parse("2026-08-12T09:40:00Z");
      return () => (now += 7);
    })()
  });

  const result = await runner.probeProvider("cineart");
  assert.equal(result.healthy, false);
  assert.deepEqual(result.failure, {
    category: "payload_too_large",
    code: "PROBE_PAYLOAD_TOO_LARGE",
    status: null
  });
});
