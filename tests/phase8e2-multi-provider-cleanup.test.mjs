import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertAsset } from './index-assets.mjs';

const APP = new URL('../app/', import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), 'utf8');
}

test('Phase 8E2 loads the slim catalogue aggregation runtime', async () => {
  const index = await read('index.html');

  for (const asset of ['multi-provider.css', 'multi-provider.js', 'phase8a-movie-navigation.css']) {
    assertAsset(index, asset);
  }
});

test('multi-provider keeps the registries and variant metadata needed by movie aggregates', async () => {
  const source = await read('multi-provider.js');

  assert.match(source, /window\.HKCinemaProviderMatches =/);
  assert.match(source, /window\.HKCinemaMovieGroups =/);
  assert.match(source, /function buildMatchRecord/);
  assert.match(source, /function coalesceVariants/);
  assert.match(source, /function buildVariantMatchRecord/);
  assert.match(source, /isGenericBridgeSource/);
  assert.match(source, /criteriaFromVariant/);
  assert.match(source, /movieGroups: Array\.from\(groupRecords\.values\(\)\)/);
  assert.match(source, /window\.HKCinemaMultiProvider = Object\.freeze\(\{/);
  assert.match(source, /version:\s*["'][^"']+["']/);
});

test('provider-only catalogue cards remain movie-first and do not expose provider navigation', async () => {
  const source = await read('multi-provider.js');

  assert.match(source, /aria-label="查看 \$\{escapeHtml\(title\)\} 電影資料及場次"/);
  assert.match(source, /<div class="poster-placeholder">電影<\/div>/);
  assert.doesNotMatch(source, /providerBadges/);
  assert.doesNotMatch(source, /data-mcl-open/);
  assert.doesNotMatch(source, /data-emperor-open/);
  assert.doesNotMatch(source, /data-compare-open/);
});

test('legacy homepage provider filter and VERSIONS popup runtimes are retired', async () => {
  const source = await read('multi-provider.js');
  const css = await read('multi-provider.css');

  assert.doesNotMatch(source, /FILTER_STORAGE_KEY/);
  assert.doesNotMatch(source, /HKCinemaHomeProviderFilters/);
  assert.doesNotMatch(source, /ensureProviderFilters/);
  assert.doesNotMatch(source, /data-home-provider/);
  assert.doesNotMatch(source, /movieGroupOverlay/);
  assert.doesNotMatch(source, /data-movie-group-provider/);
  assert.doesNotMatch(source, /openMovieGroup/);
  assert.doesNotMatch(source, /document\.addEventListener\("click"/);
  assert.doesNotMatch(source, /document\.addEventListener\("keydown"/);

  assert.doesNotMatch(css, /provider-badge/);
  assert.doesNotMatch(css, /home-provider-filter/);
  assert.doesNotMatch(css, /movie-group-overlay/);
  assert.match(css, /\.movie-group-member/);
});

test('movie count now follows the grouped movie catalogue without a homepage provider filter', async () => {
  const source = await read('multi-provider.js');

  assert.match(source, /querySelectorAll\("\.movie-card:not\(\.movie-group-member\)"\)\.length/);
  assert.match(source, /count\.textContent = `\$\{total\} 部`/);
  assert.match(source, /HKCinemaHomeLibrary\?\.apply\?\.\(\)/);
});
