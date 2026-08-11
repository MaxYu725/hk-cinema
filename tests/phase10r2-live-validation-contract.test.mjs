import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

const [workflow, script, pagesWorkflow] = await Promise.all([
  read('.github/workflows/live-provider-validation.yml'),
  read('scripts/live-production-validation.mjs'),
  read('.github/workflows/pages.yml')
]);

test('Phase 10R2C live validation remains an explicit diagnostic workflow', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.doesNotMatch(workflow, /\n\s*schedule:/);
  assert.match(workflow, /Upload live validation report/);
  assert.match(workflow, /retention-days: 7/);
});

test('Phase 10R2C checks the deployed probe route and representative provider flows', () => {
  assert.match(script, /\/api\/providers\/probe/);
  assert.match(script, /\/api\/broadway\/movies/);
  assert.match(script, /\/api\/broadway\/shows\//);
  assert.match(script, /MCLWebAPI2\/GetNCF\.aspx\?l=1/);
  assert.match(script, /\/api\/mcl\/ticketing/);
  assert.match(script, /\/api\/mcl\/shows\//);
  assert.match(script, /\/api\/emperor\/movies/);
  assert.match(script, /\/api\/emperor\/shows\//);
});

test('Phase 10R2C does not make live upstream reachability a normal Pages CI dependency', () => {
  assert.doesNotMatch(pagesWorkflow, /live-production-validation/);
  assert.doesNotMatch(pagesWorkflow, /providers\/probe/);
  assert.match(script, /diagnostic only/);
  assert.match(script, /intentionally exits successfully/);
});
