# M6D Checkpoint 2B — comparison/showtime request fan-out + cancellation audit

Date: 2026-08-11 / 2026-08-12 repository time

Baseline:

- latest `main` at branch creation: `0d3b23549a1424ed063e8ba4c9ae30783903c6e5`
- authoritative parent application checkpoint: `b06a33ef92d57aac38b0d23215a3c180057e11cf`
- Metro remains production default
- Classic remains available through `?skin=classic`
- no real fourth cinema provider is added in this checkpoint

## Scope

Included:

- inventory foreground comparison/showtime request fan-out
- audit the initial discovery request followed by automatic preferred-date loading
- verify movie/date/close cancellation and stale-response rejection
- restore MCL AbortSignal propagation through the comparison main-cache wrapper
- make adjacent-date prefetch abortable when comparison lifecycle changes
- prove comparison filter decoration remains presentation-only and does not start provider requests

Deferred:

- tuning MCL per-session metadata/price enrichment concurrency
- redesigning or removing MCL bulk enrichment
- full cross-consumer in-flight request coalescing
- seat-map and lazy seat-summary concurrency
- any real fourth provider integration

## Foreground comparison fan-out

`provider-compare-v4.js` owns the foreground comparison request cycle.

For a movie aggregate, `providerSourceIds(provider)` may return one or more source IDs per provider. `fetchProvider()` requests all source IDs for that provider with `Promise.allSettled`, and `loadInitial()` requests all active providers in parallel with another `Promise.allSettled`.

Therefore the foreground logical request count is source-shaped rather than fixed to three:

- Broadway: one Worker `/api/broadway/movies/:sourceId/shows` request per Broadway source ID.
- Emperor: one Worker `/api/emperor/movies/:sourceId/shows` request per Emperor source ID.
- MCL: one logical `getTicketing(sourceId, date)` call per MCL source ID; that logical call can fan out internally because MCL uses browser WebAPI2, optional Worker fallback and enrichment helpers.

Provider/source failures stay isolated: a failed source does not cancel successful sibling sources, and a failed provider does not prevent successful providers from rendering.

## Duplicate foreground finding — initial discovery then preferred date

The comparison flow intentionally starts with `date = null` so each provider can return its available dates and default `selectedDate`. After those results arrive, the UI chooses a preferred common date and calls the date loader.

Before this checkpoint, the comparison main cache treated these as unrelated keys:

- `/shows`
- `/shows?date=YYYY-MM-DD`

and MCL similarly used separate `initial` and explicit-date keys.

When the provider's initial response had already resolved to the same preferred date, the second request repeated data that was already present.

### Correction

`provider-compare-main-cache-v3.js` now aliases a successful initial Broadway/Emperor response to the response's validated `data.selectedDate` URL. The subsequent preferred-date request can therefore reuse the exact response snapshot without another native Worker fetch.

The MCL main cache now likewise stores an initial result under its validated `selectedDate` key. This prevents the inner primary hybrid/WebAPI2 path from being fetched again when the automatic preferred date is the same date already resolved by the initial request.

A refetch remains intentional when a provider/source resolves a different default date from the selected preferred date.

### MCL boundary

The current MCL bulk-enrichment wrapper sits outside the main comparison cache and starts its own bulk sidecar request. That sidecar is not removed or redesigned in 2B. The main MCL transport cache is now deduplicated, but the outer bulk enrichment path remains part of the next dedicated MCL concurrency/duplicate-request checkpoint.

## Cancellation and stale-response behavior

### Foreground comparison

The existing request-cycle contract is sound and is now regression-locked:

- opening a new movie starts a new request token and aborts the previous controller;
- selecting another date starts a new request cycle and aborts the prior one;
- closing the comparison aborts the active controller and advances the token;
- date results are ignored unless token, signal, current match and selected date still match;
- initial results are ignored unless token, signal and current match still match.

Broadway and Emperor Worker requests already receive a child AbortSignal.

MCL's hybrid/WebAPI2 transport also supports an options signal, but production cancellation was partially broken by `provider-compare-main-cache-v3.js`: its wrapper accepted only `(movieSetId, selectedDate)` and silently dropped the third `options` argument.

2B changes the cache wrapper to accept and forward `options`, reject already-aborted calls before transport work starts, and avoid caching a result after the caller signal has been aborted.

### Adjacent-date prefetch

`provider-compare-prefetch.js` previously cancelled only idle/timer work that had not started. Once adjacent-date prefetch began, movie/date/close/reload lifecycle changes only advanced a generation number; already-started provider requests could continue.

2B adds an active AbortController for the prefetch cycle and passes its signal through the main-cache prefetch helpers. `open`, `close`, `date-change`, `reload`, hidden-overlay and document-hidden cancellation now abort already-started Broadway/Emperor prefetch and the abortable portion of MCL prefetch.

Known MCL limitation: the separately captured bulk-enrichment sidecar does not yet accept a parent AbortSignal, so one already-started MCL bulk request can still finish after its comparison cycle is obsolete. Its result cannot overwrite the active comparison because the foreground request token/state guards remain authoritative. This is explicitly deferred to the next MCL concurrency checkpoint.

## Filter behavior

The compact comparison filter layer is presentation-only. It decorates existing controls and updates open/closed UI state; it does not call `fetch()` or start provider showtime requests.

Changing provider/cinema/language/format/price/seat/sort filters therefore does not create a network cancellation race in this layer. Network lifecycle changes remain movie open, date change, retry/reload, close and adjacent-date prefetch.

## Regression coverage

`tests/m6d-comparison-fanout.test.mjs` locks:

- foreground request-token and AbortController stale-response guards in `provider-compare-v4.js`
- MCL comparison call passes a child AbortSignal
- initial Broadway response is reusable through its resolved-date cache alias without a second native fetch
- MCL main cache forwards the caller AbortSignal
- MCL initial result aliases to its resolved selected-date key
- already-aborted MCL requests do not reach the wrapped transport
- adjacent-date prefetch owns an AbortController and forwards its signal to Broadway/MCL/Emperor helpers
- comparison compact filter decoration contains no network fetch
- changed network helper scripts are cache-busted in `index.html`

## Checkpoint conclusion

Comparison foreground fan-out is now explicit and source-shaped rather than assumed to be one request per provider.

The initial discovery → preferred-date transition no longer needs a second native Broadway/Emperor Worker request when the initial selected date already matches. The MCL main transport cache gains the same resolved-date alias, although its separate bulk-enrichment sidecar remains deliberately deferred.

Foreground stale responses were already guarded correctly; this checkpoint fixes the production MCL signal-forwarding gap and makes already-started adjacent-date prefetch cancellable.

## Next M6D batch

Continue with **M6D Checkpoint 2C — MCL lazy metadata/price/bulk request concurrency + remaining duplicate-request behavior**.

Do not broaden 2C into seat-map redesign or a new cinema provider unless a direct dependency is proven.