import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { writeFile } from "node:fs/promises";

const CURRENT_ORIGIN = new URL(process.env.BESTAR_ORIGIN || "https://www.bestarfilm.hk");
const LEGACY_GOLDEN_HARVEST_HOSTS = Object.freeze([
  "www.goldenharvest.com",
  "goldenharvest.com"
]);
const REPORT_PATH = process.env.BESTAR_RECON_REPORT || process.env.GOLDEN_HARVEST_RECON_REPORT || "golden-harvest-reconnaissance.json";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_SCRIPT_BYTES = 768 * 1024;
const MAX_SCRIPT_TOTAL_BYTES = 6 * 1024 * 1024;
const MAX_SCRIPTS = 16;
const MAX_CANDIDATES = 120;
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const SEED_PATHS = Object.freeze([
  "/",
  "/robots.txt",
  "/sitemap.xml"
]);

const DISCOVERY_TERMS = /(api|ajax|film|movie|cinema|theatre|theater|show|session|schedule|ticket|seat|programme|program|wapid)/i;
const STATIC_ASSET = /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map)(?:[?#]|$)/i;
const REQUEST_HINTS = Object.freeze([
  ["fetch", /\bfetch\s*\(/g],
  ["axios", /\baxios(?:\.|\s*\()/g],
  ["jquery-ajax", /\$\.ajax\s*\(/g],
  ["jquery-get", /\$\.get(?:JSON)?\s*\(/g],
  ["xhr", /XMLHttpRequest/g]
]);

function currentBaseDomain() {
  return CURRENT_ORIGIN.hostname.replace(/^www\./i, "").toLowerCase();
}

function trustedCurrentHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  const base = currentBaseDomain();
  return host === base || host.endsWith(`.${base}`);
}

function trustedDeclaredVendorScript(url) {
  return url.hostname.toLowerCase() === "g.alicdn.com" &&
    url.pathname.startsWith("/icirena-fe/icirena-web/");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return compactWhitespace(match?.[1] || "").slice(0, 160) || null;
}

function safeErrorDetails(error) {
  if (error?.name === "AbortError") {
    return { error: "timeout", errorName: "AbortError", errorCode: null, errorCause: null };
  }
  const cause = error?.cause;
  const causeText = compactWhitespace(cause?.message || cause?.name || "").slice(0, 220) || null;
  return {
    error: compactWhitespace(error?.message || String(error || "fetch failed")).slice(0, 220) || "fetch failed",
    errorName: error?.name || null,
    errorCode: cause?.code || error?.code || null,
    errorCause: causeText
  };
}

async function dnsEvidence(hostname) {
  try {
    const answers = await lookup(hostname, { all: true });
    return {
      hostname,
      ok: answers.length > 0,
      addresses: answers.slice(0, 8).map(answer => ({ family: answer.family, address: answer.address })),
      error: null,
      errorCode: null
    };
  } catch (error) {
    const details = safeErrorDetails(error);
    return { hostname, ok: false, addresses: [], error: details.error, errorCode: details.errorCode };
  }
}

async function readBoundedResponse(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`payload exceeds ${maxBytes} bytes`);
    return new TextDecoder().decode(bytes);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("bounded reconnaissance payload limit");
      throw new Error(`payload exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchText(url, maxBytes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/javascript,text/javascript,application/json,text/plain,application/xml;q=0.9,*/*;q=0.7",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": BROWSER_USER_AGENT
      },
      signal: controller.signal
    });
    const text = await readBoundedResponse(response, maxBytes);
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || null,
      elapsedMs: Date.now() - startedAt,
      bytes: Buffer.byteLength(text),
      hash: sha256(text),
      text,
      error: null,
      errorName: null,
      errorCode: null,
      errorCause: null
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: String(url),
      contentType: null,
      elapsedMs: Date.now() - startedAt,
      bytes: 0,
      hash: null,
      text: "",
      ...safeErrorDetails(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function scriptInventory(html, baseUrl) {
  const inventory = [];
  const seen = new Set();
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html)) && inventory.length < MAX_SCRIPTS * 2) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.protocol !== "https:") continue;
      url.hash = "";
      const value = url.toString();
      if (seen.has(value)) continue;
      seen.add(value);
      inventory.push({
        url: value,
        host: url.hostname,
        fetchable: trustedCurrentHost(url.hostname) || trustedDeclaredVendorScript(url)
      });
    } catch {
      // Ignore malformed script URLs from source markup.
    }
  }
  return inventory;
}

function normalizeCandidate(raw, baseUrl) {
  const value = String(raw || "").replace(/\\\//g, "/").trim();
  if (!value || value.length > 240 || !DISCOVERY_TERMS.test(value) || STATIC_ASSET.test(value)) return null;
  if (/^(?:data:|javascript:|mailto:|tel:|#)/i.test(value)) return null;

  try {
    const url = new URL(value, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return trustedCurrentHost(url.hostname)
      ? `${url.origin}${url.pathname}${url.search}`
      : value.slice(0, 240);
  } catch {
    return value.slice(0, 240);
  }
}

function discoverCandidates(text, baseUrl, source) {
  const found = [];
  const seen = new Set();
  const patterns = [
    /https?:\\?\/\\?\/[^"'`\s<>\\]{3,220}/gi,
    /["'`](\/(?:[^"'`\s<>\\]|\\.){2,220})["'`]/g
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) && found.length < MAX_CANDIDATES) {
      const normalized = normalizeCandidate(match[1] || match[0], baseUrl);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      found.push({ source, candidate: normalized });
    }
  }
  return found;
}

function requestHints(text) {
  return Object.fromEntries(REQUEST_HINTS.map(([name, pattern]) => {
    pattern.lastIndex = 0;
    let count = 0;
    while (pattern.exec(text) && count < 999) count += 1;
    return [name, count];
  }));
}

function mergeCandidates(collections) {
  const seen = new Set();
  const merged = [];
  for (const items of collections) {
    for (const item of items) {
      const key = `${item.source}|${item.candidate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= MAX_CANDIDATES) return merged;
    }
  }
  return merged;
}

function reportFetchResult(result) {
  return {
    ok: result.ok,
    status: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    elapsedMs: result.elapsedMs,
    bytes: result.bytes,
    hash: result.hash,
    error: result.error,
    errorName: result.errorName,
    errorCode: result.errorCode,
    errorCause: result.errorCause
  };
}

async function main() {
  const currentDns = await dnsEvidence(CURRENT_ORIGIN.hostname);
  const legacyGoldenHarvestDns = await Promise.all(LEGACY_GOLDEN_HARVEST_HOSTS.map(dnsEvidence));
  const documents = [];
  const documentBodies = [];
  const scriptMap = new Map();

  for (const path of SEED_PATHS) {
    const requestedUrl = new URL(path, CURRENT_ORIGIN).toString();
    const result = await fetchText(requestedUrl, MAX_DOCUMENT_BYTES);
    const inventory = scriptInventory(result.text, result.finalUrl);
    documents.push({
      requestedUrl,
      ...reportFetchResult(result),
      title: safeTitle(result.text),
      scriptCount: inventory.length,
      scriptHosts: Array.from(new Set(inventory.map(item => item.host))).sort()
    });
    if (result.text) {
      documentBodies.push({ source: new URL(result.finalUrl).pathname || "/", url: result.finalUrl, text: result.text });
      for (const script of inventory) {
        if (!scriptMap.has(script.url)) scriptMap.set(script.url, script);
      }
    }
  }

  const scripts = [];
  const scriptBodies = [];
  let scriptBytes = 0;
  for (const script of Array.from(scriptMap.values()).filter(item => item.fetchable).slice(0, MAX_SCRIPTS)) {
    if (scriptBytes >= MAX_SCRIPT_TOTAL_BYTES) break;
    const remaining = Math.min(MAX_SCRIPT_BYTES, MAX_SCRIPT_TOTAL_BYTES - scriptBytes);
    const result = await fetchText(script.url, remaining);
    scriptBytes += result.bytes;
    scripts.push({
      url: script.url,
      ...reportFetchResult(result),
      requestHints: requestHints(result.text)
    });
    if (result.text) scriptBodies.push({ source: new URL(result.finalUrl).pathname, url: result.finalUrl, text: result.text });
  }

  const candidates = mergeCandidates([
    ...documentBodies.map(item => discoverCandidates(item.text, item.url, `document:${item.source}`)),
    ...scriptBodies.map(item => discoverCandidates(item.text, item.url, `script:${item.source}`))
  ]);

  const sameBestarHostCandidates = candidates.filter(item => {
    try {
      return trustedCurrentHost(new URL(item.candidate, CURRENT_ORIGIN).hostname);
    } catch {
      return false;
    }
  });

  const reachableDocuments = documents.filter(document => document.ok).length;
  const report = {
    phase: "M10A",
    providerCandidate: "bestar",
    predecessor: "golden-harvest-hong-kong",
    mode: "successor-reconnaissance-only",
    generatedAt: new Date().toISOString(),
    currentOrigin: CURRENT_ORIGIN.origin,
    transport: {
      currentDns,
      legacyGoldenHarvestDns,
      browserLikeUserAgent: true
    },
    limits: {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxDocumentBytes: MAX_DOCUMENT_BYTES,
      maxScriptBytes: MAX_SCRIPT_BYTES,
      maxScriptTotalBytes: MAX_SCRIPT_TOTAL_BYTES,
      maxScripts: MAX_SCRIPTS,
      maxCandidates: MAX_CANDIDATES
    },
    boundary: {
      readOnlyGetOnly: true,
      productionRegistryChanged: false,
      workerManifestChanged: false,
      productionRouteAdded: false,
      pwaChanged: false
    },
    summary: {
      reachableDocuments,
      probedDocuments: documents.length,
      declaredScripts: scriptMap.size,
      fetchedScripts: scripts.filter(script => script.ok).length,
      discoveredCandidates: candidates.length,
      sameBestarHostCandidates: sameBestarHostCandidates.length,
      sourceReachable: reachableDocuments > 0
    },
    documents,
    declaredScripts: Array.from(scriptMap.values()),
    scripts,
    candidates
  };

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    phase: report.phase,
    providerCandidate: report.providerCandidate,
    predecessor: report.predecessor,
    currentOrigin: report.currentOrigin,
    transport: report.transport,
    summary: report.summary,
    candidates: report.candidates.slice(0, 50)
  }, null, 2));

  if (!report.summary.sourceReachable) {
    console.warn("M10A reconnaissance: current Bestar public source was not reachable from the runner; preserve transport evidence and do not enable production integration.");
  }
}

await main();
