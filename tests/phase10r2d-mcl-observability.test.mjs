import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyMCLTicketingFailure
} from '../worker/src/providers/mcl-ticketing.js';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('Phase 10R2D maps runtime-specific long fetch failures to timeout', () => {
  const failure = classifyMCLTicketingFailure(
    new TypeError('invalid_argument'),
    10018
  );

  assert.deepEqual(failure, {
    code: 'MCL_TICKETING_ERROR',
    causeCode: 'MCL_UPSTREAM_TIMEOUT',
    category: 'timeout',
    httpStatus: 504,
    upstreamStatus: null,
    elapsedMs: 10018,
    message: 'invalid_argument'
  });
});

test('Phase 10R2D distinguishes MCL blocked, rate-limit and generic HTTP failures', () => {
  const blocked = classifyMCLTicketingFailure(
    new Error('MCL WebAPI HTTP 403'),
    180
  );
  const rateLimited = classifyMCLTicketingFailure(
    new Error('MCL WebAPI HTTP 429'),
    220
  );
  const upstream = classifyMCLTicketingFailure(
    new Error('MCL WebAPI HTTP 503'),
    250
  );

  assert.equal(blocked.category, 'blocked');
  assert.equal(blocked.httpStatus, 502);
  assert.equal(blocked.upstreamStatus, 403);
  assert.equal(rateLimited.category, 'rate_limited');
  assert.equal(rateLimited.upstreamStatus, 429);
  assert.equal(upstream.category, 'http_error');
  assert.equal(upstream.upstreamStatus, 503);
});

test('Phase 10R2D separates invalid payloads from short network failures', () => {
  const invalid = classifyMCLTicketingFailure(
    new Error('MCL WebAPI returned no recognizable sessions'),
    740
  );
  const network = classifyMCLTicketingFailure(
    new TypeError('fetch failed: DNS unavailable'),
    320
  );

  assert.equal(invalid.category, 'invalid_payload');
  assert.equal(invalid.causeCode, 'MCL_UPSTREAM_INVALID_PAYLOAD');
  assert.equal(network.category, 'network_error');
  assert.equal(network.causeCode, 'MCL_UPSTREAM_NETWORK_ERROR');
  assert.equal(network.httpStatus, 502);
});

test('Phase 10R2D keeps the public MCL error code stable while exposing diagnostics', async () => {
  const workerSource = await read('worker/src/router.js');

  assert.match(workerSource, /errorResponse\(error, "MCL_TICKETING_ERROR"/);
  assert.match(workerSource, /category: error\?\.category \|\| "upstream_error"/);
  assert.match(workerSource, /causeCode: error\?\.causeCode \|\| "MCL_UPSTREAM_ERROR"/);
  assert.match(workerSource, /finiteNumberOrNull\(error\?\.upstreamStatus\)/);
  assert.match(workerSource, /finiteNumberOrNull\(error\?\.elapsedMs\)/);
  assert.match(workerSource, /Number\(error\?\.httpStatus\) === 504 \? 504 : 502/);
  assert.match(workerSource, /headers\.set\("cache-control", PUBLIC_CACHE_CONTROL\)/);
  assert.match(workerSource, /return errorResponse\(error, "MCL_TICKETING_ERROR", status/);
});
