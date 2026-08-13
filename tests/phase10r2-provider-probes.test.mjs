import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  createProviderProbeRunner,
  SUPPORTED_PROVIDERS
} from '../worker/src/provider-probe.js';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return String(body);
    }
  };
}

function deterministicClock(start = Date.parse('2026-08-11T06:30:00Z')) {
  let current = start;
  return () => {
    current += 11;
    return current;
  };
}

const cineartTestProbe = async () => ({
  evidence: 'site-shell-cinema-directory',
  source: 'cinearthouse-hk',
  cinemaCount: 5
});

test('Phase 10R2B probes all registered Worker providers independently with structural evidence', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('cinema.com.hk')) {
      return mockResponse('<script>self.__next_f.push([])</script> openingDate movieTypes title_lang');
    }
    if (target.includes('GetCinemaDetails.aspx')) {
      return mockResponse(JSON.stringify([{ CinemaCodeID: '001', CinemaName: 'MCL Test' }]));
    }
    throw new TypeError(`unexpected fetch ${target}`);
  };

  const runner = createProviderProbeRunner({
    fetchImpl,
    emperorProbe: async () => ({
      ok: true,
      provider: 'emperor',
      count: 4,
      source: 'emperor-sync-film-showing'
    }),
    clock: deterministicClock(),
    additionalProbes: {
      cineart: cineartTestProbe
    }
  });

  const result = await runner.probeAll();

  assert.deepEqual(SUPPORTED_PROVIDERS, ['broadway', 'mcl', 'emperor', 'cineart']);
  assert.equal(result.allHealthy, true);
  assert.equal(result.healthyCount, SUPPORTED_PROVIDERS.length);
  assert.equal(result.total, SUPPORTED_PROVIDERS.length);
  assert.equal(result.providers.broadway.evidence.evidence, 'catalogue-page');
  assert.equal(result.providers.mcl.evidence.evidence, 'cinema-directory');
  assert.equal(result.providers.emperor.evidence.evidence, 'showing-catalogue');
  assert.equal(result.providers.emperor.evidence.count, 4);
  assert.equal(result.providers.cineart.evidence.evidence, 'site-shell-cinema-directory');
});

test('Phase 10R2B isolates provider failures and returns stable failure categories', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('cinema.com.hk')) {
      throw new TypeError('fetch failed: DNS unavailable');
    }
    if (target.includes('GetCinemaDetails.aspx')) {
      return mockResponse(JSON.stringify([{ CinemaCodeID: '001' }]));
    }
    throw new TypeError(`unexpected fetch ${target}`);
  };

  const rateLimit = new Error('rate limited');
  rateLimit.code = 'EMPEROR_RATE_LIMITED';
  rateLimit.status = 503;

  const runner = createProviderProbeRunner({
    fetchImpl,
    emperorProbe: async () => { throw rateLimit; },
    clock: deterministicClock(),
    additionalProbes: {
      cineart: cineartTestProbe
    }
  });

  const result = await runner.probeAll();

  assert.equal(result.allHealthy, false);
  assert.equal(result.healthyCount, 2);
  assert.equal(result.providers.broadway.failure.category, 'network_error');
  assert.equal(result.providers.mcl.healthy, true);
  assert.equal(result.providers.emperor.failure.category, 'rate_limited');
  assert.equal(result.providers.cineart.healthy, true);
});

test('Phase 10R2B keeps lastSuccessAt as best-effort per-runner state', async () => {
  let broadwayHealthy = true;
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes('cinema.com.hk')) {
      if (!broadwayHealthy) throw new TypeError('network down');
      return mockResponse('<script>self.__next_f.push([])</script> openingDate movieTypes');
    }
    return mockResponse(JSON.stringify([{ CinemaCodeID: '001' }]));
  };

  const runner = createProviderProbeRunner({
    fetchImpl,
    emperorProbe: async () => ({ ok: true, count: 1, source: 'emperor-sync-film-showing' }),
    clock: deterministicClock()
  });

  const success = await runner.probeProvider('broadway');
  broadwayHealthy = false;
  const failure = await runner.probeProvider('broadway');

  assert.equal(success.healthy, true);
  assert.ok(success.lastSuccessAt);
  assert.equal(failure.healthy, false);
  assert.equal(failure.lastSuccessAt, success.lastSuccessAt);
});

test('Phase 10R2D classifies an aborted probe as timeout even when fetch rejects TypeError', async () => {
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (!target.includes('GetCinemaDetails.aspx')) {
      throw new TypeError(`unexpected fetch ${target}`);
    }

    return await new Promise((resolve, reject) => {
      const signal = options.signal;
      if (signal?.aborted) {
        reject(new TypeError('invalid_argument'));
        return;
      }
      signal?.addEventListener(
        'abort',
        () => reject(new TypeError('invalid_argument')),
        { once: true }
      );
    });
  };

  const runner = createProviderProbeRunner({
    fetchImpl,
    emperorProbe: async () => ({ ok: true, count: 1 }),
    clock: deterministicClock(),
    timeoutMs: 500
  });

  const result = await runner.probeProvider('mcl');

  assert.equal(result.healthy, false);
  assert.deepEqual(result.failure, {
    category: 'timeout',
    code: 'PROBE_TIMEOUT',
    status: 504
  });
});

test('Phase 10R2B routes are no-store, bounded, and separate from normal app loading', async () => {
  const [probeSource, workerSource] = await Promise.all([
    read('worker/src/provider-probe.js'),
    read('worker/src/index-emperor-seat.js')
  ]);

  assert.match(probeSource, /DEFAULT_TIMEOUT_MS = 4500/);
  assert.match(probeSource, /AbortController/);
  assert.match(probeSource, /controller\.signal\.aborted/);
  assert.match(probeSource, /Promise\.race/);
  assert.match(workerSource, /\/api\/providers\/probe/);
  assert.match(workerSource, /cache-control": "no-store"/);
  assert.match(workerSource, /return emperorWorker\.fetch\(request, env, ctx\)/);

  const appRoot = new URL('../app/', import.meta.url);
  const files = await readdir(appRoot, { recursive: true });
  const readable = files.filter(path => /\.(?:js|html)$/.test(path));

  for (const path of readable) {
    const source = await readFile(new URL(path, appRoot), 'utf8');
    assert.equal(
      source.includes('/api/providers/probe'),
      false,
      `normal app file must not depend on live probe: ${path}`
    );
  }
});