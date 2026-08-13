# M7P1C checkpoint — CineArt catalogue-only production registration

Status: **implementation and pre-final automated gates complete — final exact-head rerun / merge / Android PWA gate pending**

Baseline: `aa17b4f6025040856fc7e272a6fc7023d0a7b693` (M7P1B)

M7P1C is the first browser-production registration of CineArt after the M7 rollback. It deliberately enables only movie catalogue participation. Showtime, price, seat-summary, seat-map and booking capabilities remain disabled.

## Browser Provider Registry

CineArt is registered after Broadway, MCL and Emperor with:

- `catalogue: true`
- `showtimes: false`
- `prices: false`
- `seatSummary: false`
- `seatMap: false`
- `booking: false`

The shared provider/core/Data Health/home aggregation layers remain Registry-driven; no fixed-four provider universe is added.

## Production Worker catalogue route

M7P1C introduces:

`GET /api/cineart/catalogue`

The route reuses the M7P1B bounded CineArt home Flight parser and returns only:

- `now`
- `coming`
- `festival`
- catalogue metadata

It does not return home `shows`, cinema/house lists, coarse seat counts, strict seats, prices from show detail or seat geometry.

Non-GET requests return `405 METHOD_NOT_ALLOWED`.

The production catalogue service uses the Worker Cache API with:

- fresh edge cache: 60 seconds
- stale fallback cache: 30 minutes

A stale catalogue may be returned only when the live upstream fetch fails and a prior normalized catalogue exists. The browser also keeps a 30-minute local catalogue fallback.

## Browser adapter

`app/providers/cineart.js` talks only to the HK Cinema Worker catalogue route. It never fetches `cinearthouse.com.hk` directly.

The adapter owns:

- `getCatalogue()`
- `refreshCatalogue()`
- `getCachedCatalogue()`
- the last synchronous `catalogue` snapshot

It does not own showtime, price, seat or booking transport.

### Catalogue-only comparison guard

The current movie-first navigation opens the shared comparison surface for movie cards. To prevent an existing generic Worker fallback from silently requesting a not-yet-enabled CineArt showtime route, the CineArt adapter supplies a catalogue-only comparison guard which returns an empty showtime result without performing network IO.

This guard is not a showtime implementation. Registry `showtimes` remains `false`; there is still no production `/api/cineart/movies/<id>/shows` route. M7P1D must replace this guard with the real showtime adapter only after its own source/live/device gates pass.

## Shared catalogue publication

`app/cineart-status.js` publishes CineArt through:

`HKCinemaProviderSharedCore.publishCatalogue("cineart", ...)`

It also reports CineArt freshness to the existing Registry-driven Data Health owner.

M7P1C does not restore the historical `hkcinema:cineart-catalogue` parallel event, Mutation observers, Intersection observers, DOM-derived matching or `cineart-compare-enrichment.js`.

## Worker manifest

The Worker health descriptor becomes:

`catalogue-production-shows-candidate-readonly`

`/health` retains the existing global `phase: "6G"` contract.

## Required automated gates

Before merge, the exact PR head must pass:

1. full Node regression suite;
2. Chromium install and mobile browser smoke;
3. the existing M7P1B CineArt branch-preview discovery validation;
4. M7P1C branch-preview `/api/cineart/catalogue` validation;
5. catalogue GET returns current live movies and no session/cinema/seat payloads;
6. catalogue POST returns 405;
7. browser Registry has exactly one CineArt descriptor and only `catalogue:true`;
8. browser adapter never calls a CineArt movie/show/seat route;
9. no PWA or Service Worker file changes.

## Pre-final automated evidence

Code head `85994c3c539d7017edaf6b17e3273f06c8e4e8d0` passed both automated suites before this documentation-only checkpoint update:

- CineArt Candidate Validation #35 / run `31672472274`: PASS.
- Deploy HK Cinema #616 / run `31672472287`: Node regression PASS, Chromium install PASS, mobile browser smoke PASS.
- M7P1B discovery remained healthy on the same branch preview: 20 source movies, 551 normalized shows, 5 cinemas, schedule range `2026-08-13` through `2026-08-28`.
- M7P1C production catalogue returned 16 now-showing movies, 4 coming-soon movies, 0 festival entries.
- Catalogue response was fresh network data (`stale:false`).
- Catalogue payload contained no session/cinema/seat summary collections.
- `POST /api/cineart/catalogue` returned `405 METHOD_NOT_ALLOWED`.
- Worker health retained `phase: "6G"` and reported CineArt as `catalogue-production-shows-candidate-readonly`.

This checkpoint document update intentionally creates one final PR head; both automated suites must pass again on that exact head before merge.

## Real-device gate

Because M7P1C is the first browser-production CineArt re-entry after the previous Android PWA freeze regression, automated gates are necessary but not sufficient to declare the browser integration fully accepted.

After merge/deploy, Android installed-PWA validation must specifically check:

- cold launch reaches the homepage;
- no startup freeze before the movie grid appears;
- CineArt Data Health settles instead of remaining permanently loading;
- CineArt catalogue movies can merge/render without UI lock-up;
- scrolling/search/sort remain responsive;
- opening a CineArt-only movie does not start hidden CineArt showtime/seat requests;
- closing/reopening the installed PWA still reaches the main screen.

M7P1D must not begin if the real-device PWA test reproduces the old freeze.

## Explicit M7P1C boundaries

M7P1C does **not** add:

- CineArt production showtime route;
- CineArt showtime rendering;
- ticket-price rendering;
- coarse or strict seat rendering;
- CineArt seat-map UI;
- booking URLs;
- purchase/hold/reservation calls;
- CineArt-specific DOM observers;
- PWA/Service Worker changes.

Next checkpoint after automated and real-device acceptance: **M7P1D — CineArt showtimes production capability**.
