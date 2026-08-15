import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const TARGET = new URL(process.env.BESTAR_ORIGIN || "https://www.bestarfilm.hk");
const REPORT_PATH = process.env.BESTAR_BROWSER_RECON_REPORT || "bestar-browser-reconnaissance.json";
const NAVIGATION_TIMEOUT_MS = 20_000;
const SETTLE_MS = 6_000;
const MAX_EVENTS = 160;
const MAX_SYNC_BODIES = 12;
const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;
const SAFE_OPERATION_KEYS = new Set([
  "action",
  "apiname",
  "method",
  "module",
  "operation",
  "scene",
  "service",
  "wapid"
]);

function baseDomain(hostname) {
  return String(hostname || "").replace(/^www\./i, "").toLowerCase();
}

function evidenceHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  const current = baseDomain(TARGET.hostname);
  return host === current || host.endsWith(`.${current}`) || host === "icirena.ai" || host.endsWith(".icirena.ai");
}

function safeRequestUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const queryKeys = Array.from(new Set(Array.from(url.searchParams.keys()))).sort().slice(0, 40);
    const wapid = url.searchParams.get("wapid");
    return {
      origin: url.origin,
      pathname: url.pathname,
      queryKeys,
      wapid: /^[A-Za-z0-9_-]{1,80}$/.test(wapid || "") ? wapid : null
    };
  } catch {
    return { origin: null, pathname: null, queryKeys: [], wapid: null };
  }
}

function structuralKeys(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.slice(0, 3).flatMap(item => structuralKeys(item, depth + 1));
  }
  if (typeof value !== "object") return [];
  const keys = [];
  for (const [key, child] of Object.entries(value)) {
    keys.push(`${depth}:${key}`);
    keys.push(...structuralKeys(child, depth + 1));
  }
  return Array.from(new Set(keys)).slice(0, 120);
}

function operationHints(value, depth = 0, output = []) {
  if (depth > 4 || value === null || value === undefined || output.length >= 40) return output;
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach(item => operationHints(item, depth + 1, output));
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (SAFE_OPERATION_KEYS.has(normalizedKey) && typeof child === "string" && /^[A-Za-z0-9_./:-]{1,100}$/.test(child)) {
      output.push({ key, value: child });
    }
    operationHints(child, depth + 1, output);
    if (output.length >= 40) break;
  }
  return output;
}

function jsonShape(value, depth = 0) {
  if (depth > 3) return { type: Array.isArray(value) ? "array" : typeof value };
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.length ? jsonShape(value[0], depth + 1) : null
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 30);
    return {
      type: "object",
      keys: entries.map(([key]) => key),
      children: Object.fromEntries(entries.map(([key, child]) => [key, jsonShape(child, depth + 1)]))
    };
  }
  return { type: typeof value };
}

function requestEvidence(request) {
  const safeUrl = safeRequestUrl(request.url());
  let parsedBody = null;
  try {
    parsedBody = request.postDataJSON();
  } catch {
    parsedBody = null;
  }
  return {
    method: request.method(),
    resourceType: request.resourceType(),
    ...safeUrl,
    bodyKeys: parsedBody ? structuralKeys(parsedBody) : [],
    operationHints: parsedBody ? operationHints(parsedBody) : []
  };
}

async function responseEvidence(response, syncBodiesRead) {
  const request = response.request();
  const safeUrl = safeRequestUrl(response.url());
  const headers = response.headers();
  const contentType = headers["content-type"] || null;
  const contentLength = Number(headers["content-length"] || "");
  const item = {
    method: request.method(),
    status: response.status(),
    resourceType: request.resourceType(),
    ...safeUrl,
    contentType,
    contentLength: Number.isFinite(contentLength) ? contentLength : null,
    jsonShape: null
  };

  const mayReadSyncBody =
    syncBodiesRead.count < MAX_SYNC_BODIES &&
    /\/sync\/?$/i.test(safeUrl.pathname || "") &&
    /json/i.test(contentType || "") &&
    (!Number.isFinite(contentLength) || contentLength <= MAX_RESPONSE_BODY_BYTES);

  if (!mayReadSyncBody) return item;

  try {
    const body = await response.body();
    syncBodiesRead.count += 1;
    if (body.byteLength > MAX_RESPONSE_BODY_BYTES) return item;
    const parsed = JSON.parse(body.toString("utf8"));
    item.jsonShape = jsonShape(parsed);
  } catch {
    // A response can be opaque, streamed or non-JSON despite its content type.
  }
  return item;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-HK",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const requests = [];
  const responses = [];
  const pageErrors = [];
  const syncBodiesRead = { count: 0 };

  page.on("request", request => {
    if (requests.length >= MAX_EVENTS) return;
    try {
      const url = new URL(request.url());
      if (!evidenceHost(url.hostname)) return;
      requests.push(requestEvidence(request));
    } catch {
      // Ignore malformed request URLs.
    }
  });

  page.on("response", async response => {
    if (responses.length >= MAX_EVENTS) return;
    try {
      const url = new URL(response.url());
      if (!evidenceHost(url.hostname)) return;
      responses.push(await responseEvidence(response, syncBodiesRead));
    } catch {
      // Ignore malformed or unreadable responses.
    }
  });

  page.on("pageerror", error => {
    if (pageErrors.length < 20) pageErrors.push(String(error?.message || error).slice(0, 240));
  });

  let navigation = null;
  try {
    const response = await page.goto(TARGET.toString(), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    navigation = {
      ok: Boolean(response?.ok()),
      status: response?.status() ?? null,
      finalUrl: safeRequestUrl(page.url())
    };
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    navigation = {
      ok: false,
      status: null,
      finalUrl: safeRequestUrl(page.url()),
      error: String(error?.message || error).slice(0, 240)
    };
  }

  await page.waitForTimeout(250);
  const report = {
    phase: "M10A",
    providerCandidate: "bestar",
    mode: "passive-browser-network-reconnaissance",
    generatedAt: new Date().toISOString(),
    targetOrigin: TARGET.origin,
    limits: {
      navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
      settleMs: SETTLE_MS,
      maxEvents: MAX_EVENTS,
      maxSyncBodies: MAX_SYNC_BODIES,
      maxResponseBodyBytes: MAX_RESPONSE_BODY_BYTES
    },
    boundary: {
      noClicks: true,
      noForms: true,
      noAuthentication: true,
      noCustomApiMutationRequests: true,
      requestBodiesStored: false,
      headersStored: false,
      cookiesStored: false,
      responseValuesStored: false
    },
    navigation,
    summary: {
      requests: requests.length,
      responses: responses.length,
      syncRequests: requests.filter(item => /\/sync\/?$/i.test(item.pathname || "")).length,
      observedMethods: Array.from(new Set(requests.map(item => item.method))).sort(),
      observedApiOrigins: Array.from(new Set(requests.filter(item => /icirena\.ai$/i.test(new URL(item.origin).hostname)).map(item => item.origin))).sort(),
      pageErrors: pageErrors.length
    },
    requests,
    responses,
    pageErrors
  };

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));

  await context.close();
  await browser.close();
}

await main();
