# HK Cinema current architecture

Status: current production architecture at cleanup checkpoint C6.

This document is the canonical description of the running system. Historical phase and checkpoint documents explain how individual features were introduced, but they do not override this file or `docs/provider-matrix.md`.

## Runtime surfaces

### GitHub Pages application

`app/index.html` is the ordered frontend source entrypoint. `scripts/build-app.mjs` replaces its local source styles and classic scripts with one content-hashed CSS bundle and one content-hashed JavaScript bundle, versions its manifest/icon references, and emits the explicit production artifact to `dist/`.

The build also generates `dist/asset-manifest.json` and embeds that release's exact shell list in `dist/sw.js`. The Service Worker can cache only URLs declared by that generated list; all cinema catalogue, showtime, price and seat requests stay outside the PWA cache. A failed shell fetch fails the install atomically, and a waiting worker still activates only after the user accepts the reload prompt.

Metro is the only production interface. The retired `skin=classic` query no longer changes runtime or presentation.

### Cloudflare Worker

`worker/wrangler.jsonc` deploys `worker/src/index.js`. That entry owns telemetry and delegates every public URL to the single declarative table in `worker/src/router.js`. The former `index-emperor.js` and `index-emperor-seat.js` files are logic-free compatibility re-exports only; they do not route or decorate requests.

## Current data flow

### 1. Catalogue loading and publication

- Broadway catalogue and upcoming movies are requested from the Worker by `app/providers/broadway.js`.
- MCL catalogue is requested directly from the official MCL browser API by `app/providers/mcl.js`.
- Emperor catalogue and upcoming movies are requested from the Worker by `app/providers/emperor.js`.
- CineArt catalogue is requested from the Worker by `app/providers/cineart.js`.

The four status owners start and refresh those adapters independently. Each successful result is published into `app/catalogue-store.js`; Data Health also reports provider loading, degraded and error state into that same store. Provider adapters retain transport and local fallback policy but no longer retain a second public catalogue snapshot.

`app/provider-shared-core.js` remains a thin registry/capability façade. Its catalogue methods delegate to `CatalogueStore` and do not own data.

### 2. Home aggregation and rendering

`app/catalogue-domain.js` reads provider snapshots from `CatalogueStore` and builds `MovieAggregate`, provider-match and grouped-variant records before any movie card exists. Matching, primary metadata selection, structured movie facts and the bounded generic-MCL variant bridge are data operations; they never read rendered DOM.

`app/multi-provider.js` is now one provider-neutral renderer. It renders the domain model once and writes aggregate/source IDs only as interaction handles. `app/phase8a-movie-navigation.js` is a small delegated click/keyboard bridge that resolves the aggregate ID and opens comparison; it no longer observes, scans or decorates cards.

There is no base provider. A Broadway-only, MCL-only, Emperor-only or CineArt-only catalogue can independently produce home cards while failed providers remain visible through health state.

### 3. Showtime comparison

`app/provider-compare-v4.js` requests each matched provider independently and normalizes the selected-date sessions. It publishes those sessions to `app/comparison-store.js` before selector consumers run, then renders a unified timeline whose `data-comparison-session-id` values are interaction handles only.

Movie cards open this surface directly. Movie facts, provider availability, dates, showtimes, price/seat enrichment, official booking links and seat-map launch points all live in the comparison flow; the old provider-specific movie-detail drawer and its duplicate showtime requests were removed at C2.

`ComparisonStore` is the comparison snapshot and filter-state owner. Its selectors operate on canonical session records for provider, metadata, region, district, cinema, period, price and reliable-seat filtering plus time/price/seat sorting. Rich Filters and Smart Picks subscribe to explicit store revisions; neither reads rendered time, cinema, price or seat text as business data. Saved preferences persist explicit filter changes instead of observing DOM mutations.

Price and seat-summary enrichment still schedule lazy work from rendered cards and booking handles, but their result events address the same comparison record through its stable session handle. The store patches that record and publishes a revision before filters and recommendations recompute.

Later presentation modules may still decorate the rendered timeline:

- price and seat-summary enrichment;
- seat-summary normalization;
- presentation and accessibility decorators.

DOM text must no longer be a business-data input. C5 consolidates transport/router/cache ownership while preserving the C4 comparison record and selector boundary. C6 changes production packaging and static-shell ownership only; it does not change these data contracts.

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

## C3 catalogue boundary

C2 removed paths that had no production entry after direct comparison became the accepted interaction:

- the Classic query switch, Classic-only CSS and its observers;
- the shared movie-detail drawer plus Broadway, MCL and Emperor detail loaders;
- the unused Emperor movie-detail Worker route and parser;
- detail-only branches inside seat-map adapters and PWA back navigation.

C3 then replaced the Broadway-first home pipeline:

- removed `app/app.js` as fetch, cache, tab and base-card owner;
- moved Broadway transport/cache behavior into the same provider-adapter pattern as the other providers;
- made `CatalogueStore` the only public catalogue snapshot and provider-state owner;
- moved matching, variant grouping, movie facts and aggregate construction into `CatalogueDomain`;
- replaced DOM re-aggregation with one neutral renderer and removed the refresh/decorating observer.

Catalogue/showtime parsers, comparison cancellation and stale-response guards, MCL transport selection, filters, Smart Picks, seat summaries, four provider seat maps, official booking and Android/PWA back behavior are unchanged. Historical checkpoint documents still describe their original implementations but are not runtime contracts.

## C4 comparison boundary

C4 removed the second comparison data model that filters and Smart Picks previously reconstructed from timeline markup:

- added `ComparisonStore` as the canonical selected-date session snapshot and filter owner;
- assigned every rendered showtime a stable `comparisonSessionId` interaction handle;
- moved filter matching and sorting to pure selectors over canonical records;
- made Smart Picks consume the filtered selector output while retaining its evidence-based recommendation rules;
- addressed price and seat-summary updates to one session record instead of triggering DOM re-parsing;
- replaced filter, recommendation and preference MutationObservers with explicit store change events.

The renderer still owns card visibility, order, focus/jump and presentation. The store owns values and selection. DOM decorators must not add a competing price, seat, metadata or recommendation truth source.

## C5 transport, router and cache boundary

C5 removes two historical interception layers:

- all Worker-backed browser modules use `HKCinemaApiClient`; the Worker origin and JSON/error handling are no longer repeated across adapters;
- `provider-compare-main-cache-v3.js` exposes an explicit showtime loader instead of replacing `window.fetch`;
- Emperor seat-map session discovery subscribes to `ComparisonStore` rather than intercepting Worker responses;
- the Worker deploys `index.js` and resolves every public endpoint through one route table;
- every public Worker response is `no-store`, leaving each resource cache with the declared service owner below.

Public URLs, response bodies, C4 session handles/selectors, MCL browser-first transport, provider parsers, official booking rules and seat-map geometry are unchanged.

## C6 production bundle and shell boundary

C6 replaces the raw-source Pages upload and install-time asset discovery with one deterministic production boundary:

- `app/index.html` remains the readable, ordered source of CSS and classic-script execution;
- `npm run build` emits exactly one content-hashed CSS bundle and one content-hashed JavaScript bundle in that source order;
- public icon and web-manifest references carry content hashes;
- `dist/asset-manifest.json` records bundle sources, exact shell URLs and exact output files;
- `dist/sw.js` receives the release version and shell list at build time instead of fetching and parsing HTML during installation;
- shell precaching is atomic, and runtime static caching accepts only declared shell URLs;
- navigation stays network-first with an installed-shell fallback, but arbitrary navigation URLs are not added to the shell cache;
- `dist/` is clean generated output and raw CSS/JavaScript source modules are not deployed individually.

The build performs concatenation, not semantic minification or module rewriting. This keeps the established classic-script order and browser globals intact while making deployment contents and cache ownership reviewable.

## Canonical data rules

1. Provider IDs come from `app/provider-registry.js` and `worker/src/provider-manifest.js`.
2. Original provider `sourceId` values remain stable and unmodified except for removal of an optional `provider:` prefix at adapter boundaries.
3. Optional fields use `available`, `unknown` or `unsupported`; missing values are never converted into zero.
4. Prices and seat counts are not inferred when the provider does not supply reliable evidence.
5. One provider failure must not prevent other providers from rendering.
6. Catalogue, showtime, price, seat-summary and seat-map data have separate freshness policies.
7. Live provider probes are diagnostic only and are never part of normal homepage or comparison loading.

## Cache ownership

C5 makes public Worker responses `no-store`; `Cache-Control` is no longer a second implicit browser/CDN cache. `app/api-client.js` owns the Worker origin, JSON/error contract, cancellation propagation and transport timeout, but intentionally does not cache cinema data.

Each public resource has one explicit owner:

| Resource | Fresh target | Stale fallback | Owner / implementation |
|---|---:|---:|---|
| Current catalogue | 5 minutes | up to 24 hours, visibly stale | provider adapter `localStorage` fallback |
| Upcoming catalogue | 30 minutes | up to 24 hours, visibly stale | provider adapter `localStorage` fallback |
| Showtimes | 60–90 seconds | provider-specific, visibly stale only where declared | `provider-compare-main-cache-v3.js` comparison memory cache |
| Price | 5 minutes | none unless explicitly marked | `provider-compare-prices.js` enrichment memory cache |
| Seat summary | 30–90 seconds | none unless explicitly marked | `provider-compare-seats.js` enrichment memory cache |
| Seat map | 15–30 seconds | none | `seatmap-shared.js` memory cache |
| Static shell | content-hashed C6 release | previous installed release | generated shell manifest + Service Worker |

CineArt's Worker services retain bounded Cache API entries for expensive upstream snapshots/details. Those entries are internal upstream-service caches; the public response remains `no-store` and no generic router cache is added.

## Health and observability

The Worker adds `x-request-id` and `server-timing` to responses and emits structured request-completion logs. `/health` is a service/capability declaration; it does not perform upstream network probes.

The health response exposes `schemaVersion: 2`, declared cache owners and Cloudflare deployment metadata when the version metadata binding is available. The historical `phase: "6G"` field remains temporarily for existing validation scripts and is deprecated; new consumers must use `schemaVersion` and provider capabilities.

Live health belongs to `/api/providers/probe` and `/api/providers/probe/{provider}`. `lastSuccessAt` is best-effort per Worker isolate and is not durable monitoring history.

## Deployment boundaries

- GitHub Pages deployment watches `app/**`, `scripts/build-app.mjs`, tests and frontend configuration. It builds and uploads only `dist/`; raw `app/` files are not the deployment artifact.
- Cloudflare Git integration separately builds the Worker.
- A frontend PR can pass Pages checks without proving that a new Worker version is deployed.
- Live provider validation is evidence for a deployed candidate or production Worker; non-Hong-Kong MCL network failure alone is not evidence of a parser regression.

## Staged cleanup order

1. C1 — completed: establish current-truth documentation, deployment metadata and remove repository-only legacy comparison files.
2. C2 — completed: retire dead movie-detail and Classic runtime paths after focused interaction validation.
3. C3 — completed: create catalogue/domain stores and remove Broadway base-provider ownership.
4. C4 — completed: move filters, sorting and recommendations from DOM parsing to selectors.
5. C5 — completed: consolidate Worker clients/router and define one cache owner per resource.
6. C6 — completed: bundle production assets and generate the exact Service Worker shell manifest.

Each item is a separate PR checkpoint. Later checkpoints may update this order when current production evidence justifies it, but they must not silently mix multiple architectural migrations.
