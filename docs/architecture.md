# HK Cinema current architecture

Status: current production architecture at cleanup checkpoint C1.

This document is the canonical description of the running system. Historical phase and checkpoint documents explain how individual features were introduced, but they do not override this file or `docs/provider-matrix.md`.

## Runtime surfaces

### GitHub Pages application

`app/index.html` is the production entrypoint. It loads a static PWA implemented with classic browser scripts and CSS. The Service Worker caches same-origin static assets only; all cinema catalogue, showtime, price and seat requests stay outside the PWA cache.

The active interface is the Metro skin. Classic remains present in the current checkpoint as an explicit rollback surface and will be retired in a separate behavior-changing cleanup PR.

### Cloudflare Worker

`worker/wrangler.jsonc` deploys `worker/src/index-emperor-seat.js`. The current router is historically layered:

1. `index-emperor-seat.js` — telemetry, provider probes, CineArt routes and Emperor seat-map routes.
2. `index-emperor.js` — Emperor catalogue, detail and showtime routes.
3. `index.js` — `/health`, Broadway routes and MCL ticketing/seat routes.

The layers are operational but are not the desired final ownership model. A later checkpoint will consolidate them into one route table without changing public URLs.

## Current data flow

### 1. Catalogue loading

- Broadway catalogue and upcoming movies are requested from the Worker by `app/app.js`.
- MCL catalogue is requested directly from the official MCL browser API by `app/providers/mcl.js`.
- Emperor catalogue and upcoming movies are requested from the Worker by `app/providers/emperor.js`.
- CineArt catalogue is requested from the Worker by `app/providers/cineart.js`.

Provider loads fail independently. Each successful provider publishes a synchronous catalogue snapshot through `app/provider-shared-core.js`.

### 2. Home aggregation

The current home renderer is still Broadway-owned. `app/multi-provider.js` reads its rendered cards, combines them with the other provider catalogue snapshots and records provider source IDs on card data attributes. `app/phase8a-movie-navigation.js` then creates movie aggregates and opens the comparison surface.

This DOM-based aggregation is current behavior, not the target architecture. The target is to build `MovieAggregate` records from catalogue data before rendering, with no base provider.

### 3. Showtime comparison

`app/provider-compare-v4.js` requests each matched provider independently, normalizes the selected-date sessions and renders a unified timeline. It already owns the closest representation of a comparison domain model.

Several later modules currently parse that rendered timeline again:

- rich filters and sorting;
- price and seat-summary enrichment;
- seat-summary normalization;
- Smart Picks recommendations;
- presentation and accessibility decorators.

The cleanup target is one `ComparisonStore`, pure selectors for filtering/sorting/recommendations, and one renderer. DOM text must no longer be a business-data input.

### 4. MCL showtimes

The accepted production order is:

1. official MCL WebAPI2 browser-direct request;
2. fast failure for the known VPN/proxy incompatible-payload case;
3. bounded Worker fallback for other eligible transport failures;
4. bulk metadata merge and lazy price/seat enrichment.

The behavior is intentionally optimized for a normal Hong Kong network. Cleanup may consolidate its wrapper modules, but must not reintroduce long VPN/proxy retry chains or stale partial showtimes.

### 5. Seat maps

`app/seatmap-shared.js` owns the shared seat-map surface. Provider adapters preserve real geometry differences rather than forcing every source into the same layout mode:

- Broadway: grid layout;
- MCL: grid/area layout from the official seat response;
- Emperor: positioned/bounded layout;
- CineArt: official read-only geometry.

Provider-specific layout information is part of the data contract and must not be discarded during consolidation.

## Canonical data rules

1. Provider IDs come from `app/provider-registry.js` and `worker/src/provider-manifest.js`.
2. Original provider `sourceId` values remain stable and unmodified except for removal of an optional `provider:` prefix at adapter boundaries.
3. Optional fields use `available`, `unknown` or `unsupported`; missing values are never converted into zero.
4. Prices and seat counts are not inferred when the provider does not supply reliable evidence.
5. One provider failure must not prevent other providers from rendering.
6. Catalogue, showtime, price, seat-summary and seat-map data have separate freshness policies.
7. Live provider probes are diagnostic only and are never part of normal homepage or comparison loading.

## Cache ownership

The current system uses Worker response caching, Worker Cache API entries, browser memory caches, `localStorage` catalogue fallbacks and short-lived `sessionStorage` ticketing entries. This is operational but overlaps in places.

The cleanup target is one declared cache owner per resource:

| Resource | Fresh target | Stale fallback | Intended owner |
|---|---:|---:|---|
| Current catalogue | 5 minutes | up to 24 hours, visibly stale | catalogue service |
| Upcoming catalogue | 30 minutes | up to 24 hours, visibly stale | catalogue service |
| Showtimes | 60–90 seconds | provider-specific, visibly stale | comparison service |
| Price | 5 minutes | none unless explicitly marked | enrichment service |
| Seat summary | 30–60 seconds | none unless explicitly marked | enrichment service |
| Seat map | 15–30 seconds | none | seat-map service |
| Static shell | content-hashed release | previous installed release | build and Service Worker |

## Health and observability

The Worker adds `x-request-id` and `server-timing` to responses and emits structured request-completion logs. `/health` is a service/capability declaration; it does not perform upstream network probes.

The health response exposes a numeric `schemaVersion` and Cloudflare deployment metadata when the version metadata binding is available. The historical `phase: "6G"` field remains temporarily for existing validation scripts and is deprecated; new consumers must use `schemaVersion` and provider capabilities.

Live health belongs to `/api/providers/probe` and `/api/providers/probe/{provider}`. `lastSuccessAt` is best-effort per Worker isolate and is not durable monitoring history.

## Deployment boundaries

- GitHub Pages deployment watches `app/**`, tests and frontend configuration.
- Cloudflare Git integration separately builds the Worker.
- A frontend PR can pass Pages checks without proving that a new Worker version is deployed.
- Live provider validation is evidence for a deployed candidate or production Worker; non-Hong-Kong MCL network failure alone is not evidence of a parser regression.

## Staged cleanup order

1. C1 — establish current-truth documentation, deployment metadata and remove repository-only legacy comparison files.
2. C2 — retire dead movie-detail and Classic runtime paths after focused interaction validation.
3. C3 — create catalogue/domain stores and remove Broadway base-provider ownership.
4. C4 — move filters, sorting and recommendations from DOM parsing to selectors.
5. C5 — consolidate Worker clients/router and define one cache owner per resource.
6. C6 — bundle production assets and generate the Service Worker asset manifest.

Each item is a separate PR checkpoint. Later checkpoints may update this order when current production evidence justifies it, but they must not silently mix multiple architectural migrations.
