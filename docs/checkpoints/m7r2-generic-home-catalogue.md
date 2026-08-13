# M7R2 — Generic home catalogue lifecycle

Baseline: `ed54e217e55848799221e01985e3a09506f0f935` (M7R1 provider identity gates).

## Objective

Remove the remaining three-provider ownership model from the homepage catalogue aggregation path without adding CineArt and without changing Service Worker/PWA behavior.

The goal is not to make upstream provider APIs identical. Provider adapters remain free to fetch, parse, cache and report health differently. The shared home runtime must only consume normalized, synchronous catalogue snapshots keyed by registered provider ID.

## Catalogue snapshot bus

`provider-shared-core.js` now owns a small in-memory catalogue snapshot bus:

- `publishCatalogue(providerId, catalogue, meta)`;
- `catalogue(providerId)`;
- `catalogueMap()`;
- generic `hkcinema:provider-catalogue` notification.

A catalogue is accepted only for a provider already present in `HKCinemaProviderRegistry`. Publishing never performs network IO.

Current MCL and Emperor status loaders continue to own their existing fetch/cache/error behavior, but publish successful/cached snapshots into this neutral bus. Their historical provider-specific events remain only for compatibility with older provider-specific modules.

## Generic home aggregation

`multi-provider.js` now enumerates `HKCinemaProviderSharedCore.providers()` instead of a private Broadway/MCL/Emperor option list.

Canonical card provider ownership is represented through:

- `data-provider` + `data-source-id` for a direct single-provider card;
- `data-provider-sources` JSON for merged cards;
- `data-providers` as a derived provider-ID list.

Legacy camel-case source fields are still mirrored where the provider ID safely maps to a DOM dataset key. They are compatibility data, not the canonical provider universe.

The aggregation cycle now:

1. determines the current home base provider;
2. enumerates every other registered provider;
3. reads only already-published synchronous catalogue snapshots;
4. merges exact-title matches or creates a generic provider-only card;
5. builds match records dynamically for every registered provider;
6. computes `maxProviderCount` instead of the fixed `tripleMatched` concept;
7. publishes one provider-neutral match event.

## Home base renderer boundary

The current production homepage is still initially rendered by the Broadway application module. M7R2 deliberately does not replace that stable renderer.

Therefore the shared aggregator may read the base renderer's synchronous `HKCinemaBroadwayApp.getCatalogue()` snapshot when the shared bus does not yet contain the base catalogue. This is an adapter boundary only; Broadway no longer defines which providers can exist in the aggregation layer.

A later architecture cleanup may replace the base renderer itself, but that is not required to add a fourth provider safely.

## MCL bridge exception

The existing MCL generic-version/session-criteria bridge remains provider-specific because it represents a real MCL upstream data shape. It may affect MCL matching behavior, but it does not decide whether another provider can enter the system.

## Shared final controls

Homepage tab counts now enumerate registered provider catalogue snapshots. They no longer directly read `HKCinemaMCLCatalogue` or `HKCinemaEmperorCatalogue`.

## Browser generation isolation

All changed runtime scripts receive an `m7r2-1` query suffix in `index.html`. This prevents an installed PWA/browser cache from combining old three-provider aggregation code with the new shared catalogue bus. No Service Worker logic is changed.

## Fourth-provider proof

`tests/m7r2-generic-home-catalogue.test.mjs` proves that:

- a fourth registered provider can publish and retrieve a catalogue snapshot;
- the generic event carries the fourth provider identity;
- `multi-provider.js` has no private MCL/Emperor catalogue state or fixed provider option array;
- alternate catalogue merging is registry-enumerated;
- provider sources are stored in the neutral provider-source map;
- current provider loaders publish through the shared bus;
- tab counts enumerate registry providers;
- changed browser assets are version-isolated.

## Non-goals

M7R2 does not:

- add CineArt production code;
- change provider request counts or upstream parser behavior;
- change Service Worker/PWA lifecycle;
- generalize shared movie detail/view-model/seat-map support;
- generalize comparison filter buttons or Smart Picks identity;
- remove the MCL-specific session bridge.

Those remaining shared-runtime gates belong to M7R3 and M7R4. M7R5 remains the full synthetic fourth-provider browser/runtime gate before CineArt can be reintroduced.
