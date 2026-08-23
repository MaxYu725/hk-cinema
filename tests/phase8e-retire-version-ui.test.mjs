import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertAsset } from './index-assets.mjs';

const APP = new URL('../app/', import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), 'utf8');
}

test('Phase 8E keeps a single movie entry and retires the temporary top-level version selector', async () => {
  const [index, navigation, navigationCss, richFilterCss] = await Promise.all([
    read('index.html'),
    read('phase8a-movie-navigation.js'),
    read('phase8a-movie-navigation.css'),
    read('phase8c-rich-filters.css')
  ]);

  for (const asset of ['phase8a-movie-navigation.js', 'phase8a-movie-navigation.css', 'phase8c-rich-filters.css']) {
    assertAsset(index, asset);
  }
  assert.doesNotMatch(navigation, /data-phase8a-variant-open/);
  assert.doesNotMatch(navigation, /phase8a-version-rail/);
  assert.doesNotMatch(navigationCss, /phase8a-version-rail/);
  assert.doesNotMatch(richFilterCss, /phase8a-version-rail/);
});

test('merged variant data remains available to the Phase 8C comparison engine', async () => {
  const [domain, compare] = await Promise.all([
    read('catalogue-domain.js'),
    read('provider-compare-v4.js')
  ]);

  assert.match(domain, /sources: Object\.fromEntries\(PROVIDER_IDS\.map/);
  assert.match(domain, /variants: variantModels/);
  assert.match(domain, /primaryMatchId: primary\.matchId/);
  assert.match(compare, /aggregate\.sources\?\.\[provider\]/);
  assert.match(compare, /variantTagsForSource/);
});

test('production index loads only the current comparison, filter and recommendation runtimes', async () => {
  const index = await read('index.html');

  for (const asset of [
    'provider-compare-v4.js',
    'provider-compare-insights-v4.js',
    'provider-compare-preferences-v2.js',
    'provider-compare-recommendations-v4.js'
  ]) assertAsset(index, asset);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-insights-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-preferences\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-recommendations-v3\.js/);
});
