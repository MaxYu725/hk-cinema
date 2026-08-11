# Phase 10R2D — Failure Diagnostics & MCL Observability

## Baseline

- Base commit: `94cf2d318afd7ddfeb8974f0a5a9f3c6c456c0b5`
- Scope: diagnostic classification and MCL Worker error observability only
- Product UI / PWA / Smart Picks: unchanged

## Evidence from 10R2C

Two live validation runs from different US-hosted GitHub runner regions produced the same result:

- Broadway representative flow: healthy
- Emperor representative flow: healthy
- MCL browser catalogue: healthy
- MCL Worker ticketing: HTTP 502 after about 10 seconds
- MCL provider probe: failed at the 4.5-second deadline but was reported as `upstream_error`

The MCL result is still treated as network/path-sensitive evidence rather than proof of a parser regression because the successful Hong Kong user path must not be rewritten around VPN/non-Hong-Kong failures.

## 10R2D changes

### Provider probe timeout truth

`worker/src/provider-probe.js` now treats an already-aborted probe signal as authoritative timeout evidence.

This fixes runtime differences where `AbortController.abort(reason)` can cause `fetch()` to reject with a `TypeError` or another runtime-specific error instead of an `AbortError`.

Expected failure result:

- category: `timeout`
- code: `PROBE_TIMEOUT`
- status: `504`

### MCL ticketing failure classification

`worker/src/providers/mcl-ticketing.js` now wraps failures from the existing MCL WebAPI ticketing implementation without changing that implementation's normal request flow.

The public API code remains `MCL_TICKETING_ERROR`. Additional diagnostics distinguish:

| Category | Cause code | Worker status |
|---|---|---:|
| timeout | `MCL_UPSTREAM_TIMEOUT` | 504 |
| blocked | `MCL_UPSTREAM_HTTP_ERROR` | 502 |
| rate_limited | `MCL_UPSTREAM_HTTP_ERROR` | 502 |
| http_error | `MCL_UPSTREAM_HTTP_ERROR` | 502 |
| invalid_payload | `MCL_UPSTREAM_INVALID_PAYLOAD` | 502 |
| network_error | `MCL_UPSTREAM_NETWORK_ERROR` | 502 |
| upstream_error | `MCL_UPSTREAM_ERROR` | 502 |

A long runtime-specific `TypeError` at the existing roughly 10-second MCL fetch deadline is classified as timeout. A short `TypeError` remains a network error.

### MCL Worker response

`/api/mcl/ticketing` failure responses now expose:

- stable `code: MCL_TICKETING_ERROR`
- `category`
- `causeCode`
- `upstreamStatus` when an upstream HTTP response exists
- `elapsedMs`

Timeout returns HTTP 504. Other upstream failures return HTTP 502. Failure responses are explicitly `cache-control: no-store`.

## Explicitly unchanged

- MCL WebAPI endpoints
- MCL retry count and request timeouts
- MCL parsing and normalization
- price enrichment
- seat-map loading
- Broadway and Emperor provider logic
- movie aggregation and comparison
- Smart Picks
- homepage/comparison UI
- Service Worker / PWA update lifecycle

## Tests

Deterministic coverage verifies:

- an aborted provider probe is classified as timeout even when the mocked runtime rejects with `TypeError('invalid_argument')`
- MCL timeout, blocked, rate-limited, generic HTTP, invalid-payload and network failures remain distinct
- the public MCL error code remains stable
- Worker failures preserve diagnostic fields and use 504 only for timeout
- MCL failure responses remain `no-store`

No external cinema network is added to the normal regression gate.

## Deployment boundary

The repository's normal GitHub Pages workflow still deploys only `app/`. Phase 10R2D therefore does not claim that the production Cloudflare Worker has changed merely because repository CI succeeds. Production live validation of the new 504/category behavior requires the separate Worker deployment path to publish the merged Worker source.

## Recommended next checkpoint

After the Worker build containing 10R2D is deployed, run the existing Live Provider Validation workflow again. The expected non-Hong-Kong MCL failure should become explicitly diagnosable as `timeout`, `network_error`, `blocked`, or another concrete category instead of an ambiguous `upstream_error`.
