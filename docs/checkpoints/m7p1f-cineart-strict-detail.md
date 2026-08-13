# M7P1F checkpoint — CineArt selected-date strict detail

Status: **implementation in progress — automated/live/merge/device gates pending**

Baseline: `27a2ee8f87b0934ded9bb333ba4fd8280bf68f1c` (accepted M7P1E)

M7P1E Android installed-PWA acceptance: **PASS**.

The user completed the deployed M7P1E real-device acceptance gate and reported normal operation. This PASS is the release gate permitting M7P1F to begin.

## Scope

M7P1F upgrades CineArt comparison precision without enabling seat-map or booking.

The existing production route remains:

`GET /api/cineart/movies/<movieSourceId>/shows`

The route still obtains the normal CineArt `/hk` home Flight snapshot first. Only the currently selected date is eligible for bounded show-detail enrichment.

## Bounded selected-date detail policy

- maximum concurrent CineArt show-detail requests: 3;
- maximum detail requests per selected date: 6;
- per-show detail timeout: 4.5 seconds;
- public strict-detail cache: 20 seconds;
- sessions beyond the per-date limit remain on M7P1E coarse data;
- any individual detail failure falls back to the existing coarse session and must not fail the whole comparison request.

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

The comparison card continues to use the adult price when available, then display/face fallback.

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

The CineArt browser adapter still does not implement `comparison.fetchShows`.

Shared `provider-compare-v4.js` remains the only browser showtime transport owner. The CineArt adapter only synchronously normalizes the returned Worker session:

- strict summary → selectable seat text/class;
- coarse summary → M7P1E non-selectable wording;
- detailed price → adult/display/face priority.

No CineArt MutationObserver or IntersectionObserver lifecycle is introduced.

## Explicit boundaries

M7P1F does **not** enable:

- `seatMap` capability;
- CineArt seat-state arrays in public showtime payloads;
- CineArt seat-plan geometry in public showtime payloads;
- a CineArt seat-map route or UI;
- booking URLs;
- purchase, hold or reservation calls;
- direct browser requests to `cinearthouse.com.hk`;
- a second browser showtime lifecycle owner;
- PWA or Service Worker changes.

The Worker manifest advertises CineArt as:

`catalogue-showtimes-detailed-price-strict-seats-production-seatmap-candidate-readonly`

Global Worker `/health` must remain `phase: "6G"`.

## Required pre-merge gates

The exact PR head must pass:

1. full Node regression suite;
2. Chromium install;
3. mobile browser smoke;
4. M7P1B discovery revalidation;
5. M7P1C catalogue revalidation;
6. M7P1D showtime revalidation;
7. M7P1E coarse-price/coarse-seat revalidation;
8. M7P1F selected-date strict-detail live validation;
9. at least one current selected-date CineArt session resolves strict seat counts;
10. at least one current selected-date CineArt session resolves detailed price evidence;
11. `allSessions` remains coarse and does not expose strict detail;
12. public sessions contain no `seatStates` or `seatPlan` fields;
13. booking remains null and POST remains 405;
14. exact-head diff review finds no PWA/SW/seat-map UI drift.

## Post-merge gate

After squash merge, merged-main regression, Chromium, mobile smoke and GitHub Pages deployment must pass.

Because CineArt previously caused an installed-PWA freeze, Android installed-PWA acceptance remains mandatory before the next CineArt capability stage. The device check must cover repeated open/close cycles, date switching, detailed price rendering, strict `可選` rendering where available, coarse fallback wording where strict detail fails or is limited, and confirmation that no CineArt seat-map or booking action appears.
