import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE_DIR = path.join(REPO_ROOT, "app");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "dist");
const STYLE_TAG = /  <link rel="stylesheet" href="([^"]+)">\r?\n/g;
const SCRIPT_TAG = /  <script src="([^"]+)"><\/script>\r?\n/g;
const SHELL_MANIFEST_MARKER = /\/\* c6-shell-manifest:start \*\/[\s\S]*?\/\* c6-shell-manifest:end \*\//;

function digest(value, length = 12) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function localReference(value) {
  const text = String(value || "").trim();
  return text.startsWith("./") && !text.startsWith(".//") ? text : null;
}

function sourcePath(reference) {
  const value = localReference(reference);
  if (!value) throw new Error(`Production asset must be a local ./ reference: ${reference}`);
  const pathname = new URL(value, "https://bundle.invalid/").pathname.slice(1);
  const normalized = path.posix.normalize(decodeURIComponent(pathname));
  if (!normalized || normalized === "." || normalized.startsWith("../")) {
    throw new Error(`Production asset escapes app/: ${reference}`);
  }
  return normalized;
}

function versionedReference(reference, hash) {
  const url = new URL(reference, "https://bundle.invalid/");
  url.search = `?v=${hash}`;
  return `.${url.pathname}${url.search}`;
}

async function readAsset(sourceDir, reference) {
  const relativePath = sourcePath(reference);
  return {
    reference,
    relativePath,
    content: await readFile(path.join(sourceDir, relativePath))
  };
}

function replaceFirstAndRemoveRest(source, pattern, replacement) {
  let injected = false;
  return source.replace(pattern, () => {
    if (injected) return "";
    injected = true;
    return `${replacement}\n`;
  });
}

function bundledText(assets, type) {
  const separator = type === "js" ? "\n;\n\n" : "\n\n";
  return assets.map(asset => {
    const body = asset.content.toString("utf8").trimEnd();
    return `/* source: app/${asset.relativePath} */\n${body}`;
  }).join(separator) + "\n";
}

function linkReferences(html) {
  return Array.from(html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g), match => ({
    tag: match[0],
    reference: match[1],
    stylesheet: /\brel="[^"]*\bstylesheet\b[^"]*"/.test(match[0]),
    manifest: /\brel="[^"]*\bmanifest\b[^"]*"/.test(match[0])
  }));
}

function releaseDigest(entries) {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.content);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

function embeddedManifest(version, assets) {
  return `/* c6-shell-manifest:start */ Object.freeze({\n` +
    `  version: ${JSON.stringify(version)},\n` +
    `  assets: Object.freeze(${JSON.stringify(assets, null, 2).replace(/^/gm, "  ").trimStart()})\n` +
    `}) /* c6-shell-manifest:end */`;
}

export async function createBuildPlan({ sourceDir = DEFAULT_SOURCE_DIR } = {}) {
  const indexSource = await readFile(path.join(sourceDir, "index.html"), "utf8");
  const swSource = await readFile(path.join(sourceDir, "sw.js"), "utf8");
  if (!SHELL_MANIFEST_MARKER.test(swSource)) {
    throw new Error("app/sw.js is missing the C6 shell manifest marker");
  }

  const styleReferences = Array.from(indexSource.matchAll(STYLE_TAG), match => match[1]);
  const scriptReferences = Array.from(indexSource.matchAll(SCRIPT_TAG), match => match[1]);
  if (!styleReferences.length || !scriptReferences.length) {
    throw new Error("index.html must declare production styles and scripts");
  }

  const styles = await Promise.all(styleReferences.map(reference => readAsset(sourceDir, reference)));
  const scripts = await Promise.all(scriptReferences.map(reference => readAsset(sourceDir, reference)));
  const cssBundle = bundledText(styles, "css");
  const jsBundle = bundledText(scripts, "js");
  const cssPath = `assets/app.${digest(cssBundle)}.css`;
  const jsPath = `assets/app.${digest(jsBundle)}.js`;
  const cssReference = `./${cssPath}`;
  const jsReference = `./${jsPath}`;

  let index = replaceFirstAndRemoveRest(
    indexSource,
    STYLE_TAG,
    `  <link rel="stylesheet" href="${cssReference}">`
  );
  index = replaceFirstAndRemoveRest(
    index,
    SCRIPT_TAG,
    `  <script src="${jsReference}"></script>`
  );

  const originalLinks = linkReferences(index);
  const manifestLink = originalLinks.find(link => link.manifest);
  if (!manifestLink) throw new Error("index.html is missing its local web manifest");

  const sourceManifestAsset = await readAsset(sourceDir, manifestLink.reference);
  const manifest = JSON.parse(sourceManifestAsset.content.toString("utf8"));
  const publicAssets = new Map();

  for (const link of originalLinks.filter(link => !link.stylesheet && !link.manifest)) {
    const reference = localReference(link.reference);
    if (!reference) continue;
    const asset = await readAsset(sourceDir, reference);
    publicAssets.set(asset.relativePath, asset);
    const nextReference = versionedReference(reference, digest(asset.content));
    index = index.replace(`href="${link.reference}"`, `href="${nextReference}"`);
  }

  for (const icon of manifest.icons || []) {
    const asset = await readAsset(sourceDir, icon.src);
    publicAssets.set(asset.relativePath, asset);
    icon.src = versionedReference(icon.src, digest(asset.content));
  }

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestReference = versionedReference("./manifest.json", digest(manifestText));
  index = index.replace(`href="${manifestLink.reference}"`, `href="${manifestReference}"`);

  const shellReferences = new Set(["./", "./index.html"]);
  for (const match of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = localReference(match[1]);
    if (reference) shellReferences.add(reference);
  }
  for (const icon of manifest.icons || []) shellReferences.add(icon.src);
  const shellAssets = [
    "./",
    "./index.html",
    ...[...shellReferences].filter(value => value !== "./" && value !== "./index.html").sort()
  ];

  for (const reference of shellAssets) {
    if (/\/api\//.test(reference) || /^https?:/i.test(reference)) {
      throw new Error(`Live data cannot enter the shell manifest: ${reference}`);
    }
  }

  const version = `c6-${releaseDigest([
    { path: "index.html", content: index },
    { path: "manifest.json", content: manifestText },
    { path: cssPath, content: cssBundle },
    { path: jsPath, content: jsBundle },
    { path: "sw.js", content: swSource },
    ...[...publicAssets.values()].map(asset => ({
      path: asset.relativePath,
      content: asset.content
    }))
  ])}`;
  const sw = swSource.replace(SHELL_MANIFEST_MARKER, embeddedManifest(version, shellAssets));

  const sourceFiles = [
    "index.html",
    "sw.js",
    "manifest.json",
    ...styles.map(asset => asset.relativePath),
    ...scripts.map(asset => asset.relativePath),
    ...publicAssets.keys()
  ];
  const outputFiles = [
    ".nojekyll",
    "asset-manifest.json",
    "index.html",
    "manifest.json",
    "sw.js",
    cssPath,
    jsPath,
    ...publicAssets.keys()
  ].sort();
  const assetManifest = {
    schemaVersion: 1,
    version,
    bundles: {
      styles: { path: cssPath, sources: styles.map(asset => asset.relativePath) },
      scripts: { path: jsPath, sources: scripts.map(asset => asset.relativePath) }
    },
    shellAssets,
    sourceFiles: [...new Set(sourceFiles)].sort(),
    outputFiles: [...new Set(outputFiles)]
  };

  return {
    assetManifest,
    cssBundle,
    cssPath,
    index,
    jsBundle,
    jsPath,
    manifestText,
    publicAssets,
    sw
  };
}

export async function buildProductionApp({
  sourceDir = DEFAULT_SOURCE_DIR,
  outputDir = DEFAULT_OUTPUT_DIR
} = {}) {
  const plan = await createBuildPlan({ sourceDir });
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(outputDir, "assets"), { recursive: true });

  await Promise.all([
    writeFile(path.join(outputDir, ".nojekyll"), ""),
    writeFile(path.join(outputDir, "index.html"), plan.index),
    writeFile(path.join(outputDir, "manifest.json"), plan.manifestText),
    writeFile(path.join(outputDir, "sw.js"), plan.sw),
    writeFile(path.join(outputDir, plan.cssPath), plan.cssBundle),
    writeFile(path.join(outputDir, plan.jsPath), plan.jsBundle)
  ]);

  for (const asset of plan.publicAssets.values()) {
    const target = path.join(outputDir, asset.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(sourceDir, asset.relativePath), target);
  }

  await writeFile(
    path.join(outputDir, "asset-manifest.json"),
    `${JSON.stringify(plan.assetManifest, null, 2)}\n`
  );
  return plan.assetManifest;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const manifest = await buildProductionApp();
  console.log(JSON.stringify({
    ok: true,
    version: manifest.version,
    styles: manifest.bundles.styles.sources.length,
    scripts: manifest.bundles.scripts.sources.length,
    shellAssets: manifest.shellAssets.length,
    outputFiles: manifest.outputFiles.length
  }));
}
