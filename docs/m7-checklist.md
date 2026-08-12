# Phase M7 — CineArt fourth-provider integration

Status: **IN PROGRESS — M7A/M7B/M7C complete**

Phase M7 starts from the completed M6 provider-expansion contract. Do not reopen the Metro redesign while onboarding the fourth provider.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Tracking issue: #86
- Selected provider: **CineArt / 影藝戲院**
- M7A: **complete**
- M7B: **complete**
- M7C: **complete**
- Authoritative M7 application/runtime SHA: `d5c9484e502dd79493cc647bc863367b34db8d26`
- M7A PR: #87 — `M7A: add CineArt live provider probe`
- M7B PR: #88 — `M7B: discover CineArt catalogue and show sources`
- M7C PR: #89 — `M7C: add normalized CineArt catalogue adapter`
- M7C PR final head: `4dfd765fa8159075c33d6b7eb4537a52be6193d0`
- PR Run #514: regression tests + Chromium mobile smoke passed.
- CineArt Candidate Validation Run #10: M7A + M7B + M7C live gates passed against the final Cloudflare branch preview.
- Final-head Cloudflare preview deployment succeeded.
- Main Run #515: regression tests + Chromium mobile smoke + GitHub Pages deploy passed.
- M7B source contract: `docs/checkpoints/m7b-cineart-data-source-discovery.md`
- M7C adapter checkpoint: `docs/checkpoints/m7c-cineart-provider-adapter.md`
- Next bounded work: **M7D — CineArt showtimes + comparison + optional lazy enrichment**.

## Baseline

- M6 final handoff: `docs/m6-handoff.md`
- M6 authoritative application/runtime SHA: `26b8384466eb107322e1b714aedb093c94973c9f`
- M6 final docs merge: `b72c9017e9f35de9d80f3528117c4d8648a801b0`
- Production UI: Metro
- Classic fallback: `?skin=classic`

## Selected fourth provider

**CineArt / 影藝戲院** is now registered as the fourth production provider descriptor.

Why it remains the selected provider:

- active Hong Kong circuit with multiple locations;
- current official `/hk` origin is reachable by the Cloudflare Worker;
- current Next.js Flight source exposes structured movie/show/site/house data;
- current show-detail source exposes ticket types, seat states and read-only seat-plan geometry;
- M7C now has a normalized production catalogue/cache/Data Health path based on current routes rather than obsolete ticketing pages.

M7C registers only the capability that is actually wired end-to-end: `catalogue`. M7B-proven showtimes/prices/seats remain disabled in the production descriptor until their normalized production paths are completed in M7D.

## M7A — live provider probe

Status: **complete**

- [x] Add CineArt to a candidate-only Worker provider-probe allow-list.
- [x] Keep production `probeAll()` limited to Broadway/MCL/Emperor.
- [x] Probe the current official `/hk` site with a 4.5-second timeout and bounded streaming body scan.
- [x] Stop reading once brand + at least three current cinema markers are found; hard-cap the scan at 4 MiB.
- [x] Verify current brand/site-shell evidence and cinema-directory markers.
- [x] Keep probe `no-store` and outside Service Worker caching.
- [x] Add regression tests for healthy/invalid/oversized CineArt probe responses.
- [x] Add a persistent CineArt candidate-validation workflow for Cloudflare branch previews.
- [x] Deploy final branch preview and run live `/api/providers/probe/cineart`.
- [x] Confirm Cloudflare Worker egress can reach the current CineArt origin.

Live evidence:

- endpoint: branch-preview `/api/providers/probe/cineart`;
- result: `healthy: true`;
- detected cinemas: `maritime-square`, `jp`, `megabox`, `hollywood`, `mostown`;
- cinema count: 5;
- current site generation exposes Next.js evidence.

Initial M7A live validation correctly failed before merge because the current homepage advertises a body larger than the first 1 MiB cap. The probe was corrected to bounded streaming evidence detection rather than removing the safety bound or buffering the entire page.

M7A exit condition: **met**.

## M7B — active data-source discovery

Status: **complete**

- [x] Identify the current official catalogue/showtime data source used by the `/hk` web generation.
- [x] Prefer structured Next.js Flight/RSC data over scraping rendered HTML.
- [x] Confirm stable source IDs for movies and show/session records.
- [x] Confirm cinema identifiers for the five active CineArt locations.
- [x] Confirm base price is available at showtime level and detailed ticket types are available through show detail.
- [x] Confirm coarse seat summary and read-only detailed seat states/full seat-plan geometry can be read without a purchase-side effect.
- [x] Record bounded upstream request ownership and production cache boundary.
- [x] Validate the same sources live through the Cloudflare branch preview rather than relying only on the uploaded HAR.

### M7B source contract

Home source:

- `GET https://cinearthouse.com.hk/hk`
- structured Next.js Flight props expose `movies`, `shows`, `showSites`, `showDates`, `houseList`;
- individual show records include stable show/movie/site/house IDs, date/time, base price and coarse seat counters.

Show-detail source:

- `GET /hk/show/<showId>`;
- GET-only RSC fallback for the same route when the direct document does not embed detail props;
- exposes detailed ticket types/prices, `seatStatus`, seat classes and referenced seat-plan geometry.

Stable current site IDs:

- `16 / MB` — MegaBox
- `17 / MT` — Maritime Square / 青衣城
- `18 / JP` — JP / 翡翠明珠
- `19 / HW` — Hollywood / 荷里活
- `23 / MO` — MOSTown / 新港城中心

Seat-state semantics proven from the current source/frontend:

- `A` = available/selectable
- `H` = held
- `U` = sold/unavailable
- `L` = locked

Important normalization rule: upstream home field `avaliable` is **not** strict selectable availability. Live sample `80483` had 381 seats with home `sold=50` and `avaliable=331`, while detail returned `A=327`, `H=3`, `U=50`, `L=1`. Thus `U == sold`, while `A + H + L == avaliable`. Future seat normalization must not count held or locked seats as selectable.

The uploaded HAR had 23 movies and 727 shows for an earlier snapshot. M7B final-head live validation later returned 22 movies and 659 shows. The changing counts demonstrate that the parser reads current upstream data rather than hard-coded HAR values.

M7B diagnostic request ownership is bounded to:

1. one `/hk` home GET;
2. one `/hk/show/<showId>` GET;
3. at most one RSC fallback GET if the direct show document lacks the detail props.

M7B exit condition: **met**. Current catalogue + showtime inputs can be normalized without depending on obsolete 2025 routes.

Detailed checkpoint: `docs/checkpoints/m7b-cineart-data-source-discovery.md`.

## M7C — provider adapter + catalogue

Status: **complete**

- [x] Register `cineart` in `provider-registry.js` with only the capability wired end-to-end in this checkpoint.
- [x] Add provider-specific normalized catalogue/network/cache ownership around the proven Flight source.
- [x] Normalize CineArt catalogue entries through the shared provider data shape.
- [x] Expose `/api/cineart/catalogue` backed by one `/hk` source request on a fresh miss.
- [x] Define a 60-second fresh edge cache and 30-minute stale edge fallback.
- [x] Add a 30-minute bounded browser catalogue fallback.
- [x] Add CineArt loading/fresh/degraded/error reporting to production Data Health.
- [x] Add a registry-driven extension point for fourth/future home providers.
- [x] Gate home-card participation on `catalogue && showtimes`.
- [x] Keep CineArt movie cards disabled until M7D wires production showtimes.
- [x] Keep existing Broadway/MCL/Emperor behavior unchanged under regression/mobile smoke.
- [x] Fix and regression-lock the registry extension's MutationObserver ownership before showtimes are enabled.

### M7C production capability descriptor

- catalogue: **true**
- showtimes: **false**
- prices: **false**
- seatSummary: **false**
- seatMap: **false**
- booking: **false**

This conservative descriptor is intentional. M7B upstream evidence alone does not make a production capability supported; the complete adapter path must exist first.

### M7C cache/request ownership

Normal CineArt catalogue load:

1. check 60-second fresh edge catalogue cache;
2. on miss, issue one bounded `GET /hk` upstream request;
3. normalize the current/upcoming catalogue;
4. refresh fresh + 30-minute stale edge layers;
5. on upstream failure, use the stale layer only when still bounded/valid.

Browser fallback may retain the last valid normalized catalogue for up to 30 minutes while a refresh is attempted. Live cinema data remains outside Service Worker shell caching.

### M7C home/comparison safety gate

CineArt is now a real production registry provider and participates in Data Health, but M7C intentionally does not expose CineArt movie cards. The generic extra-provider home extension only contributes cards/source IDs when both `catalogue` and `showtimes` are true. This prevents users from opening a CineArt comparison flow before a production showtime endpoint exists.

### M7C final-head live evidence

CineArt Candidate Validation Run #10 returned:

- now: 14 movies
- coming: 6 movies
- source movies: 22
- source shows: 643
- sites: 5
- houses: 25
- cache state: `fresh-edge`
- stale: false

The same final-head run revalidated M7A and M7B successfully.

### M7C review hardening

PR #89 automated review identified and resolved:

- two P1 stale-test/fixture failures after fourth-provider registration;
- one P2 future-provider MutationObserver self-trigger loop.

The observer is now disconnected during extension-owned reconciliation and restored in `finally`. All three review threads were resolved before merge.

M7C exit condition: **met**. CineArt has a normalized production catalogue/cache/Data Health path without exposing incomplete showtime/comparison behavior.

Detailed checkpoint: `docs/checkpoints/m7c-cineart-provider-adapter.md`.

## M7D — comparison / booking / optional enrichment

- [ ] Add normalized CineArt showtime adapter/Worker route using the M7B-proven home show data.
- [ ] Add CineArt showtimes to the shared comparison path.
- [ ] Preserve `Promise.allSettled` failure isolation and foreground request cancellation.
- [ ] Enable production `showtimes` capability only after the complete route is validated.
- [ ] Let the generic registry home extension expose CineArt matches/cards only after `showtimes:true`.
- [ ] Add detailed ticket prices through lazy show-detail enrichment.
- [ ] Normalize coarse home seat summary without treating `avaliable` as selectable seats.
- [ ] Add strict seat summary/full seat map from `A/H/U/L` detail states only when the production normalizer/geometry adapter is complete.
- [ ] Preserve provider-neutral Metro presentation.
- [ ] Keep booking unsupported until a safe explicit booking contract is proven.

## M7E — release gate

- [ ] Regression suite passes after CineArt comparison integration.
- [ ] Chromium mobile smoke passes after CineArt comparison integration.
- [ ] Cloudflare Worker final-head deployment succeeds.
- [ ] Main Pages deployment succeeds after merge.
- [ ] Real-device check confirms CineArt catalogue/comparison and any enabled optional capability.
- [ ] Final M7 handoff records current provider contract and known limitations.

## Fixed rules

1. Do not add provider-name branches to shared presentation merely to support CineArt.
2. Provider-specific networking/parsing/seat geometry stays provider-specific.
3. `unsupported`, `unknown`, and `available` price/seat states remain distinct.
4. Live cinema data stays outside the Service Worker shell cache.
5. Do not use old `/seat/index/...` pages as a production dependency unless the current site still demonstrably uses them.
6. Do not mark a capability true before its production adapter path is wired, even when M7B has proven the upstream data exists.
7. Use bounded request concurrency and abortable foreground work.
8. Treat CineArt home `avaliable` as coarse remaining/not-sold, not strict selectable seats.
9. Keep normal CineArt home catalogue request ownership at one `/hk` upstream GET on a fresh cache miss.
10. Do not expose CineArt home cards until `showtimes` is wired and enabled.
11. The registry extension must not observe its own DOM reconciliation.
12. Stop after each bounded checkpoint and record PR/SHA/CI before proceeding.
