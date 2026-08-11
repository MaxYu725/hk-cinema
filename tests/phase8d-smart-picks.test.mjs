import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const recommendationsSource = await readFile(new URL('../app/provider-compare-recommendations-v4.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/phase8d-smart-picks.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
const FIXED_NOW = new Date('2026-08-10T07:23:00Z');

function loadSmartPicks(selectedDate = '2026-08-10') {
  const window = {
    HKCinemaProviderCompare: {
      getState() {
        return { selectedDate };
      }
    },
    addEventListener() {}
  };
  const document = {
    readyState: 'loading',
    addEventListener() {}
  };
  const context = vm.createContext({
    window,
    document,
    Date,
    Intl,
    Math,
    Number,
    Object,
    String,
    Array,
    Set,
    Map,
    clearTimeout,
    setTimeout
  });
  vm.runInContext(recommendationsSource, context, {
    filename: 'provider-compare-recommendations-v4.js'
  });
  return window.HKCinemaSmartPicks2;
}

function entry(overrides = {}) {
  return {
    index: 0,
    key: 'show',
    provider: 'broadway',
    providerLabel: 'Broadway',
    time: '16:00',
    timeMinutes: 16 * 60,
    cinema: 'Cinema',
    price: 100,
    seats: { available: 50, total: 100, ratio: 0.5 },
    ...overrides
  };
}

test('Phase 8D wires Smart Picks 2 and a mobile 2x2 grid', () => {
  assert.match(index, /provider-compare-recommendations-v4\.js\?v=10r3b-1/);
  assert.match(index, /phase8d-smart-picks\.css\?v=8d1/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-recommendations-v3\.js/);
  assert.match(css, /grid-template-columns:\s*repeat\(4/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*grid-template-columns:\s*repeat\(2/);
  assert.match(css, /balanced\.phase8d-smart-pick[\s\S]*grid-column:\s*auto/);
});

test('today recommendations exclude already-started sessions from earliest pick', () => {
  const smart = loadSmartPicks();
  const model = smart.buildRecommendations([
    entry({ key: 'past', time: '14:30', timeMinutes: 14 * 60 + 30, price: 70 }),
    entry({ key: 'next', index: 1, time: '16:00', timeMinutes: 16 * 60, price: 90 }),
    entry({ key: 'later', index: 2, time: '18:00', timeMinutes: 18 * 60, price: 80 })
  ], FIXED_NOW);

  const earliest = model.picks.find(pick => pick.key === 'earliest');
  assert.equal(earliest.entry.key, 'next');
  assert.equal(model.pool.some(item => item.key === 'past'), false);
});

test('today recommendations exclude sessions starting in the current Hong Kong minute', () => {
  const smart = loadSmartPicks();
  const now = new Date('2026-08-10T07:23:30Z'); // 15:23 in Hong Kong.
  const model = smart.buildRecommendations([
    entry({ key: 'same-minute', time: '15:23', timeMinutes: 15 * 60 + 23, price: 60 }),
    entry({ key: 'next-minute', index: 1, time: '15:24', timeMinutes: 15 * 60 + 24, price: 80 }),
    entry({ key: 'later', index: 2, time: '16:00', timeMinutes: 16 * 60, price: 70 })
  ], now);

  assert.equal(model.pool.some(item => item.key === 'same-minute'), false);
  assert.equal(model.picks.find(pick => pick.key === 'earliest').entry.key, 'next-minute');
  assert.equal(model.picks.find(pick => pick.key === 'cheapest').entry.key, 'later');
});

test('confirmed sold-out rows are excluded while unknown seat rows remain eligible', () => {
  const smart = loadSmartPicks('2026-08-11');
  const model = smart.buildRecommendations([
    entry({ key: 'sold-out', price: 50, time: '11:00', timeMinutes: 660, seats: { available: 0, total: 100, ratio: 0 } }),
    entry({ key: 'unknown-seats', index: 1, price: 70, time: '12:00', timeMinutes: 720, seats: null }),
    entry({ key: 'available', index: 2, price: 80, time: '13:00', timeMinutes: 780, seats: { available: 20, total: 100, ratio: 0.2 } })
  ], FIXED_NOW);

  assert.equal(model.pool.some(item => item.key === 'sold-out'), false);
  assert.equal(model.pool.some(item => item.key === 'unknown-seats'), true);
  assert.equal(model.picks.find(pick => pick.key === 'cheapest').entry.key, 'unknown-seats');
  assert.equal(model.picks.find(pick => pick.key === 'earliest').entry.key, 'unknown-seats');
});

test('Smart Picks 2 selects four evidence-based recommendation types when data is complete', () => {
  const smart = loadSmartPicks('2026-08-11');
  const model = smart.buildRecommendations([
    entry({ key: 'cheap', price: 60, time: '17:00', timeMinutes: 1020, seats: { available: 10, total: 100, ratio: 0.1 } }),
    entry({ key: 'early', index: 1, price: 100, time: '12:00', timeMinutes: 720, seats: { available: 40, total: 100, ratio: 0.4 } }),
    entry({ key: 'roomy', index: 2, price: 120, time: '18:00', timeMinutes: 1080, seats: { available: 90, total: 100, ratio: 0.9 } }),
    entry({ key: 'balanced', index: 3, price: 75, time: '14:00', timeMinutes: 840, seats: { available: 70, total: 100, ratio: 0.7 } })
  ], FIXED_NOW);

  assert.deepEqual(Array.from(model.picks, pick => pick.key), ['cheapest', 'earliest', 'roomiest', 'balanced']);
  assert.equal(model.picks.find(pick => pick.key === 'cheapest').entry.key, 'cheap');
  assert.equal(model.picks.find(pick => pick.key === 'earliest').entry.key, 'early');
  assert.equal(model.picks.find(pick => pick.key === 'roomiest').entry.key, 'roomy');
  assert.equal(model.picks.find(pick => pick.key === 'balanced').entry.balanceMode, 'full');
});

test('balanced recommendation degrades to price plus time when seat evidence is insufficient', () => {
  const smart = loadSmartPicks('2026-08-11');
  const model = smart.buildRecommendations([
    entry({ key: 'a', price: 80, time: '13:00', timeMinutes: 780, seats: null }),
    entry({ key: 'b', index: 1, price: 100, time: '12:00', timeMinutes: 720, seats: null }),
    entry({ key: 'c', index: 2, price: null, time: '14:00', timeMinutes: 840, seats: null })
  ], FIXED_NOW);

  const balanced = model.picks.find(pick => pick.key === 'balanced');
  assert.ok(balanced);
  assert.equal(balanced.entry.balanceMode, 'price-time');
  assert.equal(model.picks.some(pick => pick.key === 'roomiest'), false);
});

test('balanced recommendation hides instead of inventing a comparison from one usable row', () => {
  const smart = loadSmartPicks('2026-08-11');
  const model = smart.buildRecommendations([
    entry({ key: 'only', price: 90, seats: null }),
    entry({ key: 'unknown', index: 1, price: null, seats: null })
  ], FIXED_NOW);

  assert.equal(model.picks.some(pick => pick.key === 'balanced'), false);
  assert.equal(model.picks.some(pick => pick.key === 'roomiest'), false);
  assert.equal(model.picks.some(pick => pick.key === 'cheapest'), true);
  assert.equal(model.picks.some(pick => pick.key === 'earliest'), true);
});
