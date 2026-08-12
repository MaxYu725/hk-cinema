# M7C checkpoint — CineArt normalized provider adapter + catalogue snapshot

Status: **complete**

M7C is the first production registration of CineArt / 影藝戲院. It wires a normalized catalogue path and Data Health ownership while deliberately keeping showtimes, detailed prices, seats and booking disabled in the production provider capability descriptor until M7D.

## Runtime checkpoint

- PR: #89 — `M7C: add normalized CineArt catalogue adapter`
- PR final head: `4dfd765fa8159075c33d6b7eb4537a52be6193d0`
- Squash-merged application/runtime SHA: `d5c9484e502dd79493cc647bc863367b34db8d26`
- PR Run #514: regression tests + Chromium mobile smoke passed on the final head.
- CineArt Candidate Validation Run #10: M7A + M7B + M7C live gates passed on the final Cloudflare branch preview.
- Final-head Cloudflare preview deployment succeeded for `4dfd765f`.
- Main Run #515: regression tests + Chromium mobile smoke + GitHub Pages deploy passed.

The docs commits created after `d5c9484e...` do not replace the authoritative M7C application/runtime SHA above.

## Production provider descriptor

`app/provider-registry.js` now contains CineArt as the fourth production provider descriptor.

M7C capability state:

- catalogue: **supported / wired**
- showtimes: **not yet wired**
- prices: **not yet wired**
- seatSummary: **not yet wired**
- seatMap: **not yet wired**
- booking: **not yet wired**

This is intentionally narrower than the upstream data proven in M7B. M7B proved that showtimes, detailed ticket prices and read-only seats exist upstream; M7C only advertises the capability that has a complete production adapter path.

## Normalized catalogue path

Production endpoint:

`GET /api/cineart/catalogue`

Source ownership:

1. one bounded GET to `https://cinearthouse.com.hk/hk` on a fresh cache miss;
2. parse the current structured Next.js Flight props;
3. normalize current/upcoming movie entries;
4. return a provider-neutral catalogue payload to the browser adapter.

The normal home catalogue path does **not** execute the M7B 2–3 request diagnostic flow and does not fetch show detail.

### Current/upcoming split

M7C uses Hong Kong calendar date and `openingDate` together with current/future live show relations:

- future `openingDate` -> `coming`;
- released movie with a current/future published, non-held show -> `now`;
- released movie with no remaining live show is excluded from the current list.

This avoids reintroducing old CineArt catalogue entries merely because they remain present in the upstream movie array.

## Cache / stale ownership

Worker-side catalogue cache:

- fresh edge layer: **60 seconds**;
- stale fallback layer: **30 minutes**;
- fresh miss -> one `/hk` network request;
- successful network result asynchronously refreshes both cache layers;
- upstream failure may fall back to the bounded stale layer;
- responses expose `network`, `fresh-edge` or `stale-edge` cache state;
- stale fallback is reported as degraded rather than fresh.

Browser-side fallback:

- last valid normalized CineArt catalogue may be retained locally for up to **30 minutes**;
- it is used only as a bounded fallback/loading snapshot while a new Worker request is attempted.

Live cinema data remains outside the Service Worker shell cache.

## Data Health ownership

CineArt now participates in the production Data Health model as the fourth registry provider.

`app/cineart-status.js`:

- publishes cached catalogue state while refreshing;
- reports fresh network/edge success;
- reports stale Worker fallback as degraded;
- reports local fallback as degraded when refresh fails;
- reports an error only when no usable bounded fallback exists.

The existing aggregate Worker `probeAll()` remains limited to Broadway/MCL/Emperor at this checkpoint. The explicit CineArt probe remains a dedicated source-health diagnostic, while app Data Health now owns CineArt catalogue freshness.

## Home integration boundary

M7C adds `app/multi-provider-registry-extension.js` as a generic extension point for providers beyond the mature Broadway/MCL/Emperor home orchestration.

A provider may contribute movie cards only when its registry descriptor has both:

- `catalogue: true`
- `showtimes: true`

CineArt has `catalogue: true` but `showtimes: false` in M7C, therefore:

- its production catalogue is loaded and health-checked;
- it does **not** create CineArt-only movie cards yet;
- it does **not** add CineArt source IDs to shared cards yet;
- users cannot enter a comparison page that would call a non-existent CineArt showtime route.

M7D can enable the existing generic path by wiring the showtime adapter and changing the proven capability state. No CineArt-name branch is required in shared Metro presentation.

## Registry-extension review hardening

PR #89 automated review identified a future-provider mutation loop: once an extra provider became home-eligible, provider-only card replacement could trigger the extension's own `MutationObserver` repeatedly.

The final M7C head fixes this by:

- disconnecting the grid observer during extension-owned reconciliation;
- restoring observation in `finally`;
- adding a regression assertion for this ownership rule.

The two P1 review findings for stale three-provider test assumptions and the Flight cache fixture were also corrected. All three review threads were replied to and resolved before merge.

## Final-head live evidence

CineArt Candidate Validation Run #10 succeeded on the first attempt for all three gates.

M7C normalized catalogue result:

- now: **14** movies
- coming: **6** movies
- upstream movies: **22**
- upstream shows: **643**
- sites: **5**
- houses: **25**
- cache state: **fresh-edge**
- stale: **false**

The same final-head run also re-confirmed M7A origin reachability and M7B show-detail/seat source access.

## Fixed rules after M7C

1. `d5c9484e...` is the authoritative M7C application/runtime SHA.
2. Do not turn a CineArt capability true merely because M7B proved the upstream field exists; the production adapter path must be complete.
3. Do not expose CineArt movie cards until production showtimes are wired.
4. Normal home catalogue fetch owns one CineArt `/hk` source request on a fresh miss; show-detail enrichment stays lazy.
5. Keep the Worker cache bounded: 60-second fresh plus 30-minute stale fallback unless new evidence justifies a change.
6. Live data remains outside Service Worker shell caching.
7. Preserve the M7B `A/H/U/L` seat semantics and never treat home `avaliable` as strict selectable seats.
8. Do not add CineArt-specific branches to shared Metro presentation.
9. The generic registry extension must suppress observation of its own DOM reconciliation.
10. Existing Broadway/MCL/Emperor behavior remains the regression baseline.

## Next bounded checkpoint

**M7D — CineArt showtimes + comparison + optional lazy enrichment**

M7D should first wire normalized CineArt showtimes into the existing shared comparison path. Only after that path is stable should the provider descriptor enable `showtimes`, which will also allow the generic home extension to expose CineArt catalogue matches/cards. Detailed prices and strict seat information should remain lazy and should be enabled only as their normalized production paths are completed.
