# M7R1 — Provider expansion deep audit

Baseline: `8fc839ea44483ddbe78127ff95a5cfebad6095d6` (PR #95 rollback; repository tree equals pre-CineArt `36e1d7e`).

## Why this audit exists

Real-device stability returned immediately after the full CineArt/M7 rollback. The CineArt HAR/source investigation had already shown that catalogue/showtime inputs were structurally suitable. The remaining hypothesis is therefore architectural: M6 introduced a provider registry and normalized contracts, but several runtime layers still encode Broadway/MCL/Emperor as the complete universe of providers.

This audit separates legitimate provider adapters from shared-runtime blockers. Provider-specific parser/request/seat-geometry knowledge is allowed. Shared code is not allowed to decide provider existence by matching a fixed provider name list.

## Confirmed expansion blockers

### 1. Home catalogue orchestration — critical

`app/multi-provider.js` remains a three-provider implementation:

- owns only `mclCatalogue` and `emperorCatalogue` beside Broadway's base grid;
- defines a fixed `PROVIDER_OPTIONS` array;
- stores fixed Broadway/MCL/Emperor source-ID fields;
- emits fixed match-record properties;
- creates only MCL/Emperor provider-only card classes;
- separately loops MCL then Emperor catalogues;
- counts `tripleMatched` rather than provider-count-neutral coverage;
- listens only for MCL/Emperor catalogue and Data Health events.

This is the main missing bridge between "a provider can be registered" and "a provider can actually enter the home runtime".

### 2. Shared detail/view-model/seat-map — critical

`app/view-models.js`, `app/movie-detail-shared.js`, and `app/seatmap-shared.js` contain fixed provider maps and throw for unknown providers.

More seriously, `view-models.js` currently treats every seat-map provider that is not Broadway or MCL as Emperor schema. A fourth provider can therefore be assigned Emperor `scheduleKey/cinemaLinkId/hallId` requirements instead of degrading to unsupported/unknown capability.

### 3. Comparison filters and Smart Picks — high

`app/provider-compare-insights-v4.js`, `app/provider-compare-recommendations-v4.js`, and the previous provider guard infer providers from Broadway/MCL/Emperor CSS classes. Unknown providers can be relabeled as Broadway or omitted from provider controls.

M7R1 checkpoint 1 removes this fixed identity logic from `provider-compare-provider-guard.js`; the larger insights/recommendations modules remain for the next bounded refactor.

### 4. Cinema registry — high

The final `HKCinemaCinemaRegistry` resolver previously mapped every unknown provider to Broadway. M7R1 checkpoint 1 changes the final resolver to preserve the real provider ID and return `region: unknown` until that provider's venue metadata is registered.

### 5. Provider probe allow-list — medium/high

`worker/src/provider-probe.js` previously duplicated a three-provider allow-list and conditional dispatcher. M7R1 checkpoint 1 replaces it with a probe-handler registry. `SUPPORTED_PROVIDERS` is now derived from the registered default handlers, and tests can inject a fourth probe without editing a second allow-list.

### 6. Silent three-provider fallbacks — medium

`provider-shared-core.js`, Phase 8A and comparison code contain fallbacks that silently recreate Broadway/MCL/Emperor when registry ownership is unavailable. M7R1 checkpoint 1 removes the fallback from the shared core. Remaining consumers will be migrated in later bounded checkpoints; production script order already guarantees the registry is loaded before them.

### 7. Data Health initialization snapshot — architectural constraint

`data-health.js` enumerates the registry dynamically at module initialization, but then snapshots that set for its lifetime. This is safe only if all production provider descriptors are registered before Data Health loads. Future provider integration must either:

1. register all provider descriptors before shared consumers initialize; or
2. deliberately redesign Data Health for runtime registry mutation.

Do not reintroduce a late `multi-provider-registry-extension.js` after Data Health initialization.

## Why the old fourth-provider fixture was insufficient

The M6 fixture proves that a fourth provider ID can pass the registry/shared aggregate/comparison contract when manually injected before those modules load. It does not prove:

- catalogue lifecycle entry into `multi-provider.js`;
- provider-only home card creation;
- full detail rendering;
- seat capability degradation;
- provider filter/Smart Picks identity;
- cinema registry identity;
- Worker probe registration.

Future expansion tests must exercise the runtime chain, not just a contract object.

## M7R1 checkpoint 1 changes

- shared provider identity is registry-only; no hidden three-provider fallback in `provider-shared-core.js`;
- shared core exposes registered provider identity resolution for DOM nodes;
- comparison provider guard consumes that neutral identity;
- final cinema registry preserves unknown provider IDs instead of coercing to Broadway;
- Worker probes use a handler registry and derive their supported set;
- a fourth-provider regression proves these identity gates without adding CineArt production code.

## Remaining checkpoints before CineArt can return

### M7R2 — generic home catalogue lifecycle

Replace `multi-provider.js` with registry-driven catalogue orchestration and neutral `data-provider-sources`. Keep MCL bridge behavior as an explicit adapter exception only.

### M7R3 — generic shared detail/capability runtime

Make view models/detail rendering registry-driven. Seat-map support must be capability/adapter-driven; unknown providers must degrade safely instead of inheriting Emperor schema.

### M7R4 — generic comparison controls

Make provider filter buttons, Smart Picks identity, provider ordering, cinema filtering and related UI enumerate current active providers rather than CSS-name branches.

### M7R5 — end-to-end fourth-provider fixture gate

Run a synthetic fourth provider through catalogue → home card → aggregate → comparison → filters → detail capability semantics, plus browser mobile smoke. Only after this gate passes should CineArt production code be reintroduced.

## Stability rule

No Service Worker/PWA optimization belongs to M7R1–M7R5. The rollback baseline is stable on real devices and update prompts work. Provider expansion refactoring must not change that lifecycle.
