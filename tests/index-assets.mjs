import assert from "node:assert/strict";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assetReference(index, assetPath) {
  const escaped = escapeRegex(assetPath.replace(/^\.\//, ""));
  const pattern = new RegExp(`(?:src|href)=["']\\./${escaped}(?:\\?[^"']*)?["']`);
  return String(index || "").match(pattern)?.[0] || null;
}

export function assetPosition(index, assetPath) {
  const reference = assetReference(index, assetPath);
  if (!reference) return -1;
  return String(index || "").indexOf(reference);
}

export function hasAsset(index, assetPath) {
  return assetPosition(index, assetPath) >= 0;
}

export function hasVersionedAsset(index, assetPath) {
  const reference = assetReference(index, assetPath);
  return Boolean(reference && /\?v=[^"']+/.test(reference));
}

export function assertAsset(index, assetPath, { versioned = true } = {}) {
  assert.ok(hasAsset(index, assetPath), `${assetPath} must be loaded`);
  if (versioned) assert.ok(hasVersionedAsset(index, assetPath), `${assetPath} must carry a cachebuster`);
}

export function assertAssetOrder(index, ...assetPaths) {
  let previous = -1;
  for (const assetPath of assetPaths) {
    const position = assetPosition(index, assetPath);
    assert.ok(position >= 0, `${assetPath} must be loaded`);
    assert.ok(position > previous, `${assetPath} must load after ${previous < 0 ? "the document start" : assetPaths[assetPaths.indexOf(assetPath) - 1]}`);
    previous = position;
  }
}
