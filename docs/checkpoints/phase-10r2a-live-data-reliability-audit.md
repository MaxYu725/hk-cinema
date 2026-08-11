# Phase 10R2A — Live Data Reliability Audit

## Baseline

- Base commit: `27efcfc864b927f9ac3697850086e41b8daf0c59`
- Scope: provider reliability contracts and audit documentation only
- Product/UI logic: unchanged

## Audit findings

1. The production Worker is a three-layer route chain: `index-emperor-seat.js` → `index-emperor.js` → `index.js`.
2. The current `/health` response describes configured capabilities; it is not an upstream end-to-end health check.
3. Broadway, MCL and Emperor already use short cache boundaries for live show/seat data, while catalogue/upcoming data is cached longer.
4. MCL ticketing correctly falls back to `no-store` when metadata is incomplete.
5. Input validation exists for dates and provider-specific identifiers before upstream calls.
6. The outer Worker layer exposes `x-request-id` and `server-timing`, which should remain available for production diagnosis.
7. Direct live probing from the assistant runtime was attempted during this audit, but DNS resolution to the Worker host was unavailable. This is recorded as an audit-environment limitation, not a provider failure.

## Changes in 10R2A

- Expand `docs/provider-matrix.md` into the provider capability/reliability matrix.
- Add `tests/phase10r2-provider-contracts.test.mjs` to lock:
  - the production Worker entrypoint and route chain;
  - provider endpoint presence;
  - cache/no-store boundaries;
  - invalid-input guards;
  - health no-store behavior and telemetry headers.

## Explicitly unchanged

- Broadway/MCL/Emperor parsers and upstream requests
- showtime/price/seat normalization
- Smart Picks
- comparison UI
- Service Worker and PWA update behavior

## Next checkpoint

Phase 10R2B should add a safe, explicit provider-probe model that distinguishes service health from upstream data health without making normal page loads depend on probe success.
