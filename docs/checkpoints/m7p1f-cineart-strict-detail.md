# M7P1F checkpoint — CineArt selected-date strict detail

Status: **COMPLETE — merged, deployed, automated gates PASS, Android installed-PWA gate PASS**

Baseline: `27a2ee8f87b0934ded9bb333ba4fd8280bf68f1c` (accepted M7P1E)

Merged production commit: `c15a374730aa1c3477096e14313a1418a3fb210f`

M7P1E Android installed-PWA acceptance: **PASS**.

The user completed the deployed M7P1E real-device acceptance gate and reported normal operation. This PASS was the release gate permitting M7P1F to begin.

## M7P1F capability boundary

At M7P1F, CineArt Registry capabilities were:

- catalogue: true
- showtimes: true
- prices: true
- seatSummary: true
- seatMap: false
- booking: false

Later stages may advance optional capabilities independently; this block records the historical M7P1F production boundary.

## Scope

M7P1F upgraded CineArt comparison precision without enabling seat-map or booking.

The existing production route remained:

`GET /api/cineart/movies/<movieSourceId>/shows`

The route continued to obtain the normal CineArt `/hk` home Flight snapshot first. Only the currently selected date was eligible for bounded show-detail enrichment.

## Bounded selected-date detail policy

- maximum concurrent CineArt show-detail requests: 3;
- maximum detail requests per selected date: 6;
- per-show detail timeout: 4.5 seconds;
- public strict-detail cache: 20 seconds;
- sessions beyond the per-date limit remain on M7P1E coarse data;
- any individual detail failure falls back to the existing coarse session and does not fail the whole comparison request.

The initial no-date comparison request enriches only the resolved selected date. `allSessions` remains the coarse home snapshot and is not expanded into a future-date detail fan-out.

## Detailed price projection

When a read-only `/hk/show/<showId>` detail document resolves, production may expose:

- `display`;
- `adult`;
- `student`;
- `child`;
- `senior`;
- `face`;
- `lowest`;
- active online `ticketTypes` with name/price/concession.

The comparison card uses the adult price when available, then display/face fallback.

## Strict seat-summary projection

M7P1F maps CineArt seat states exactly as previously validated by M7P1B:

- `A` → `available`;
- `H` → `held`;
- `U` → `sold`;
- `L` → `blocked`.

A successful strict summary is published as:

- `quality: "strict-seat-state"`;
- `total`;
- `available`;
- `held`;
- `sold`;
- `blocked`;
- `unavailable = held + sold + blocked`;
- `unknown`.

Only strict summaries may be rendered as `可選`. Coarse home `avaliable` remains `未售（非可選數）` and is never relabelled as selectable availability.

## Browser ownership

The CineArt browser adapter did not implement `comparison.fetchShows`.

Shared `provider-compare-v4.js` remained the only browser showtime transport owner. The CineArt adapter synchronously normalized the returned Worker session:

- strict summary → selectable seat text/class;
- coarse summary → M7P1E non-selectable wording;
- detailed price → adult/display/face priority.

No CineArt MutationObserver or IntersectionObserver lifecycle was introduced.

## Explicit M7P1F boundaries

M7P1F did **not** enable:

- `seatMap` capability;
- CineArt seat-state arrays in public showtime payloads;
- CineArt seat-plan geometry in public showtime payloads;
- a CineArt seat-map route or UI;
- booking URLs;
- purchase, hold or reservation calls;
- direct browser requests to `cinearthouse.com.hk`;
- a second browser showtime lifecycle owner;
- PWA or Service Worker changes.

The Worker manifest at M7P1F advertised CineArt as:

`catalogue-showtimes-detailed-price-strict-seats-production-seatmap-candidate-readonly`

Global Worker `/health` remained `phase: "6G"`.

## Final automated evidence

Final exact PR head `624e99e4558924ba271591df5af6af5db0d01d96` passed:

- exact-head review with no blocking findings;
- CineArt Candidate Validation #53 / run `31677285684`: PASS;
- Deploy HK Cinema #637 / run `31677285714`: Node regression PASS, Chromium install PASS, mobile browser smoke PASS;
- M7P1B discovery, M7P1C catalogue, M7P1D showtime, M7P1E coarse price/seat, and M7P1F selected-date strict-detail live gates all PASS;
- global Worker health remained `phase: "6G"`;
- public showtime sessions exposed no `seatStates` or `seatPlan`; booking remained null; POST remained 405.

The representative live gate recorded:

- 20 movies / 544 normalized shows / 5 cinemas;
- discovery sample show `80852`, movie `838`, CineArt Maritime Square;
- selected date contained 9 sessions and 60 movie sessions overall;
- bounded detail attempted 6 of 9 selected-date sessions: 6 detailed-price PASS, 6 strict-seat PASS, 0 fallback, 3 deliberately left coarse;
- strict sample: total 112, available 67, held 0, sold 45, blocked 0, unavailable 45, unknown 0;
- detailed-price sample: display/adult HKD 60, student 50, senior 30, face 50, lowest 30, 8 active online ticket types.

After squash merge, merged-main Deploy HK Cinema #638 / run `31677442101` passed Node regression, Chromium install, mobile browser smoke and GitHub Pages deployment.

## Android installed-PWA acceptance

**PASS.** The user completed the required deployed M7P1F real-device acceptance check and reported normal operation.

Accepted checks covered cold launch/reopen, CineArt comparison, detailed price and strict `可選` rendering, coarse fallback wording, date switching, repeated open/close cycles, continued homepage responsiveness, and confirmation that CineArt still exposed no seat-map or booking action at M7P1F.

This PASS is the release gate permitting M7P1G to begin.
