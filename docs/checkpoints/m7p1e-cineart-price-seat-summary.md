# M7P1E checkpoint — CineArt price and seat-summary capability

Status: **implementation + pre-final automated/live gates complete — final exact-head rerun / merge / Android PWA gate pending**

Baseline: `bc08f5744d752f13039614254db1f516dcd79a32` (accepted M7P1D)

M7P1E is the third staged browser-production CineArt capability. It begins only after the deployed M7P1D Android installed-PWA gate passed.

## Browser Provider Registry

CineArt moves to:

- `catalogue: true`
- `showtimes: true`
- `prices: true`
- `seatSummary: true`
- `seatMap: false`
- `booking: false`

No other provider capability changes.

## Production data boundary

M7P1E continues using the existing production route:

`GET /api/cineart/movies/<movieSourceId>/shows`

The route still performs only the bounded CineArt `/hk` home Flight request. It does **not** request individual `/hk/show/<showId>` detail pages.

### Price

M7P1E exposes only the price already present on the home show record:

- `currency: HKD`
- `display`
- `face`
- `updatedAt`

It does not expose or infer adult/student/child/senior ticket categories, detailed ticket types, concessions or service fees. Missing price values remain `null`; they are never coerced to zero.

### Seat summary

M7P1E exposes the home show record as a deliberately coarse summary:

- `quality: "coarse-not-sold"`
- `total = seats`
- `sold = sold`
- `notSold = avaliable`
- `upstreamSeatsHold = seatsHold`
- `available = null`
- `held = null`
- `blocked = null`
- `unavailable = sold`

Missing upstream inventory values remain `null`; they are never coerced to zero.

Critical semantic boundary: CineArt home `avaliable` means **not sold**, not selectable availability. It may include held/locked states. Production UI must never relabel this value as `available` or `可選`.

## Browser presentation

The CineArt browser adapter adds only a `comparison.normalizeSession` view adapter. It does not add `comparison.fetchShows` and therefore does not create a second network/lifecycle owner.

Price is rendered through the existing shared comparison price field.

Coarse seat text is explicitly rendered as:

`<notSold>/<total> 未售（非可選數）`

The normalized comparison item keeps:

- `seatAvailable: null`
- `seatClass: "unknown"`
- `bookingUrl: null`

This prevents the generic UI and downstream MCL seat-enrichment code from treating CineArt coarse not-sold data as selectable seats.

## Cache boundary

The Worker showtime cache remains:

- fresh edge: 60 seconds;
- stale fallback: 10 minutes.

Its internal cache namespace is bumped from `m7p1d` to `m7p1e`, preventing old scheduling-only snapshots with null price/seat fields from surviving the capability transition.

## Worker manifest

CineArt service descriptor becomes:

`catalogue-showtimes-price-coarse-seats-production-detail-candidate-readonly`

The global `/health` phase remains `"6G"`.

## Pre-final automated/live evidence

Code head `7fb4b1cafa7325b4112c6efe3c38386e6c2d217c` passed:

- CineArt Candidate Validation #50 / run `31675834254`: PASS;
- Deploy HK Cinema #633 / run `31675834313`: Node regression PASS, Chromium install PASS, mobile browser smoke PASS;
- M7P1B discovery revalidation: PASS;
- M7P1C catalogue revalidation: PASS;
- M7P1D showtime revalidation: PASS;
- M7P1E base-price/coarse-seat live validation: PASS.

Live evidence on that head:

- 20 CineArt source movies;
- 544 normalized shows;
- 5 cinemas;
- schedule range `2026-08-13` through `2026-08-28`;
- validation movie `733` had 4 available dates and 13 sessions;
- all 13 sessions exposed a base/face price and coarse not-sold summary;
- sample show `80818` at CineArt MegaBox exposed HKD 160 base/face price;
- sample coarse summary: total 271, sold 113, notSold 158, upstream hold 7;
- sample retained `available:null`, `held:null`, `blocked:null`, and `unavailable:113`;
- `271 === 113 + 158` and `unavailable === sold`;
- public sessions exposed no `ticketTypes`, `seatStates` or `seatPlan`;
- booking remained `null`;
- POST remained 405;
- Worker health retained global `phase: "6G"`.

The regression suite also verifies that missing price/inventory evidence is preserved as `null` rather than being converted to zero.

This documentation update intentionally creates one final PR head. Both automated suites must pass again on that exact head before merge.

## Required gates before merge

The exact PR head must pass:

1. full Node regression suite;
2. Chromium install;
3. mobile browser smoke;
4. M7P1B live discovery revalidation;
5. M7P1C live catalogue revalidation;
6. M7P1D live showtime revalidation;
7. M7P1E live base-price/coarse-seat validation;
8. at least one current CineArt show exposes finite `display/face` price;
9. at least one current CineArt show exposes a coarse seat summary;
10. live coarse summaries retain `available:null` and `held:null`;
11. when finite, `total === sold + notSold` and `unavailable === sold`;
12. public showtime payload contains no `ticketTypes`, `seatStates` or `seatPlan`;
13. booking remains `null` and POST remains 405;
14. no CineArt `/show/<id>` request is introduced in the production showtime service;
15. no PWA or Service Worker file changes;
16. exact-head PR review has no blocking finding.

## Post-merge gate

After squash merge, merged-main regression, Chromium, mobile smoke and GitHub Pages deployment must pass.

Because CineArt previously caused an installed-PWA freeze, Android installed-PWA acceptance remains mandatory before any next CineArt capability stage. It must cover:

- cold launch and reopen;
- opening CineArt showtimes repeatedly;
- switching dates;
- confirming CineArt price renders;
- confirming CineArt seat text says `未售（非可選數）` rather than `可選`;
- repeated open/close cycles;
- responsive scrolling/search/sort after price/seat data render;
- confirmation that no CineArt seat-map or booking action appears.

## Explicit M7P1E boundaries

M7P1E does **not** add:

- detailed ticket types or concession prices;
- strict A/H/U/L seat-state enrichment;
- selectable-seat counts derived from coarse home data;
- seat-map geometry or UI;
- booking URLs;
- purchase/hold/reservation calls;
- direct browser requests to `cinearthouse.com.hk`;
- CineArt-specific MutationObserver/IntersectionObserver lifecycle;
- PWA/Service Worker changes.

The next CineArt capability stage must not begin until M7P1E automated, deployment and Android installed-PWA acceptance gates pass.
