# M10T1A — Emperor Exact Showtime Booking

Status: **implementation complete — PR / CI gate pending**

Baseline: `main@d7cc33501ca4d1cc452ebbf8b8677bbea44ee2b8`

## Objective

Fix the existing Emperor booking flow so a user choosing a specific cinema/time is sent to that exact official Emperor session instead of the movie-level showtimes page.

No new cinema provider is added in this checkpoint. CineArt booking revalidation is explicitly deferred to M10T1B.

## Root cause

The Emperor Worker already receives authoritative session identifiers from the current upstream schedule response:

- `scheduleId`
- `filmUniqueId`
- `cinemaId` / `cinemaLinkId`
- `hallId`
- `scheduleKey`

However `normalizeSchedule()` previously discarded that precision for booking and generated the same movie-level URL for every session:

`https://www.emperorcinemas.com/showtimes?...&filmUniqueId=<film>`

The shared detail renderer and comparison runtime already prefer `session.bookingUrl`, so the UI layer was not the source of the error.

## Current official route evidence

Current Emperor pages/searchable official URLs in August 2026 show the live seat route in this form:

`https://www.emperorcinemas.com/seat?cinemaId=<cinema>&cinemaLinkId=<cinemaLink>&filmUniqueId=<film>&scheduleId=<schedule>&wapid=ECML_WEB_PROD_S_MPS`

Official indexed seat-plan pages also resolve to a single session/seat-selection flow rather than a movie-level listing.

M10T1A therefore uses only first-party identifiers already returned by the Emperor upstream. No WMOOV runtime dependency is introduced.

## Implementation

`worker/src/providers/emperor.js` now owns a pure `buildEmperorSessionBookingUrl()` helper.

For a normalized Emperor session:

1. `scheduleId` comes from the upstream schedule;
2. `filmUniqueId` comes from the same schedule;
3. `cinemaLinkId` prefers the schedule value and falls back to group cinema metadata;
4. `cinemaId` uses its own upstream value when available and otherwise uses `cinemaLinkId`;
5. the official `/seat` URL includes `wapid=ECML_WEB_PROD_S_MPS`.

If exact session identity is incomplete, the helper returns `null` instead of silently constructing a movie-level booking URL.

The movie object still retains its movie-level `/showtimes?...filmUniqueId=...` URL for the separate hero-level official action. This preserves the distinction:

- movie action → official movie showtimes page;
- session action → exact official seat/purchase page.

## UI impact

No browser renderer change is required.

Existing owners already consume the session URL:

- shared movie detail prefers `showtime.bookingUrl`;
- comparison normalization prefers `session.bookingUrl`;
- provider capability `emperor.booking` is already true.

After the Worker update reaches production, each purchasable Emperor session can therefore expose the exact official purchase target without changing Metro layout or interaction ownership.

## Safety boundary

- no new provider;
- no Provider Registry capability change;
- no browser fetch ownership change;
- no seat selection/hold/payment performed by HK Cinema;
- no external intermediary or WMOOV runtime URL;
- no guessed `scheduleId`;
- no synthesized session URL when required identifiers are absent;
- no PWA / Service Worker change.

## Tests

`tests/m10t1a-emperor-exact-booking.test.mjs` verifies:

- official origin and `/seat` pathname;
- all exact session query parameters;
- `cinemaLinkId → cinemaId` safe fallback;
- fail-closed behavior for incomplete session identity;
- session normalization no longer uses the movie-level `/showtimes` route;
- movie-level fallback remains separate.

## Acceptance gate

Before merge:

1. exact final head full Node regression PASS;
2. Chromium / mobile browser smoke PASS;
3. branch behind `main` by 0;
4. diff confirms only Emperor booking normalization, tests and checkpoint documentation changed;
5. no CineArt/new-provider work mixed into this checkpoint.

After squash merge:

1. merged-main regression PASS;
2. mobile browser smoke PASS;
3. GitHub Pages deploy PASS;
4. production Worker should be checked to confirm returned Emperor sessions expose `/seat?...scheduleId=...` rather than movie-level `/showtimes` links.
