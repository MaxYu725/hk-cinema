import { appendFile, readFile, writeFile } from 'node:fs/promises';

const reportPath = process.env.LIVE_VALIDATION_REPORT || 'live-validation.json';
const expectedCommit = process.env.HK_CINEMA_EXPECTED_COMMIT || null;

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('phase10r2e-timeout'), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function requestJson(url, timeoutMs = 30000) {
  const started = Date.now();
  const timeout = timeoutSignal(timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: timeout.signal,
      headers: {
        accept: 'application/json, */*;q=0.8',
        'user-agent': 'HKCinema-Production-Revalidation/10R2E'
      }
    });

    let body = null;
    let parseError = null;
    try {
      body = await response.json();
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }

    return {
      reachable: true,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      cacheControl: response.headers.get('cache-control'),
      requestId: response.headers.get('x-request-id'),
      serverTiming: response.headers.get('server-timing'),
      body,
      parseError
    };
  } catch (error) {
    return {
      reachable: false,
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      cacheControl: null,
      requestId: null,
      serverTiming: null,
      body: null,
      parseError: null,
      error: error instanceof Error ? error.message : String(error),
      errorName: error?.name || null
    };
  } finally {
    timeout.clear();
  }
}

function failureDiagnostics(response) {
  const error = response?.body?.error || null;
  return {
    code: error?.code || null,
    category: error?.category || null,
    causeCode: error?.causeCode || null,
    upstreamStatus: error?.upstreamStatus ?? null,
    elapsedMs: error?.elapsedMs ?? null,
    message: error?.message || response?.error || response?.parseError || null
  };
}

function has10R2DDiagnostics(response) {
  if (!response?.reachable) return false;
  if (response?.ok && response?.body?.ok === true) return true;

  const diagnostics = failureDiagnostics(response);
  return (
    response.status === 502 || response.status === 504
  ) && diagnostics.code === 'MCL_TICKETING_ERROR' && Boolean(diagnostics.category) && Boolean(diagnostics.causeCode);
}

function timeoutContractMatches(response) {
  const diagnostics = failureDiagnostics(response);
  if (diagnostics.category !== 'timeout') return null;
  return response.status === 504 && diagnostics.causeCode === 'MCL_UPSTREAM_TIMEOUT';
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const workerBase = String(report.workerBase || process.env.HK_CINEMA_WORKER_URL || '').replace(/\/$/, '');
const movieSetId = report?.providers?.mcl?.sampleMovie?.sourceId || null;

let ticketing = null;
if (workerBase && movieSetId) {
  ticketing = await requestJson(
    `${workerBase}/api/mcl/ticketing?movieSetId=${encodeURIComponent(movieSetId)}`,
    30000
  );
}

const revalidation = ticketing
  ? {
      checkedAt: new Date().toISOString(),
      expectedCommit,
      movieSetId: String(movieSetId),
      reachable: ticketing.reachable,
      ok: ticketing.ok && ticketing.body?.ok === true,
      status: ticketing.status,
      latencyMs: ticketing.latencyMs,
      cacheControl: ticketing.cacheControl,
      requestId: ticketing.requestId,
      serverTiming: ticketing.serverTiming,
      sessions: Array.isArray(ticketing.body?.data?.sessions)
        ? ticketing.body.data.sessions.length
        : 0,
      diagnostics: failureDiagnostics(ticketing),
      diagnosticsContractPresent: has10R2DDiagnostics(ticketing),
      timeoutContractMatches: timeoutContractMatches(ticketing)
    }
  : {
      checkedAt: new Date().toISOString(),
      expectedCommit,
      movieSetId: movieSetId ? String(movieSetId) : null,
      reachable: false,
      ok: false,
      status: null,
      latencyMs: null,
      cacheControl: null,
      requestId: null,
      serverTiming: null,
      sessions: 0,
      diagnostics: {
        code: null,
        category: null,
        causeCode: null,
        upstreamStatus: null,
        elapsedMs: null,
        message: movieSetId ? 'Worker base URL unavailable' : 'No representative MCL movie in base validation report'
      },
      diagnosticsContractPresent: false,
      timeoutContractMatches: null
    };

report.phase = '10R2E';
report.deployment = {
  ...(report.deployment || {}),
  expectedCommit,
  productionRevalidation: revalidation
};
report.notes = [
  ...(Array.isArray(report.notes) ? report.notes : []),
  'Phase 10R2E verifies the already-deployed production Worker; it does not deploy or mutate provider state.',
  'A successful MCL response is valid evidence too; on failure, 10R2D diagnostic fields must identify the upstream failure class.'
];

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const summary = [
  '## HK Cinema Phase 10R2E production re-validation',
  '',
  `- Expected production commit: \`${expectedCommit || 'unknown'}\``,
  `- MCL sample movieSetId: \`${revalidation.movieSetId || 'n/a'}\``,
  `- MCL ticketing: **${revalidation.ok ? 'healthy' : 'not healthy'}** (HTTP ${revalidation.status ?? 'n/a'}, ${revalidation.latencyMs ?? 'n/a'} ms)`,
  `- 10R2D diagnostics contract present: **${revalidation.diagnosticsContractPresent ? 'yes' : 'no'}**`,
  `- Failure category: \`${revalidation.diagnostics.category || 'n/a'}\``,
  `- Cause code: \`${revalidation.diagnostics.causeCode || 'n/a'}\``,
  `- Timeout 504 contract: **${revalidation.timeoutContractMatches === null ? 'not applicable' : revalidation.timeoutContractMatches ? 'matches' : 'mismatch'}**`,
  '',
  `Updated structured report: \`${reportPath}\``
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, 'utf8');
}

console.log(summary);
