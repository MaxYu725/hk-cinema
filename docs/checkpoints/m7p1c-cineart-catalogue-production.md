# M7P1C checkpoint — CineArt catalogue-only production registration

Status: **COMPLETE — merged, deployed, automated gates PASS, Android installed-PWA gate PASS**

Baseline: `aa17b4f6025040856fc7e272a6fc7023d0a7b693` (M7P1B)

Merged production commit: `f4268b4161230320ba151a1184a2cf5536997038`

M7P1C was the first browser-production registration of CineArt after the M7 rollback. It deliberately enabled only movie catalogue participation. Showtime, price, seat-summary, seat-map and booking capabilities remained disabled throughout this checkpoint.

## Browser Provider Registry at M7P1C

CineArt was registered after Broadway, MCL and Emperor with:

- `catalogue: true`
- `showtimes: false`
- `prices: false`
- `seatSummary: false`
- `seatMap: false`
- `booking: false`

The shared provider/core/Data Health/home aggregation layers remained Registry-driven; no fixed-four provider universe was added.

## Production Worker catalogue route

M7P1C introduced:

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

## Browser adapter at M7P1C

`app/providers/cineart.js` talks only to the HK Cinema Worker catalogue route. It never fetches `cinearthouse.com.hk` directly.

At M7P1C the adapter supplied a catalogue-only comparison guard which returned an empty showtime result without network IO. This prevented movie-first navigation from silently starting CineArt showtime requests before M7P1D.

M7P1C did not restore the historical `hkcinema:cineart-catalogue` parallel event, Mutation observers, Intersection observers, DOM-derived matching or `cineart-compare-enrichment.js`.

## Automated evidence

Final PR head `929f70e60fc5539a67b65a320ab218bebbbd7c20` passed:

- CineArt Candidate Validation #36 / run `31672582493`: PASS.
- Deploy HK Cinema #617 / run `31672582478`: Node regression PASS, Chromium install PASS, mobile browser smoke PASS.
- M7P1B discovery remained healthy: 20 source movies, 551 normalized shows, 5 cinemas, schedule range through `2026-08-28`.
- M7P1C catalogue returned 16 now-showing movies, 4 coming-soon movies, 0 festival entries.
- Catalogue response was fresh network data (`stale:false`).
- Catalogue payload contained no session/cinema/seat summary collections.
- `POST /api/cineart/catalogue` returned `405 METHOD_NOT_ALLOWED`.
- Worker health retained global `phase: "6G"`.

After squash merge, merged-main Deploy HK Cinema #618 / run `31672702971` also passed:

- Node regression PASS;
- Chromium install PASS;
- mobile browser smoke PASS;
- GitHub Pages deploy PASS.

## Android installed-PWA acceptance

**PASS.** The user completed the required real-device acceptance test against the deployed M7P1C production build and reported normal operation.

Confirmed acceptance points:

- cold launch was normal and reached the homepage;
- no recurrence of the previous CineArt startup freeze;
- CineArt catalogue/Data Health settled normally;
- scrolling, search and sort remained responsive;
- opening the staged CineArt experience did not lock the UI;
- closing and reopening the installed PWA was normal.

This real-device PASS is the release gate that permits M7P1D to begin.

## Explicit M7P1C boundaries

M7P1C did **not** add:

- CineArt production showtime route;
- CineArt showtime rendering;
- ticket-price rendering;
- coarse or strict seat rendering;
- CineArt seat-map UI;
- booking URLs;
- purchase/hold/reservation calls;
- CineArt-specific DOM observers;
- PWA/Service Worker changes.

Next checkpoint: **M7P1D — CineArt showtimes production capability**.
