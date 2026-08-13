# M7R5 — End-to-end fourth-provider expansion gate

## Objective

Close the remaining shared-runtime assumptions that treated Broadway, MCL and Emperor as the complete provider universe, then prove one registered fourth provider can travel through the production shared stack without adding provider-name branches.

This checkpoint deliberately does **not** add CineArt production code.

## Production changes

### `phase8a-movie-navigation.js`

Phase 8A now derives provider IDs from Provider Shared Core, with Provider Registry as the only fallback.

The legacy home-base card path now resolves sources in this order:

1. explicit `data-provider`;
2. canonical `data-provider-sources`;
3. dynamic provider source dataset keys;
4. the first registered provider only for the existing base-renderer direct-source compatibility path.

Removed shared assumptions:

- fixed `['broadway', 'mcl', 'emperor']` provider fallback;
- `mcl-only-card` / `emperor-only-card` identity inference;
- direct `HKCinemaMCLCatalogue` / `HKCinemaEmperorCatalogue` reads.

Provider catalogue facts now prefer the Shared Core catalogue snapshot for every registered provider. The existing synchronous Broadway app catalogue is retained only as the current first-provider/base-renderer compatibility adapter and never defines the provider universe.

The MCL `comparisonMclSourceId` bridge remains intentionally provider-specific because it adapts MCL's upstream MovieSet/session model rather than deciding whether providers exist.

### `provider-compare-v4.js`

The comparison runtime no longer contains an emergency hard-coded three-provider descriptor array.

When Provider Shared Core is unavailable, provider descriptors are derived from Provider Registry. Shared Core remains the normal production source.

Also generalized:

- provider labels use Shared Core / Registry identity;
- generic Worker showtime requests use a default timeout with provider-specific overrides only where required;
- hero poster fallback scans active registered provider records instead of Broadway/MCL/Emperor fields.

Current Broadway/MCL/Emperor showtime normalizers remain as adapter overrides, followed by the existing generic normalizer for any other registered provider. MCL ticketing remains a deliberate adapter-specific fetch path.

## Synthetic fourth-provider gate

`tests/m7r5-end-to-end-provider-expansion.test.mjs` uses one `fixture` descriptor with:

- catalogue: supported;
- showtimes: supported;
- booking: supported;
- prices: unsupported;
- seat summary: unsupported;
- seat map: unsupported.

The same fixture is exercised through:

`Provider Registry → Provider Contract → Shared Core catalogue snapshot → provider-only home card → Phase 8A movie aggregate/match → comparison fetch/render/state → comparison filters → shared detail/view-model capability semantics`

The gate verifies that:

- the home aggregate owns only `fixture` sources and receives facts from its published catalogue;
- comparison requests only `/api/fixture/...` and never `/api/broadway/...`;
- comparison keeps the Fixture Cinema identity;
- unsupported price/seat capabilities render as unsupported while booking remains usable;
- the filter engine preserves `fixture` identity;
- shared detail keeps booking, suppresses unsupported seat-map launch and does not inherit Emperor request fields;
- a comparison runtime loaded without Shared Core still derives the provider universe from Registry and can operate with a registry containing only `fixture`.

## Cache isolation

Only the two changed browser runtimes receive a new M7R5 query generation:

- `provider-compare-v4.js?v=m6c-3-m7r5-1`
- `phase8a-movie-navigation.js?v=m6c-3-m6d2a-m7r5-1`

No Service Worker, manifest, PWA runtime, CSS, Worker route or provider upstream code is changed in this checkpoint.

## Merge gate

M7R5 can merge only after the exact PR head passes:

1. full Node regression suite;
2. Chromium mobile browser smoke.

After squash merge, the merged `main` SHA must again pass:

1. regression;
2. mobile smoke;
3. GitHub Pages deployment.

Only after this checkpoint is stable should CineArt production integration resume as a separate bounded checkpoint.
