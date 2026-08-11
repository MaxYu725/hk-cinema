import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const [wrangler, baseWorker, emperorWorker, seatWorker] = await Promise.all([
  read('worker/wrangler.jsonc'),
  read('worker/src/index.js'),
  read('worker/src/index-emperor.js'),
  read('worker/src/index-emperor-seat.js')
]);

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('Phase 10R2A keeps the production worker entrypoint on the full three-provider route chain', () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/index-emperor-seat\.js"/);
  assert.match(seatWorker, /import emperorWorker from "\.\/index-emperor\.js"/);
  assert.match(emperorWorker, /import baseWorker from "\.\/index\.js"/);

  assert.match(baseWorker, /\/api\/broadway\/movies/);
  assert.match(baseWorker, /\/api\/mcl\/ticketing/);
  assert.match(emperorWorker, /\/api\/emperor\/movies/);
  assert.match(seatWorker, /\/api\/emperor\/shows/);
});

test('Phase 10R2A preserves live-data cache boundaries by data type', () => {
  const broadwayMovies = section(baseWorker, 'if (url.pathname === "/api/broadway/movies")', 'if (url.pathname === "/api/broadway/upcoming")');
  const broadwayUpcoming = section(baseWorker, 'if (url.pathname === "/api/broadway/upcoming")', 'const showMatch');
  const broadwayShows = section(baseWorker, 'const showMatch', 'const seatMatch');
  const broadwaySeats = section(baseWorker, 'const seatMatch', 'const mclSeatMatch');
  const mclSeats = section(baseWorker, 'const mclSeatMatch', 'if (url.pathname === "/api/mcl/ticketing")');
  const mclTicketing = section(baseWorker, 'if (url.pathname === "/api/mcl/ticketing")', 'return json({\n      ok: false');
  const emperorShows = section(emperorWorker, 'const showMatch', 'return baseWorker.fetch');
  const emperorSeats = section(seatWorker, 'const seatMatch', 'return emperorWorker.fetch');

  assert.match(broadwayMovies, /public, max-age=300/);
  assert.match(broadwayUpcoming, /public, max-age=1800/);
  assert.match(broadwayShows, /public, max-age=60/);
  assert.match(broadwaySeats, /public, max-age=30/);
  assert.match(mclSeats, /public, max-age=30/);
  assert.match(mclTicketing, /metadataComplete[\s\S]*public, max-age=60[\s\S]*no-store/);
  assert.match(emperorShows, /public, max-age=60/);
  assert.match(emperorSeats, /public, max-age=30/);
});

test('Phase 10R2A keeps invalid provider identifiers out of upstream requests', () => {
  assert.match(baseWorker, /INVALID_DATE/);
  assert.match(baseWorker, /INVALID_MCL_CINEMA_CODE/);
  assert.match(baseWorker, /INVALID_MCL_MOVIE_ID/);
  assert.match(emperorWorker, /INVALID_EMPEROR_FILM_ID/);
});

test('Phase 10R2A keeps health and telemetry responses uncached and traceable', () => {
  const baseHealth = section(baseWorker, 'if (url.pathname === "/health")', 'if (url.pathname === "/api/broadway/movies")');
  const emperorHealth = section(emperorWorker, 'url.pathname === "/api/emperor/health"', 'if (url.pathname === "/api/emperor/movies")');
  const emperorSeatHealth = section(seatWorker, 'if (url.pathname === "/api/emperor/seatmap-health")', 'const seatMatch');

  assert.match(baseHealth, /cache-control": "no-store"/);
  assert.match(emperorHealth, /cache-control": "no-store"/);
  assert.match(emperorSeatHealth, /cache-control": "no-store"/);
  assert.match(seatWorker, /x-request-id/);
  assert.match(seatWorker, /server-timing/);
  assert.match(seatWorker, /access-control-expose-headers/);
});
