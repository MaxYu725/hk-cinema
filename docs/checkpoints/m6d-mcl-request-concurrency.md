# M6D Checkpoint 2C — MCL request concurrency + duplicate-request audit

Date: 2026-08-12 repository time

Baseline:

- branch base: `a4a15462b30d957b637b0c912ac968d3e4d4d74e` (docs-only tracker)
- authoritative parent application checkpoint: `c189cbb52c48321b96a90f3c9ecb639bc2a85cbc`
- Metro remains production default
- Classic remains available through `?skin=classic`
- no real fourth provider is added

## Scope

Included:

- inventory MCL primary metadata, price, bulk and seat-summary concurrency
- bound/reduce duplicated comparison price requests before provider count grows
- make the comparison MovieSet bulk sidecar lifecycle-cancellable and timeout-cancellable
- prevent initial → resolved-date bulk duplication
- keep lazy price and lazy seat enrichment bounded and viewport-driven
- preserve the MCL movie-detail price fallback outside comparison

Excluded:

- seat-map redesign
- changing Broadway or Emperor request behavior
- broad parser rewrite
- a real new provider

## Before 2C

The MCL comparison path had four enrichment layers:

1. WebAPI2 base discovery requested list/grid/show-days/cinema-map in parallel.
2. WebAPI2 selected-session metadata enrichment used a bounded 8-worker pool for `GetSessionInfo.aspx`.
3. The same WebAPI2 implementation then used another 8-worker pool to request `GetPrice.aspx` eagerly for as many as 40 sessions.
4. Separately, the MovieSet bulk wrapper started one bulk sidecar and the rendered comparison later had a lazy-price owner capped at four concurrent `GetPrice.aspx` requests near the viewport.

Seat summaries were already separate and bounded at two concurrent lazy requests.

The resulting comparison price ownership was redundant: the app had both a one-shot bulk price source and a viewport-driven lazy price source, but retained the older whole-selection eager per-session price network path.

The old bulk timeout also used `Promise.race()`. It stopped waiting after 4.5 seconds but did not abort the underlying MovieSet request, and it had no parent comparison AbortSignal.

## 2C request ownership

### Session metadata

WebAPI2 remains the foreground metadata owner. Its `GetSessionInfo.aspx` work stays bounded at eight concurrent requests because language/house metadata is needed by comparison/filter presentation.

2C deliberately does not rewrite this parser/enrichment path.

### Comparison prices

Comparison price network ownership is now:

- one best-effort MovieSet bulk sidecar for a movie/date, cached for 90 seconds;
- then the existing lazy-price runtime for any still-missing MCL prices near the viewport, capped at four concurrent requests and cached per session for five minutes.

The older WebAPI2 eager `GetPrice.aspx` request signature is retired only while a comparison/prefetch call is active. Comparison and prefetch calls already carry an `AbortSignal`; that existing lifecycle contract is used to scope the policy.

Within such a comparison cycle, requests carrying the legacy WebAPI2 `Accept` signature are answered locally with an empty price payload instead of reaching MCL. The lazy-price runtime uses a different request signature and remains network-active, including while an adjacent-date prefetch is running.

This avoids a risky rewrite of the mature MCL parser while removing the actual up-to-40-request eager comparison price fan-out.

### Movie detail fallback

MCL movie-detail loads do not pass the comparison lifecycle signal. They therefore bypass the comparison bulk/suppression policy and retain the original WebAPI2 per-session price path.

This is intentional: the lazy-price runtime observes comparison cards only, so detail views still need the WebAPI2 price fallback when MovieSet data is unavailable. The automated PR review explicitly caught this boundary and regression coverage now protects it.

### Seats

The existing lazy seat-summary owner remains unchanged:

- at most two concurrent requests;
- per-session dedupe/cache;
- viewport-driven observation;
- lifecycle cancellation.

No seat-map behavior changes in 2C.

## MovieSet bulk sidecar

`mcl-ticketing-bulk-enrichment.js` no longer relies on an uncancelled `Promise.race()` timeout in production comparison flows.

For comparison/prefetch calls, the production bulk path now:

- performs one direct `services.mclcinema.com/Ticketing/MovieSet` request;
- owns an AbortController;
- propagates the parent comparison AbortSignal;
- aborts the actual request after 4.5 seconds;
- normalizes only the MovieSet fields needed for conservative SessionID-based merge;
- never adds sessions that the primary WebAPI2 path did not return;
- never overwrites a primary price that is already present.

A restricted test fallback can supply `window.__HKCinemaMCLLegacyBulkGetter` when browser fetch is unavailable; normal production comparison uses the directly cancellable MovieSet path.

No-signal/detail calls do not start this bulk sidecar.

## Cache and wrapper ownership

Production load order is now:

`WebAPI2 → hybrid fallback → comparison bulk merge → main comparison cache`.

This makes the 90-second MCL main cache the outermost owner. A comparison main-cache hit therefore returns the already-merged MCL result without entering the bulk sidecar again.

The bulk layer also keeps a small 90-second in-memory cache for comparison calls that do reach it. Successful MovieSet snapshots are stored by movie/date and an initial request is aliased to the payload's resolved selected date. Therefore the common initial-discovery → automatic selected-date transition does not start a second MovieSet request for the same resolved day.

Both caches remain local application/runtime caches. Live MCL data is not placed in the Service Worker shell cache.

## Resulting comparison concurrency boundary

For one active MCL comparison movie/date:

- base WebAPI2 discovery remains bounded by its existing fixed request set;
- session metadata: maximum 8 concurrent;
- bulk MovieSet: maximum one sidecar per uncached comparison call, with outer main-cache reuse, 90-second successful bulk reuse and true lifecycle/timeout cancellation;
- eager per-session comparison price network fan-out: retired;
- lazy price: maximum 4 concurrent;
- lazy seat summary: maximum 2 concurrent.

MCL detail remains outside this comparison-specific optimization and preserves its previous WebAPI2 price fallback.

This is a materially safer provider-expansion boundary than allowing comparison metadata + up-to-40 eager prices + bulk + lazy prices to overlap.

## Regression coverage

`tests/m6d-mcl-concurrency.test.mjs` and the updated bulk regression lock:

- the legacy eager WebAPI2 `GetPrice` signature does not reach native fetch during comparison;
- no-signal/detail calls retain the WebAPI2 price fallback and do not start the comparison bulk sidecar;
- the lazy-price request signature is not blocked;
- WebAPI2/hybrid/bulk/main-cache production ownership order;
- initial MovieSet bulk data aliases to the resolved date and avoids a second sidecar request;
- bulk uses AbortController/parent signal and no longer uses `Promise.race()` timeout semantics;
- metadata remains bounded at eight;
- lazy price remains capped at four;
- lazy seat summary remains capped at two;
- the changed bulk runtime is cache-busted in production HTML.

Existing `mcl-lazy-prices` regressions remain applicable.

## Remaining network/concurrency work

Checkpoint 2C closes the known MCL comparison price/bulk amplification issue without changing provider parsers or seat-map behavior, while preserving the detail price fallback.

The remaining broad M6D network item is to verify whether any cross-consumer duplicate requests outside these audited home/comparison/MCL enrichment paths still warrant coalescing. Avoid adding generic global coalescing unless a concrete duplicate path is demonstrated.

Next bounded step after 2C should be a short **M6D Checkpoint 2D — final duplicate-request/coalescing audit + expansion gate preparation**, not a new provider integration.
