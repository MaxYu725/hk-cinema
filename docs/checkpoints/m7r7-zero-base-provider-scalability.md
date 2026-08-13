# M7R7 — Zero-Base Provider Scalability Deep Scan

## Objective

Repeat the provider-expansion audit from a zero-base position after M7R6. Do not assume any earlier cleanup is sufficient. Review the active production dependency graph for hidden assumptions that the provider universe is exactly Broadway, MCL and Emperor, then prove the shared runtime against an eight-provider fixture.

## Audit method

The scan followed the actual production owners loaded by `app/index.html` and the Worker entrypoint configured by `worker/wrangler.jsonc`, rather than treating retired repository files as active runtime.

Four risk classes were checked:

1. hard-coded provider counts, array indices and loop bounds;
2. provider-name conditional dispatch in shared owners;
3. fixed provider fields in API/cache/health payloads;
4. functional and complexity behaviour with eight registered providers.

## Findings and changes

### 1. Hard-coded count and array-bound assumptions

No active shared owner was found indexing a provider array with a fixed third-provider boundary such as `[2]`, `[3]`, `i < 3`, or equivalent provider-count loops.

The following numeric literals were reviewed and classified as feature counts rather than provider counts:

- Metro `3x3` filter presentation: nine filter dimensions, not three providers;
- Smart Picks maximum of four recommendation cards: recommendation count, not provider count;
- cache entry caps and request timeouts: resource limits independent of provider identity.

No change was made to these unrelated feature constraints.

### 2. Provider-name dispatch in shared runtime

Three real decoupling risks remained in the initial scan, followed by one additional seat-map adapter gap found while exercising the new gates.

#### Comparison engine

`provider-compare-v4.js` selected MCL transport and Broadway/MCL/Emperor session normalizers through provider-name conditionals.

It now owns a `COMPARISON_ADAPTERS` lookup and an optional `HKCinemaProviders[provider].comparison` extension hook. Shared fetch/normalization/reuse code resolves behaviour through the adapter instead of a three-provider `if` chain.

Provider-specific normalizers remain because their upstream semantics genuinely differ.

#### Shared ViewModel seat-map request

`view-models.js` built seat-map requests through three sequential `providerId === ...` branches.

Request builders are now stored in `SEAT_MAP_REQUEST_BUILDERS`. A future seat-map capable provider can supply its own `HKCinemaProviders[provider].seatMapRequest` hook; an unsupported or missing adapter still fails closed instead of inheriting another provider's request schema.

#### Raw seat-map ViewModel adapter

The first pass made request construction extensible, but further review found that a future seat-map provider would still need the shared ViewModel owner edited to translate its raw layout.

`view-models.js` now combines the built-in adapter lookup with an optional provider-owned runtime hook:

```text
HKCinemaProviders[provider].viewModels
```

A future provider can therefore own both its request builder and its raw seat-map-to-ViewModel adapter without adding another provider-name branch to the shared owner. Existing Broadway/MCL/Emperor seat geometry adapters remain provider-specific by design.

#### Comparison cache

`provider-compare-main-cache-v3.js` had generic per-provider buckets but still encoded MCL transport selection in shared conditionals and exposed legacy Broadway/MCL/Emperor diagnostic columns.

It now resolves exceptional cache behaviour through `CACHE_ADAPTERS` / optional `comparisonCache` hooks. The canonical diagnostic shape is only:

```text
providers.<providerId>.entries
providers.<providerId>.ttlMs
```

The old fixed `broadwayEntries`, `mclEntries`, `emperorEntries` columns were removed.

### 3. Worker API / schema / cache structure

No database, migration or D1/KV schema is present in the current project, so there is no three-provider database table to migrate in this checkpoint.

A real API schema drift risk did exist in `/health`: the provider object was separately hard-coded in `worker/src/index.js`, while provider probe support was maintained elsewhere.

A new `worker/src/provider-manifest.js` is now the Worker-side provider universe. It owns provider IDs and service descriptors and supplies:

- `/health` provider fields;
- the default provider-probe allow-list;
- an eight-provider-testable manifest factory.

A manifest provider without a probe adapter fails explicitly during runner construction rather than disappearing silently.

CI also caught an unrelated backward-compatibility regression introduced during this refactor: `/health.phase` had temporarily changed from its established `6G` telemetry value. That change was unnecessary and has been reverted; the provider map is dynamic while the existing health telemetry contract remains intact.

The current Worker route stack remains provider-specific (`index-emperor-seat.js -> index-emperor.js -> index.js`). This is classified as adapter composition rather than a provider-count boundary. Replacing the entire route stack with a generic router would be a much larger production-risk change and is not required to prove eight-provider shared-runtime scalability.

### 4. Eight-provider scalability gate

`tests/m7r7-zero-base-provider-scalability.test.mjs` creates eight providers with IDs unrelated to the current three and verifies:

- Shared Core enumerates all eight and stores eight independent catalogue snapshots;
- comparison creates source/error/date state for all eight;
- generic showtime transport reaches all eight provider routes without inventing Broadway/MCL/Emperor requests;
- a future provider can replace comparison transport through an adapter hook;
- comparison cache creates eight independent buckets and clears one without clearing the others;
- fixed three-provider cache diagnostic fields are absent;
- a future seat-map capable provider can supply its own request builder;
- Worker manifest and health-map generation handle eight providers and reject duplicate IDs;
- static guards reject reintroduction of the removed shared three-provider conditional patterns.

`tests/m7r7-future-seatmap-viewmodel-adapter.test.mjs` separately proves that a future provider can own both `seatMapRequest` and `viewModels.seatMap` hooks, including raw seat-map ViewModel conversion, without editing the shared provider dispatch.

The existing M6D presentation/cache guard was also retained; M7R7 does not reduce historical regression coverage in order to pass the new scalability gate.

## Complexity / performance assessment for 7–8 providers

The shared catalogue and state surfaces are Map/Object iterations over the registered provider list. Eight providers do not create an array-bound or schema failure.

Comparison initial loading intentionally fans active providers out concurrently with `Promise.allSettled`; provider failures remain isolated. Adding providers therefore increases upstream request fan-out approximately linearly with the number of active provider/source pairs rather than through a combinatorial provider cross-product.

Home aggregation performs provider/catalogue scans plus Map-based movie grouping. At eight providers this remains bounded by provider count times catalogue size. No provider-pair nested comparison was found in the active home path.

Caches are independent per provider in the main comparison cache. Each bucket retains its existing bounded entry cap, so adding providers increases the theoretical aggregate cache ceiling linearly. No shared fixed-three cache slot can be overwritten by provider 4–8.

A future optimization checkpoint may add concurrency budgeting if real provider count and upstream latency justify it. This audit does not add throttling pre-emptively because doing so would alter current comparison latency/lifecycle behaviour without evidence of a bottleneck.

## Explicitly retained provider-specific adapters

The following provider-name code is intentional and is not a provider-universe gate:

- Broadway/MCL/Emperor upstream parsers and route schemas;
- MCL ticketing, price and lazy seat enrichment;
- provider-specific seat-map geometry normalization;
- provider-specific booking/source URL translation;
- provider probe implementation details.

These components translate external schemas. They may be registered in lookup tables but should not be forced into one fake common upstream schema.

## Non-goals

- no CineArt production registration;
- no new live provider or Worker upstream route;
- no UI redesign;
- no Service Worker or PWA lifecycle change;
- no wholesale Worker router rewrite;
- no genericization of real upstream schema differences.

## Merge gate

Merge only after the exact PR head passes:

1. full Node regression suite including the eight-provider gate and retained historical guards;
2. Chromium installation;
3. mobile browser smoke.

After squash merge, verify merged-main regression, mobile smoke and Pages deployment again.
