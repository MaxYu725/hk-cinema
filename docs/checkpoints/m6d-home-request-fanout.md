# M6D Checkpoint 2A — home request fan-out + duplicate-request audit

Date: 2026-08-11 / 2026-08-12 repository time

Baseline:

- tracker `main`: `81ff59f1755eec8e0a568ff862d4eeed8edf2638`
- parent authoritative application checkpoint: `2aac1f171f20a822307e15889cc3892701e8de8e`
- Metro remains production default
- Classic remains available through `?skin=classic`
- no real fourth cinema provider is added in this checkpoint

## Scope

This is the first bounded part of M6D Checkpoint 2.

Included:

- inventory initial homepage provider-data request fan-out
- distinguish intentional provider endpoint fan-out from duplicate requests
- audit whether shared home aggregation can accidentally start provider requests
- verify live provider traffic remains outside the Service Worker shell cache
- add regression coverage for the fan-out boundary

Deferred:

- comparison/showtime request fan-out
- movie/date/filter cancellation and stale-response handling
- MCL lazy price/seat concurrency
- full duplicate-request/deduplication review across comparison/detail/seat paths

## Initial home success-path inventory

A normal cold/online home load starts five provider catalogue requests.

| Owner | Request | Count | Purpose |
| --- | --- | ---: | --- |
| Broadway `app.js` | `/api/broadway/movies` | 1 | current/presale catalogue |
| Broadway `app.js` | `/api/broadway/upcoming` | 1 | upcoming catalogue |
| MCL `mcl-status.js` → provider | `MCLWebAPI2/GetNCF.aspx?l=1` | 1 | MCL now/coming/festival catalogue in one payload |
| Emperor `emperor-status.js` → provider | `/api/emperor/movies` | 1 | current catalogue |
| Emperor `emperor-status.js` → provider | `/api/emperor/upcoming` | 1 | upcoming catalogue |

**Normal success-path total: 5 provider-data requests.**

This fan-out is currently intentional:

- Broadway upstream exposes current and upcoming as separate Worker surfaces.
- Emperor upstream adapter exposes current and upcoming as separate Worker surfaces and uses `Promise.allSettled` so one section can survive the other failing.
- MCL catalogue is already one combined upstream request.

MCL's provider-level catalogue helper can retry the same `GetNCF.aspx?l=1` request once after failure. That second attempt is failure recovery, not normal success-path fan-out, so a failure path can reach six requests before any user action.

## Cache-first behavior

MCL and Emperor status runtimes synchronously publish a valid local catalogue cache before starting their network refresh. Broadway likewise reads its local cache before its two Worker requests.

These local reads do not add network requests. They allow the home aggregation layer to render stale-but-usable data while refresh continues.

The Service Worker remains shell-only for this purpose. Its fetch handler returns without interception for cross-origin traffic, so Worker API, MCL and other live cinema requests are not added to the static PWA cache.

## Duplicate-request finding

### Fixed: synchronous Phase 8A aggregation could start hidden async provider requests

`phase8a-movie-navigation.js` runs synchronous catalogue/fact lookups while decorating movie cards. Before this checkpoint, its generic-provider fallback executed:

```js
adapter?.getCatalogue?.()
```

and only afterwards checked whether the return value was a Promise.

That means a future fourth provider with an async `getCatalogue()` could start a real network request even though Phase 8A immediately discarded the Promise. Because aggregate decoration can run for many cards and can be rescheduled after DOM/provider events, this was a provider-expansion fan-out multiplier.

Checkpoint correction:

- Phase 8A no longer invokes generic `getCatalogue()`.
- synchronous aggregation reads only an already-published `adapter.catalogue`, `getCachedCatalogue()` result, or the existing Broadway/MCL/Emperor in-memory snapshots.
- a future generic provider must publish a synchronous catalogue snapshot before shared movie-fact decoration consumes it.
- missing snapshot data does not invalidate the aggregate; card/provider identity and fallback release-date facts remain usable.

This keeps network ownership in provider loading/status adapters instead of DOM/presentation code.

## Existing same-owner guards

The MCL and Emperor status runtimes already have `refreshInFlight` guards. Multiple refresh-button events while their current status refresh is active therefore do not start duplicate catalogue refreshes from those status owners.

Broadway's initial home load is started once by `app.js`; the shared Data Health refresh state disables the UI refresh control while provider refresh records are loading. Provider-level/global coalescing beyond those current owners is intentionally left for the later duplicate-request review.

## Regression coverage

`tests/m6d-home-fanout.test.mjs` locks:

- Broadway home load to two catalogue endpoint calls
- MCL home status to one normal catalogue request owner
- Emperor home refresh to two intentional catalogue endpoint calls
- normal initial provider-data fan-out total of five
- MCL/Emperor status in-flight guards
- generic Phase 8A aggregation does not invoke async `getCatalogue()`
- published generic synchronous catalogue snapshots can still enrich aggregate facts
- live cinema traffic remains outside the Service Worker shell cache
- the changed Phase 8A runtime is cache-busted in `index.html`

## Checkpoint conclusion

Initial homepage provider fan-out is bounded and understandable at the current three-provider baseline. No existing success-path duplicate catalogue request was found among Broadway/MCL/Emperor owners.

One expansion-specific hidden request source in shared Phase 8A presentation was found and removed before adding a fourth provider.

## Next M6D batch

Continue Checkpoint 2 with **comparison/showtime request fan-out + cancellation/ignore-stale-response audit**. Do not add a real fourth provider yet.
