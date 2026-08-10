import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const compare = await readFile(new URL('../app/provider-compare-v4.js', import.meta.url), 'utf8');
const filters = await readFile(new URL('../app/provider-compare-insights-v4.js', import.meta.url), 'utf8');
const prefs = await readFile(new URL('../app/provider-compare-preferences-v2.js', import.meta.url), 'utf8');
const metadataSource = await readFile(new URL('../app/showtime-metadata.js', import.meta.url), 'utf8');
const phase8a = await readFile(new URL('../app/phase8a-movie-navigation.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/phase8c-rich-filters.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');

test('Phase 8C loads the aggregate comparison engine and rich filters', () => {
  assert.match(index, /provider-compare-v4\.js\?v=8c1/);
  assert.match(index, /provider-compare-insights-v4\.js\?v=8c1/);
  assert.match(index, /provider-compare-preferences-v2\.js\?v=8c1/);
  assert.match(index, /phase8c-rich-filters\.css\?v=8e1/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-insights-v3\.js/);
});

test('aggregate comparison reads every provider source id and merges results', () => {
  assert.match(compare, /aggregate\.sources\?\.\[provider\]/);
  assert.match(compare, /Promise\.allSettled\(sourceIds\.map/);
  assert.match(compare, /availableDates: uniqueDates\(successes\.flatMap/);
  assert.match(compare, /const sessions = successes\.flatMap/);
  assert.match(compare, /_sourceIds: sourceIds/);
  assert.match(compare, /aggregateForMatch\(match\)\) return false/);
  assert.match(compare, /_requestedDate: date \|\| null/);
  assert.match(compare, /state\.data\[key\]\?\._requestedDate === date/);
});

test('variant labels enrich normalized showtime metadata and no top-level version selector is generated', () => {
  assert.match(compare, /variantTagsForSource/);
  assert.match(compare, /versionName:/);
  assert.match(compare, /_phase8cVariantTags/);
  assert.doesNotMatch(phase8a, /data-phase8a-variant-open/);
  assert.doesNotMatch(phase8a, /phase8a-version-rail/);
  assert.doesNotMatch(css, /phase8a-version-rail/);
});

test('Laser IMAX stays distinct and shared variant fallbacks do not invent a language', () => {
  const window = {};
  vm.runInContext(metadataSource, vm.createContext({ window }));
  const metadata = window.HKCinemaShowtimeMetadata;

  const laser = metadata.normalizeSession({ versionName: 'IMAX with Laser' });
  assert.deepEqual(Array.from(laser.formats), ['imax-laser']);
  assert.deepEqual(Array.from(laser.formatLabels), ['IMAX with Laser']);

  const ambiguous = metadata.normalizeSession({
    versionName: '日語版 · 粵語版',
    _phase8cVariantTags: ['日語版', '粵語版']
  });
  assert.deepEqual(Array.from(ambiguous.languages), ['unknown']);

  const explicit = metadata.normalizeSession({
    language: '日語',
    versionName: '日語版 · 粵語版',
    _phase8cVariantTags: ['日語版', '粵語版']
  });
  assert.deepEqual(Array.from(explicit.languages), ['japanese']);
});

test('Phase 8C exposes richer filters without guessing unknown data', () => {
  assert.match(filters, /district:\s*"all"/);
  assert.match(filters, /price:\s*"all"/);
  assert.match(filters, /seats:\s*"all"/);
  assert.match(filters, /放映方式/);
  assert.match(filters, /未來 2 小時/);
  assert.match(filters, /座位較充裕/);
  assert.match(filters, /item\.seats\.ratio >= 0\.5/);
  assert.match(filters, /未知資料不會推測/);
});

test('Phase 8C preferences persist the new filter dimensions', () => {
  assert.match(prefs, /district:/);
  assert.match(prefs, /price:/);
  assert.match(prefs, /seats:/);
  assert.match(prefs, /next2h/);
  assert.match(prefs, /filtersApi\(\)\?\.setFilter/);
});
