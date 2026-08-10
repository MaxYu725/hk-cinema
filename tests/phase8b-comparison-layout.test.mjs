import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../app/phase8b-comparison-layout.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/phase8b-comparison-layout.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');

test('Phase 8B loads after Phase 8A navigation', () => {
  const phase8a = index.indexOf('phase8a-movie-navigation-refresh.js');
  const phase8b = index.indexOf('phase8b-comparison-layout.js');
  assert.ok(phase8a >= 0);
  assert.ok(phase8b > phase8a);
  assert.ok(index.includes('phase8b-comparison-layout.css?v=8b1'));
});

test('Phase 8B establishes the mobile-first section order', () => {
  assert.ok(layout.includes('phase8b-date-section'));
  assert.ok(layout.includes('phase8b-filter-section'));
  assert.ok(layout.includes('phase8b-recommendation-toggle'));
  assert.ok(layout.includes('全部場次'));
  assert.ok(layout.includes('placeAfter(dateRail, insights)'));
  assert.ok(layout.includes('placeAfter(recommendationToggle, recommendations)'));
});

test('recommendations are collapsed by default and explicitly toggleable', () => {
  assert.ok(layout.includes('let recommendationExpanded = false'));
  assert.ok(layout.includes('panel.hidden = !recommendationExpanded'));
  assert.ok(layout.includes('aria-expanded'));
  assert.ok(layout.includes('recommendationExpanded = !recommendationExpanded'));
});

test('old summary insight grid is removed from the primary browsing hierarchy', () => {
  assert.ok(layout.includes('provider-compare-insight-grid'));
  assert.ok(layout.includes('grid.hidden = true'));
  assert.ok(css.includes('provider-compare-insight-grid[hidden]'));
});

test('comparison hero is movie-first rather than provider-match-first', () => {
  assert.ok(layout.includes('eyebrow.textContent = "MOVIE"'));
  assert.ok(layout.includes('phase8b-secondary-title'));
  assert.ok(layout.includes('電影資料'));
  assert.ok(layout.includes('上映日期'));
  assert.ok(layout.includes('片長'));
  assert.ok(layout.includes('級別'));
});
