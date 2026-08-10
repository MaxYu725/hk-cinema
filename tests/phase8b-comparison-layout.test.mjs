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
  assert.match(index, /phase8b-comparison-layout\.css\?v=8b1/);
});

test('Phase 8B establishes the mobile-first section order', () => {
  assert.match(layout, /phase8b-date-section/);
  assert.match(layout, /phase8b-filter-section/);
  assert.match(layout, /phase8b-recommendation-toggle/);
  assert.match(layout, /全部場次/);
  assert.match(layout, /placeAfter\(dateRail, insights\)/);
  assert.match(layout, /placeAfter\(recommendationToggle, recommendations\)/);
});

test('recommendations are collapsed by default and explicitly toggleable', () => {
  assert.match(layout, /let recommendationExpanded = false/);
  assert.match(layout, /panel\.hidden = !recommendationExpanded/);
  assert.match(layout, /aria-expanded/);
  assert.match(layout, /recommendationExpanded = !recommendationExpanded/);
});

test('old summary insight grid is removed from the primary browsing hierarchy', () => {
  assert.match(layout, /provider-compare-insight-grid/);
  assert.match(layout, /grid\.hidden = true/);
  assert.match(css, /provider-compare-insight-grid\[hidden\]/);
});

test('comparison hero is movie-first rather than provider-match-first', () => {
  assert.match(layout, /eyebrow\.textContent = "MOVIE"/);
  assert.match(layout, /phase8b-secondary-title/);
  assert.match(layout, /電影資料/);
  assert.match(layout, /上映日期/);
  assert.match(layout, /片長/);
  assert.match(layout, /級別/);
});

test('Phase 8B keeps the Phase 8A version rail as a temporary reachable control', () => {
  assert.match(layout, /data-phase8a-version-rail/);
  assert.doesNotMatch(layout, /remove\(\).*phase8a-version-rail/);
});
