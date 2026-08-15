# M10T1B — CineArt Exact Showtime Booking

Status: **implementation complete — exact-head gates pending**

Baseline: `cbf82af20886a2cad35c825711b7d78432756ab4` (M10T1A Emperor exact showtime booking)

## Objective

Give each CineArt showtime a safe official session-level target instead of leaving booking permanently disabled.

This checkpoint does not add seat selection, reservation, hold, payment, or any direct browser call to CineArt.

## Why the earlier M7P1H conclusion can now advance

M7P1H correctly left CineArt booking disabled because its reconnaissance did not yet prove a current public booking/deep-link contract. That historical decision remains recorded unchanged.

Later production work established stronger first-party evidence:

- the CineArt normalized show id is already the authoritative key used by HK Cinema for a specific session;
- the production Worker already requests the official current route `https://cinearthouse.com.hk/hk/show/<showId>` for that exact show;
- the returned show page is already the source used to validate the same movie/show identity before consuming strict ticket-price and seat-state evidence;
- the same show id is also the key used by the existing CineArt seat-map flow;
- historical official CineArt seat routes likewise used a show-id keyed route, providing continuity evidence rather than a guessed cross-provider mapping.

M10T1B therefore does not invent a new identifier or translate between unrelated IDs. It exposes the exact current first-party show route already used by the provider adapter.

## Implementation

### Worker provider ownership

`worker/src/providers/cineart-showtimes.js` now owns:

`buildCineArtSessionBookingUrl(showSourceId)`

Rules:

- strip an optional `cineart:` namespace;
- require a numeric show id;
- return `https://cinearthouse.com.hk/hk/show/<showId>`;
- return `null` for missing or malformed ids.

`publicSession()` writes this URL into each normalized CineArt session.

### Existing edge-cache compatibility

M7P1F/M7P1G showtime snapshots can remain in Cloudflare cache for several minutes and contain `bookingUrl:null`.

`withCacheState()` now rehydrates `bookingUrl` from each cached session's authoritative `sourceId` before returning it. This avoids waiting for the stale cache TTL to expire after deployment and does not change cache ownership, TTLs, or request fan-out.

### Browser adapter

`app/providers/cineart.js` does not construct CineArt URLs. It only carries `session.bookingUrl` through:

- comparison normalization;
- CineArt seat-map view-model context.

This preserves the provider/Worker as the deep-link owner.

### Registry

CineArt `booking` changes from `false` to `true` in `app/provider-registry.js` only after the exact session URL is available.

The existing shared comparison/detail renderers already require both:

1. booking capability available; and
2. a non-null session `bookingUrl`.

No shared booking renderer change is needed.

## Historical tests

M7P1D and M7P1H checkpoint documents are intentionally not rewritten. Their original capability boundary remains historical evidence.

Their regression tests are adjusted only where they previously treated the *current* Registry/session output as permanently frozen at `booking:false` / `bookingUrl:null`.

## Safety boundary

- no Broadway, MCL or Emperor behavior change;
- no new provider;
- no shared comparison renderer change;
- no movie-detail renderer ownership change;
- no CineArt POST request;
- no seat hold/reservation/payment;
- no direct browser request to CineArt;
- no Worker request concurrency or timeout change;
- no seat-state or seat-geometry parser change;
- no PWA/Service Worker lifecycle change.

## Validation contract

M10T1B adds regression coverage for:

- numeric show id → exact `/hk/show/<showId>` target;
- namespaced `cineart:<showId>` normalization;
- malformed IDs fail closed to `null`;
- pre-existing edge snapshots with `bookingUrl:null` are rehydrated without network access;
- Registry advertises CineArt booking only after the provider path carries the URL;
- the browser CineArt adapter does not hard-code `cinearthouse.com.hk`;
- Registry still loads before the CineArt adapter.

## Required gates

Before merge:

1. full Node regression suite;
2. Chromium install;
3. mobile browser smoke;
4. CineArt Candidate Validation exact-head gate;
5. branch diff review against `main`;
6. exact-head mergeability check.

After squash merge:

1. merged-main regression + Chromium + mobile smoke;
2. GitHub Pages deployment;
3. Cloudflare `Workers Builds: hk-cinema-api` production deployment.

Real-device acceptance should then confirm that tapping a CineArt showtime's purchase action opens the matching official CineArt show/session page.
