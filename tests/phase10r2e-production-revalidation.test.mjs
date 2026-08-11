import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const [workflow, script, pagesWorkflow] = await Promise.all([
  read('.github/workflows/live-provider-validation.yml'),
  read('scripts/phase10r2e-production-revalidation.mjs'),
  read('.github/workflows/pages.yml')
]);

test('Phase 10R2E revalidates the already-deployed production Worker', () => {
  assert.match(workflow, /HK_CINEMA_EXPECTED_COMMIT/);
  assert.match(workflow, /github\.event\.pull_request\.base\.sha \|\| github\.sha/);
  assert.match(workflow, /phase10r2e-production-revalidation\.mjs/);
  assert.match(workflow, /Re-validate deployed 10R2D diagnostics/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN/);
});

test('Phase 10R2E records stable MCL diagnostic fields without making provider health a gate', () => {
  assert.match(script, /readFile\(reportPath/);
  assert.match(script, /\/api\/mcl\/ticketing\?movieSetId=/);
  assert.match(script, /expectedCommit/);
  assert.match(script, /MCL_TICKETING_ERROR/);
  assert.match(script, /MCL_UPSTREAM_TIMEOUT/);
  assert.match(script, /diagnosticsContractPresent/);
  assert.match(script, /timeoutContractMatches/);
  assert.match(script, /cacheControl/);
  assert.match(script, /requestId/);
  assert.match(script, /category/);
  assert.match(script, /causeCode/);
  assert.match(script, /upstreamStatus/);
  assert.match(script, /elapsedMs/);
  assert.match(script, /report\.phase = '10R2E'/);
  assert.doesNotMatch(script, /process\.exit\(1\)/);
});

test('Phase 10R2E leaves normal Pages CI independent from live provider reachability', () => {
  assert.doesNotMatch(pagesWorkflow, /phase10r2e-production-revalidation/);
  assert.doesNotMatch(pagesWorkflow, /hk-cinema-api\.max-yu-jp\.workers\.dev/);
  assert.doesNotMatch(pagesWorkflow, /mclcinema\.com/);
});
