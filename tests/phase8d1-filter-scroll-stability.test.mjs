import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app/phase8d1-filter-scroll-stability.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');

test('Phase 8D1 loads after the Phase 8B layout and listens before document filter handlers', () => {
  assert.match(index, /phase8d1-filter-scroll-stability\.js\?v=8d1/);
  assert.ok(
    index.indexOf('phase8b-comparison-layout.js?v=8b1') <
    index.indexOf('phase8d1-filter-scroll-stability.js?v=8d1')
  );
  assert.match(source, /window\.addEventListener\("pointerdown"[\s\S]*true\)/);
  assert.match(source, /window\.addEventListener\("click"[\s\S]*true\)/);
  assert.match(source, /window\.addEventListener\("change"[\s\S]*true\)/);
});

test('Phase 8D1 targets the comparison sheet and restores the interacted control visual anchor', () => {
  const listeners = new Map();
  const sheet = {
    isConnected: true,
    scrollTop: 500,
    getBoundingClientRect() { return { top: 0 }; },
    querySelector() { return replacementControl; }
  };
  const overlay = {
    hidden: false,
    querySelector(selector) {
      return selector === '.provider-compare-sheet' ? sheet : null;
    }
  };
  const originalControl = {
    closest(selector) { return selector === '#providerCompareOverlay' ? overlay : null; },
    hasAttribute(attribute) { return attribute === 'data-insight-region'; },
    getAttribute(attribute) { return attribute === 'data-insight-region' ? 'kln' : null; },
    getBoundingClientRect() { return { top: 300 }; }
  };
  const replacementControl = {
    getClientRects() { return [{}]; },
    getBoundingClientRect() { return { top: 350 }; }
  };
  const window = {
    addEventListener(type, handler, capture) { listeners.set(type, { handler, capture }); },
    HKCinemaProviderCompare: {
      getState() { return { match: { id: 'movie-1' } }; }
    }
  };
  const document = {
    querySelector(selector) { return selector === '#providerCompareOverlay' ? overlay : null; }
  };
  const context = vm.createContext({
    window,
    document,
    queueMicrotask,
    requestAnimationFrame(callback) { callback(); }
  });

  vm.runInContext(source, context, { filename: 'phase8d1-filter-scroll-stability.js' });
  const api = window.HKCinemaFilterScrollStability;
  const snapshot = api.capture(originalControl);

  assert.equal(snapshot.scrollTop, 500);
  assert.equal(snapshot.anchorOffset, 300);
  assert.equal(snapshot.locator, '[data-insight-region="kln"]');

  sheet.scrollTop = 0;
  api.restore(snapshot);
  assert.equal(sheet.scrollTop, 550);
  assert.equal(listeners.get('click').capture, true);
});

test('Phase 8D1 keeps an absolute scroll fallback when a regenerated control disappears', () => {
  assert.match(source, /sheet\.scrollTop = snapshot\.scrollTop/);
  assert.match(source, /if \(!anchor \|\| anchor\.getClientRects\(\)\.length === 0\) return/);
  assert.match(source, /queueMicrotask\([\s\S]*requestAnimationFrame\([\s\S]*requestAnimationFrame/);
  assert.doesNotMatch(source, /preventDefault\(|stopPropagation\(|focus\(/);
});
