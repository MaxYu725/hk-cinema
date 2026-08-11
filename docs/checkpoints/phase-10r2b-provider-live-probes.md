# Phase 10R2B — Provider Live Probe Model

## Baseline

- Base commit: `89c97297217073c3e9d4de1cdb9dee90e59c9d5b`
- Scope: Worker/API provider probe model only
- UI / PWA / Smart Picks: unchanged

## Change

Phase 10R2B adds explicit live upstream probes without making normal application loading depend on probe success.

New routes:

- `GET /api/providers/probe`
- `GET /api/providers/probe/broadway`
- `GET /api/providers/probe/mcl`
- `GET /api/providers/probe/emperor`

The all-provider route runs the three probes independently and in parallel. One provider failure therefore remains a provider-level diagnostic result instead of aborting the other probes.

## Probe evidence

- Broadway: fetch the ticketing catalogue page and require the expected Next/movie structure.
- MCL: fetch the lightweight cinema directory endpoint and require non-empty JSON.
- Emperor: reuse the existing showing-catalogue probe rather than introducing a parallel parser.

## Reliability contract

- 4.5-second orchestration deadline per provider.
- Broadway/MCL network requests use `AbortController` at the deadline.
- Probe responses are `no-store`.
- Results expose latency, checked time, best-effort last-success time, structural evidence, and stable failure categories.
- `lastSuccessAt` is per Worker isolate and intentionally not presented as durable historical monitoring.
- Invalid provider names return `400 INVALID_PROVIDER`.
- A provider failure does not change the probe endpoint itself into a 5xx transport failure.
- Existing request telemetry (`x-request-id`, `server-timing`) still wraps the probe routes.

## Explicitly unchanged

- Broadway parser and show/seat requests
- MCL ticketing/price/seat logic
- Emperor production catalogue/show/seat parser behavior
- comparison fetching and freshness rules
- Smart Picks
- homepage/comparison UI
- Service Worker / PWA lifecycle

## Acceptance

- Node regression passes, including deterministic mocked probe tests.
- Chromium mobile smoke passes.
- Source-level test confirms no app JS/HTML file calls `/api/providers/probe`.
- PR remains a direct descendant of Phase 10R2A.

## Next checkpoint

Phase 10R2C should use the explicit probe model to perform controlled real-Hong-Kong-network validation of representative catalogue/show/price/seat/booking flows, without converting external provider reachability into a mandatory CI dependency.
