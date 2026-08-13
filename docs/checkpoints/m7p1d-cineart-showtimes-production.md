# M7P1D checkpoint — CineArt showtimes production capability

Status: **implementation in progress — automated/live/device gates pending**

Baseline: `f4268b4161230320ba151a1184a2cf5536997038` (accepted M7P1C)

M7P1D is the second staged browser-production CineArt capability. It enables read-only showtimes only after the M7P1C Android installed-PWA gate passed.

## Browser Provider Registry

CineArt moves to:

- `catalogue: true`
- `showtimes: true`
- `prices: false`
- `seatSummary: false`
- `seatMap: false`
- `booking: false`

No other provider capability changes.

## Production Worker showtime route

M7P1D adds:

`GET /api/cineart/movies/<movieSourceId>/shows`

Optional query:

`?date=YYYY-MM-DD`

The service reuses the bounded M7P1B home Flight parser and its normalized `shows` collection. It does not request individual `/hk/show/<showId>` detail pages.

The public M7P1D showtime payload contains scheduling metadata only:

- show source id;
- movie source id;
- cinema and house identity;
- date/time/startAt;
- language/subtitle metadata;
- explicit format metadata when the home source provides it.

The payload deliberately forces these fields to `null`:

- `price`
- `seatSummary`
- `bookingUrl`

It does not expose `seatStates`, `seatPlan`, ticket types or show-detail geometry.

Non-GET requests return `405 METHOD_NOT_ALLOWED`.

## Cache boundary

The Worker showtime service uses a separate normalized-home cache:

- fresh edge cache: 60 seconds;
- stale fallback cache: 10 minutes.

The route is lazy: homepage catalogue loading does not call the showtime route. A CineArt showtime request begins only when shared comparison needs that movie.

## Browser architecture

M7P1D removes the temporary M7P1C catalogue-only comparison guard.

No CineArt-specific browser showtime transport is added. `provider-compare-v4.js` continues to own the generic route:

`/api/${provider}/movies/${sourceId}/shows`

Because the CineArt browser adapter has no `comparison.fetchShows` override, CineArt uses that shared transport directly.

This explicitly rejects restoration of the historical CineArt MutationObserver/IntersectionObserver enrichment path.

## Worker manifest

CineArt service descriptor becomes:

`catalogue-showtimes-production-detail-candidate-readonly`

The global `/health` phase remains `"6G"`.

## Required gates before merge

The exact PR head must pass:

1. full Node regression suite;
2. Chromium install;
3. mobile browser smoke;
4. M7P1B live discovery revalidation;
5. M7P1C live catalogue revalidation;
6. M7P1D live showtime validation;
7. live showtime route returns at least one current movie/date/session;
8. all public M7P1D sessions keep price/seat/booking fields disabled;
9. explicit-date selection returns only that date;
10. showtime POST returns 405;
11. no CineArt `/show/<id>` detail request exists in the M7P1D service;
12. no PWA or Service Worker file changes.

## Post-merge gate

After merge/deploy, merged-main regression, Chromium, mobile smoke and Pages deployment must pass.

Because CineArt previously caused a real installed-PWA freeze, another Android installed-PWA acceptance check is mandatory before M7P1E. It must cover:

- cold launch and reopen;
- opening a CineArt-only movie;
- date switching inside the comparison sheet;
- repeated open/close cycles;
- responsive scrolling/filtering after showtimes render;
- confirmation that price, seat and booking affordances remain unavailable for CineArt.

## Explicit M7P1D boundaries

M7P1D does **not** add:

- detailed ticket prices;
- base-price presentation;
- coarse seat summary presentation;
- strict A/H/U/L seat enrichment;
- seat-map geometry or UI;
- booking URLs;
- purchase/hold/reservation calls;
- CineArt-specific DOM observers;
- PWA/Service Worker changes.

Next checkpoint after successful automated + real-device acceptance: **M7P1E — CineArt price and seat-summary capability**.
