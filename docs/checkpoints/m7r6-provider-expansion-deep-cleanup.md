# M7R6 — Provider expansion deep cleanup

## Baseline

Deep scan performed against deployed `main` commit `b61276a066fc96230403773436e31de58358e1d8`, after M7R5 had already proved the primary fourth-provider path.

The scan deliberately separated:

1. shared-runtime code that defines whether a provider exists or participates;
2. legitimate provider-specific adapters / presentation overrides;
3. legacy compatibility names that no longer control provider identity.

No CineArt production code is introduced in this checkpoint.

## Hidden shared-runtime issues found

### Comparison main cache

`provider-compare-main-cache-v3.js` still allocated cache buckets and TTLs only for Broadway, MCL and Emperor. Its Worker show-route detector also recognized only Broadway and Emperor.

M7R6 changes the cache universe to Provider Registry / Shared Core, adds a generic `prefetchProvider(provider, ...)` API and retains the older Broadway/Emperor/MCL prefetch functions only as compatibility aliases. MCL remains a legitimate ticketing-cache special case.

### Adjacent-date prefetch

`provider-compare-prefetch.js` still built `broadwayDates`, `mclDates` and `emperorDates` separately, so a fourth provider could never participate in adjacent-date prefetch.

M7R6 builds provider/date/source context dynamically from the registered provider universe and calls the generic cache prefetch owner.

### Comparison resilience

`provider-compare-resilience-v3.js` still contained a fixed three-provider `PROVIDERS` array. A fourth provider could therefore disappear from health/retry UI and could not use provider-specific retry cache clearing.

M7R6 derives active providers and labels from Shared Core / Provider Registry and allows retry for any registered provider.

### Cinema registry base fallback

`cinema-registry.js` still normalized every provider other than MCL to Broadway. The later Emperor registry extension masked this in the normal production order, but the base owner itself still encoded the old two-provider assumption.

M7R6 preserves an unknown/future provider ID and returns neutral `unknown` region metadata when no provider-specific cinema record exists.

### Generic catalogue update listeners

`metro-runtime.js` and `phase8a-movie-navigation-refresh.js` still listened to MCL/Emperor compatibility catalogue events rather than the neutral `hkcinema:provider-catalogue` event.

M7R6 switches both shared consumers to the generic catalogue event, so a fourth provider can trigger Metro resync and aggregate invalidation without adding a provider-named listener.

## Intentionally retained provider-specific code

The following remain provider-specific by design and are not provider-universe gates:

- MCL browser/Worker hybrid ticketing and price enrichment;
- MCL lazy seat-summary loading and seat-count normalization;
- Broadway/MCL/Emperor seat-map adapters and geometry;
- provider-specific booking/presentation overrides in shared detail view models;
- Worker provider routes and probes for the providers actually implemented upstream today;
- current Worker `/health` provider list, which describes deployed upstream routes rather than the browser Registry universe.

Future CineArt integration must add its own upstream/normalizer/Worker adapter where required, but shared runtime must not require a CineArt-named branch merely for provider existence.

## Legacy compatibility names reviewed

`multi-provider.js` still contains some older names such as `broadwayMovieId` and compatibility-only old provider card class selectors. Deep inspection confirmed these no longer decide provider registration, provider-only card eligibility, source identity or comparison participation. The live provider/source contract is Registry + `data-provider` + canonical `data-provider-sources`.

They are therefore classified as naming/compatibility debt rather than a fourth-provider blocker and are not rewritten in this bounded checkpoint, avoiding unnecessary churn in the large stable aggregation owner immediately before CineArt reintroduction.

## Executable regression guard

`tests/m7r6-provider-expansion-debt-guard.test.mjs` proves a synthetic registered `fixture` provider can:

- receive its own comparison cache bucket;
- use generic Worker-show prefetch and provider cache clearing;
- participate in adjacent-date prefetch context;
- appear in comparison resilience and use provider retry;
- resolve through the base cinema registry without falling back to Broadway.

The same test statically rejects the old fixed-date/provider/event patterns in the shared owners modified here.

## Non-goals

- no CineArt production registration or upstream data;
- no provider fetch schema redesign;
- no PWA / Service Worker changes;
- no CSS/UI redesign;
- no removal of legitimate provider adapter branches.

## Merge gate

Merge only after the exact PR head passes the complete Node regression suite, Chromium installation and mobile browser smoke test. After squash merge, verify the same gates plus GitHub Pages deployment on merged `main`.
