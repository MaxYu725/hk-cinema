# M6D Checkpoint 2D — final duplicate-request / coalescing audit

Date: 2026-08-12 repository time

Baseline:

- branch base: `6a4ee676741381f61ce1fd7007815061e93d25cf` (docs-only tracker)
- authoritative parent application checkpoint: `61ebe11222cc0bad03c0433625bb0f6e44cf4002`
- Metro remains production default
- Classic remains available through `?skin=classic`
- no real fourth provider is added

## Scope

Included:

- final cross-consumer duplicate-request audit after M6D 2A–2C
- verify whether a generic or provider-specific in-flight coalescer is actually justified
- verify showtime cache correctness at the application-payload boundary
- prepare the network side of the M6 expansion gate

Excluded:

- seat-map redesign
- provider parser rewrites
- adding a fourth cinema chain
- speculative global request middleware

## Request ownership reviewed

### Home catalogue

The normal successful cold home path remains the 2A boundary:

- Broadway: two catalogue requests (`movies` + `upcoming`)
- MCL: one catalogue request on the success path, with retry only after failure
- Emperor: two catalogue requests (`movies` + `upcoming`)

MCL and Emperor status owners both retain `refreshInFlight` re-entry guards. Data Health disables the shared refresh button while any provider remains in the active loading window, so the current Broadway home owner is not normally re-entered by repeated user clicks during an active refresh.

Phase 8A aggregate decoration remains synchronous and does not call a generic asynchronous `getCatalogue()` per card.

### Home card → comparison vs provider detail

Phase 8A owns the home-card capture-phase click/keyboard path. It calls `preventDefault()`, `stopPropagation()` and `stopImmediatePropagation()` before opening the aggregate comparison.

Therefore a normal home-card click does not also fall through to the original Broadway/MCL/Emperor detail handlers. There is one showtime owner for that interaction: the comparison lifecycle.

Provider detail runtimes remain available as separate explicit consumers, but they are not started alongside comparison by the same captured home-card event.

### Comparison and adjacent-date prefetch

Foreground comparison requests already own a request-cycle AbortController and token. Movie/date/close changes supersede the old foreground cycle.

Adjacent-date prefetch owns a separate AbortController and receives lifecycle events. Open, close, date-change and reload cancel scheduled work and abort already-started abortable prefetch before the next lifecycle owner proceeds.

As a result, moving from a prefetched adjacent date into foreground ownership does not require a shared transport promise: the old prefetch lease is cancelled first and the foreground request becomes the sole active owner.

### Shared showtime caches

Broadway and Emperor Worker showtime responses share the main 60-second cache. MCL ticketing shares the main 90-second cache, with complete initial results aliased to their resolved date. MCL comparison bulk has its own bounded 90-second snapshot cache inside the main MCL owner.

These caches cover the important sequential duplicate cases without moving live data into the Service Worker shell.

## Why no generic in-flight coalescer was added

A global shared in-flight map would need subscriber-aware cancellation semantics because foreground comparison, provider detail and prefetch each have independent AbortSignals. Reusing the first caller's transport signal would let one consumer cancel work still needed by another; ignoring caller signals would regress the cancellation work completed in 2B/2C.

The final request graph does not demonstrate a normal product path where two independent active consumers require the same movie/date resource at the same time:

- home card capture prevents simultaneous detail + comparison ownership;
- date-change/reload cancels adjacent-date prefetch before new foreground ownership;
- status refresh owners are re-entry guarded;
- sequential duplicate showtime requests are covered by the existing bounded caches and resolved-date aliases.

Therefore 2D deliberately does **not** add a generic in-flight coalescer. Add one later only if telemetry or a reproducible feature path demonstrates real same-key concurrent demand and subscriber-aware cancellation is implemented with it.

## Cache-correctness finding fixed in 2D

The Broadway/Emperor Worker showtime cache previously treated HTTP `response.ok` as sufficient for a 60-second cache entry.

The Worker can still return HTTP 200 with an application payload such as `{ ok: false, error: ... }`. Persisting that snapshot meant a provider-detail retry could re-read the same application error instead of reaching the Worker again.

2D keeps the existing immediate snapshot reuse behavior but validates the snapshot body after capture:

- persistent cache eligibility requires `payload.ok === true`;
- `payload.data` must exist and be an object;
- invalid JSON, `ok:false`, or missing data evicts that exact cache entry immediately;
- a subsequent retry therefore reaches the Worker again;
- after recovery, the successful payload still uses the normal 60-second cache and resolved-date alias behavior.

This is a cache-correctness change, not a change to provider fan-out or TTL.

## Service Worker boundary

Unchanged: cinema APIs, MCL endpoints, Worker live data and all other cross-origin live traffic remain outside the PWA static shell cache. Only same-origin application shell/static assets are eligible for the Service Worker cache strategy.

## Regression coverage

2D adds/updates coverage for:

- HTTP 200 + `ok:false` Worker showtime payloads are evicted and can recover on the next request;
- successful recovered payloads remain cacheable;
- production cache-bust uses `provider-compare-main-cache-v3.js?v=m6d2d`;
- Phase 8A capture-phase ownership prevents a single home-card interaction from falling through to provider detail;
- MCL and Emperor status refresh owners retain re-entry guards;
- Data Health keeps the shared refresh control disabled while loading;
- adjacent-date prefetch remains lifecycle-abortable;
- live cinema/API traffic remains outside the Service Worker shell cache;
- no generic global in-flight request map is introduced.

## Checkpoint result / expansion-gate preparation

After 2D, the M6D network/concurrency checklist is ready to close if branch and merged-main regression/mobile/Pages checks remain green.

The next bounded work should be the **M6 expansion gate** rather than another network-refactor checkpoint:

1. real-device check of Metro home, comparison, filters and seat-map;
2. confirm Classic fallback still works through `?skin=classic`;
3. record final current-main / known-limitations / provider-onboarding handoff;
4. close issue #66 only after those exit checks are complete.

Do not start a real fourth provider before that gate is recorded as complete.
