import { appendFile, writeFile } from 'node:fs/promises';

const workerBase = String(
  process.env.HK_CINEMA_WORKER_URL ||
  'https://hk-cinema-api.max-yu-jp.workers.dev'
).replace(/\/$/, '');
const reportPath = process.env.LIVE_VALIDATION_REPORT || 'live-validation.json';
const startedAt = new Date().toISOString();

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('validation-timeout'), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function request(url, { timeoutMs = 12000, parse = 'json' } = {}) {
  const started = Date.now();
  const timeout = timeoutSignal(timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: timeout.signal,
      headers: {
        accept: parse === 'json' ? 'application/json, */*;q=0.8' : '*/*',
        'user-agent': 'HKCinema-Live-Validation/10R2C'
      }
    });

    const contentType = response.headers.get('content-type') || '';
    let body = null;
    let parseError = null;

    try {
      body = parse === 'text'
        ? await response.text()
        : await response.json();
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }

    return {
      reachable: true,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      headers: {
        contentType,
        cacheControl: response.headers.get('cache-control'),
        requestId: response.headers.get('x-request-id'),
        serverTiming: response.headers.get('server-timing'),
        cors: response.headers.get('access-control-allow-origin')
      },
      body,
      parseError
    };
  } catch (error) {
    return {
      reachable: false,
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      errorName: error?.name || null
    };
  } finally {
    timeout.clear();
  }
}

function firstArray(value) {
  return Array.isArray(value) ? value : [];
}

function expectedBookingHost(provider, rawUrl) {
  if (!rawUrl) return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (provider === 'broadway') return host === 'www.cinema.com.hk' || host === 'cinema.com.hk';
    if (provider === 'mcl') return host === 'www.mclcinema.com' || host === 'mclcinema.com';
    if (provider === 'emperor') return host === 'www.emperorcinemas.com' || host === 'emperorcinemas.com';
    return false;
  } catch {
    return false;
  }
}

function priceEvidence(session) {
  const values = session?.price && typeof session.price === 'object'
    ? Object.values(session.price)
    : [];
  return values.some(value => Number.isFinite(Number(value)) && Number(value) >= 0);
}

function seatSummaryEvidence(session) {
  const summary = session?.seatSummary;
  if (!summary || typeof summary !== 'object') return false;
  return ['available', 'total', 'sold', 'unavailable', 'occupiedPercent', 'occupancy']
    .some(key => Number.isFinite(Number(summary[key])));
}

async function validateBroadway() {
  const catalogue = await request(`${workerBase}/api/broadway/movies`);
  const movies = firstArray(catalogue.body?.data);
  const movie = movies.find(item => item?.sourceId != null) || null;
  const result = {
    catalogue: {
      reachable: catalogue.reachable,
      ok: catalogue.ok && catalogue.body?.ok === true,
      status: catalogue.status,
      latencyMs: catalogue.latencyMs,
      count: movies.length,
      cacheControl: catalogue.headers?.cacheControl || null
    },
    sampleMovie: movie ? {
      sourceId: String(movie.sourceId),
      title: movie?.title?.zh || movie?.title?.en || null
    } : null,
    shows: null,
    seatmap: null
  };

  if (!movie) return result;

  const showsResponse = await request(
    `${workerBase}/api/broadway/movies/${encodeURIComponent(movie.sourceId)}/shows`,
    { timeoutMs: 15000 }
  );
  const sessions = firstArray(showsResponse.body?.data?.sessions);
  const session = sessions.find(item => item?.sourceId != null) || null;

  result.shows = {
    reachable: showsResponse.reachable,
    ok: showsResponse.ok && showsResponse.body?.ok === true,
    status: showsResponse.status,
    latencyMs: showsResponse.latencyMs,
    availableDates: firstArray(showsResponse.body?.data?.availableDates).length,
    sessions: sessions.length,
    hasPrice: session ? priceEvidence(session) : false,
    hasSeatSummary: session ? seatSummaryEvidence(session) : false,
    bookingUrlValid: session ? expectedBookingHost('broadway', session.bookingUrl) : false,
    sampleSessionId: session?.sourceId != null ? String(session.sourceId) : null
  };

  if (!session) return result;

  const seatmap = await request(
    `${workerBase}/api/broadway/shows/${encodeURIComponent(session.sourceId)}/seats`,
    { timeoutMs: 15000 }
  );

  result.seatmap = {
    reachable: seatmap.reachable,
    ok: seatmap.ok && seatmap.body?.ok === true,
    status: seatmap.status,
    latencyMs: seatmap.latencyMs,
    hasData: Boolean(seatmap.body?.data)
  };

  return result;
}

function mclNowItems(raw) {
  return firstArray(raw?.n?.n).filter(item => item?.id != null);
}

async function validateMCL() {
  const catalogueUrl = 'https://www.mclcinema.com/MCLWebAPI2/GetNCF.aspx?l=1';
  const catalogue = await request(catalogueUrl, { timeoutMs: 15000 });
  const movies = mclNowItems(catalogue.body);
  const movie = movies[0] || null;
  const result = {
    browserCatalogue: {
      reachable: catalogue.reachable,
      ok: catalogue.ok && Boolean(catalogue.body?.n && catalogue.body?.c),
      status: catalogue.status,
      latencyMs: catalogue.latencyMs,
      count: movies.length,
      cors: catalogue.headers?.cors || null,
      contentType: catalogue.headers?.contentType || null
    },
    sampleMovie: movie ? {
      sourceId: String(movie.id),
      title: movie.mn || null
    } : null,
    ticketing: null,
    seatmap: null
  };

  if (!movie) return result;

  const ticketing = await request(
    `${workerBase}/api/mcl/ticketing?movieSetId=${encodeURIComponent(movie.id)}`,
    { timeoutMs: 30000 }
  );
  const sessions = firstArray(ticketing.body?.data?.sessions);
  const session = sessions.find(item => item?.sourceId != null && item?.cinema?.id) || null;

  result.ticketing = {
    reachable: ticketing.reachable,
    ok: ticketing.ok && ticketing.body?.ok === true,
    status: ticketing.status,
    latencyMs: ticketing.latencyMs,
    sessions: sessions.length,
    metadataComplete: ticketing.body?.data?.metadataComplete ?? null,
    cacheControl: ticketing.headers?.cacheControl || null,
    hasPrice: session ? priceEvidence(session) : false,
    bookingUrlValid: session ? expectedBookingHost('mcl', session.bookingUrl) : false,
    sampleSessionId: session?.sourceId != null ? String(session.sourceId) : null,
    cinemaCode: session?.cinema?.id != null ? String(session.cinema.id) : null
  };

  if (!session) return result;

  const seatmap = await request(
    `${workerBase}/api/mcl/shows/${encodeURIComponent(session.sourceId)}/seats?cinemaCode=${encodeURIComponent(session.cinema.id)}&summary=1`,
    { timeoutMs: 20000 }
  );

  result.seatmap = {
    reachable: seatmap.reachable,
    ok: seatmap.ok && seatmap.body?.ok === true,
    status: seatmap.status,
    latencyMs: seatmap.latencyMs,
    counts: seatmap.body?.data?.counts || null
  };

  return result;
}

async function validateEmperor() {
  const catalogue = await request(`${workerBase}/api/emperor/movies`, { timeoutMs: 15000 });
  const movies = firstArray(catalogue.body?.data);
  const movie = movies.find(item => item?.sourceId) || null;
  const result = {
    catalogue: {
      reachable: catalogue.reachable,
      ok: catalogue.ok && catalogue.body?.ok === true,
      status: catalogue.status,
      latencyMs: catalogue.latencyMs,
      count: movies.length,
      cacheControl: catalogue.headers?.cacheControl || null
    },
    sampleMovie: movie ? {
      sourceId: String(movie.sourceId),
      title: movie?.name?.zh || movie?.name?.en || movie?.title?.zh || null
    } : null,
    shows: null,
    seatmap: null
  };

  if (!movie) return result;

  const showsResponse = await request(
    `${workerBase}/api/emperor/movies/${encodeURIComponent(movie.sourceId)}/shows`,
    { timeoutMs: 20000 }
  );
  const sessions = firstArray(showsResponse.body?.data?.sessions);
  const session = sessions.find(item => item?.sourceId) || null;

  result.shows = {
    reachable: showsResponse.reachable,
    ok: showsResponse.ok && showsResponse.body?.ok === true,
    status: showsResponse.status,
    latencyMs: showsResponse.latencyMs,
    availableDates: firstArray(showsResponse.body?.data?.availableDates).length,
    sessions: sessions.length,
    hasPrice: session ? priceEvidence(session) : false,
    hasSeatSummary: session ? seatSummaryEvidence(session) : false,
    bookingUrlValid: session ? expectedBookingHost('emperor', session.bookingUrl) : false,
    sampleSessionId: session?.sourceId != null ? String(session.sourceId) : null
  };

  if (!session) return result;

  const params = new URLSearchParams();
  if (session?.purchase?.scheduleKey) params.set('scheduleKey', session.purchase.scheduleKey);
  if (session?.cinema?.sourceId) params.set('cinemaLinkId', session.cinema.sourceId);
  if (session?.house?.sourceId) params.set('hallId', session.house.sourceId);
  const query = params.toString();
  const seatmap = await request(
    `${workerBase}/api/emperor/shows/${encodeURIComponent(session.sourceId)}/seats${query ? `?${query}` : ''}`,
    { timeoutMs: 20000 }
  );

  result.seatmap = {
    reachable: seatmap.reachable,
    ok: seatmap.ok && seatmap.body?.ok === true,
    status: seatmap.status,
    latencyMs: seatmap.latencyMs,
    geometryVersion: seatmap.body?.meta?.geometryVersion || seatmap.body?.data?.geometryVersion || null,
    hasData: Boolean(seatmap.body?.data)
  };

  return result;
}

function providerState(value) {
  const stages = Object.entries(value || {})
    .filter(([key]) => !['sampleMovie'].includes(key))
    .map(([key, item]) => ({ key, ok: item?.ok === true }));
  if (!stages.length) return 'unknown';
  if (stages.every(stage => stage.ok)) return 'healthy';
  if (stages.some(stage => stage.ok)) return 'partial';
  return 'unhealthy';
}

const health = await request(`${workerBase}/health`);
const probe = await request(`${workerBase}/api/providers/probe`, { timeoutMs: 12000 });

const deploymentState = !health.reachable
  ? 'worker-unreachable'
  : probe.status === 404 && probe.body?.error?.code === 'NOT_FOUND'
    ? 'pre-10R2B-worker'
    : probe.ok && probe.body?.data?.providers
      ? '10R2B-or-later'
      : 'unknown';

const [broadway, mcl, emperor] = await Promise.all([
  validateBroadway(),
  validateMCL(),
  validateEmperor()
]);

const report = {
  phase: '10R2C',
  checkedAt: new Date().toISOString(),
  startedAt,
  workerBase,
  deployment: {
    state: deploymentState,
    health: {
      reachable: health.reachable,
      ok: health.ok && health.body?.ok === true,
      status: health.status,
      phase: health.body?.phase || null,
      latencyMs: health.latencyMs,
      cacheControl: health.headers?.cacheControl || null,
      requestId: health.headers?.requestId || null,
      serverTiming: health.headers?.serverTiming || null
    },
    providerProbe: {
      reachable: probe.reachable,
      ok: probe.ok && probe.body?.ok === true,
      status: probe.status,
      latencyMs: probe.latencyMs,
      cacheControl: probe.headers?.cacheControl || null,
      allHealthy: probe.body?.data?.allHealthy ?? null,
      healthyCount: probe.body?.data?.healthyCount ?? null,
      providers: probe.body?.data?.providers || null,
      errorCode: probe.body?.error?.code || null
    }
  },
  providers: {
    broadway: { state: providerState(broadway), ...broadway },
    mcl: { state: providerState(mcl), ...mcl },
    emperor: { state: providerState(emperor), ...emperor }
  },
  notes: [
    'This workflow is diagnostic only and does not gate the normal regression/Pages workflow.',
    'MCL browser catalogue reachability from a GitHub-hosted runner is not equivalent to Hong Kong device reachability.',
    'Provider failures are recorded as evidence; the script intentionally exits successfully after writing the report.'
  ]
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const rows = Object.entries(report.providers)
  .map(([provider, value]) => `| ${provider} | ${value.state} |`)
  .join('\n');
const summary = [
  '## HK Cinema Phase 10R2C live validation',
  '',
  `- Worker deployment state: **${deploymentState}**`,
  `- Health: **${report.deployment.health.ok ? 'ok' : 'not-ok'}** (HTTP ${report.deployment.health.status ?? 'n/a'})`,
  `- 10R2B provider probe route: **${report.deployment.providerProbe.ok ? 'available' : 'not available'}** (HTTP ${report.deployment.providerProbe.status ?? 'n/a'})`,
  '',
  '| Provider | Representative flow |',
  '|---|---|',
  rows,
  '',
  `Full structured report: \`${reportPath}\``
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
}

console.log(summary);
