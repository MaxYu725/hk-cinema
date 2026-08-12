# Phase M7 — CineArt fourth-provider integration

Status: **IN PROGRESS — M7A/M7B complete**

Phase M7 starts from the completed M6 provider-expansion contract. Do not reopen the Metro redesign while onboarding the fourth provider.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Tracking issue: #86
- Selected candidate: **CineArt / 影藝戲院**
- M7A: **complete**
- M7B: **complete**
- Authoritative M7 application/runtime SHA: `dafdab741a0864d4e036dc345b548d052cbe99d0`
- M7A PR: #87 — `M7A: add CineArt live provider probe`
- M7B PR: #88 — `M7B: discover CineArt catalogue and show sources`
- M7B PR final head: `de1a62d427bca83536d4645549a78cb00c0dedba`
- PR Run #507: regression tests + Chromium mobile smoke passed.
- CineArt Candidate Validation Run #4: M7A origin probe + M7B live source discovery passed against the final Cloudflare branch preview.
- Final-head Cloudflare preview deployment succeeded.
- Main Run #508: regression tests + Chromium mobile smoke + GitHub Pages deploy passed.
- M7B source contract: `docs/checkpoints/m7b-cineart-data-source-discovery.md`
- Next bounded work: **M7C — normalized CineArt provider adapter + catalogue snapshot**.

## Baseline

- M6 final handoff: `docs/m6-handoff.md`
- M6 authoritative application/runtime SHA: `26b8384466eb107322e1b714aedb093c94973c9f`
- M6 final docs merge: `b72c9017e9f35de9d80f3528117c4d8648a801b0`
- Production UI: Metro
- Classic fallback: `?skin=classic`

## Selected candidate

**CineArt / 影藝戲院** is the first real fourth-provider candidate.

Why it is being tested first:

- active Hong Kong circuit with multiple locations;
- current official `/hk` origin is reachable by the Cloudflare Worker;
- current Next.js Flight source exposes structured movie/show/site/house data;
- current show-detail source exposes ticket types, seat states and read-only seat-plan geometry;
- the complete provider contract can therefore be built from current routes rather than obsolete ticketing pages.

CineArt is **not yet registered in the production provider registry**. M7A proves origin reachability; M7B proves the active current catalogue/show/detail source. M7C is the first phase that may register CineArt in the normalized production provider contract.

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

Live final-head evidence:

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

Important normalization rule: upstream home field `avaliable` is **not** strict selectable availability. Live sample `80483` had 381 seats with home `sold=50` and `avaliable=331`, while detail returned `A=327`, `H=3`, `U=50`, `L=1`. Thus `U == sold`, while `A + H + L == avaliable`. M7C/M7D must not count held or locked seats as selectable.

Live final-head discovery evidence:

- 22 movies
- 659 shows
- 5 sites
- 25 houses
- date range: 2026-08-12 through 2026-08-28
- sample show: `80483`
- sample ticket types: 9
- sample seat states: 381
- sample seat-plan geometry: 26 blocks, 1270 × 670

The uploaded HAR had 23 movies and 727 shows for an earlier snapshot of the same changing schedule. The different live counts are expected and demonstrate that the parser reads current upstream data rather than hard-coded HAR values.

M7B diagnostic request ownership is bounded to:

1. one `/hk` home GET;
2. one `/hk/show/<showId>` GET;
3. at most one RSC fallback GET if the direct show document lacks the detail props.

Production M7C must **not** run this full 2–3 request diagnostic flow on normal home load. It should build the CineArt home snapshot from one `/hk` request and fetch show detail lazily only when detailed price/seat enrichment is required. Live cinema data remains outside Service Worker shell caching; a short-lived application/Worker cache policy must be defined before production exposure.

M7B exit condition: **met**. Current catalogue + showtime inputs can be normalized without depending on obsolete 2025 routes.

Detailed checkpoint: `docs/checkpoints/m7b-cineart-data-source-discovery.md`.

## M7C — provider adapter + catalogue

- [ ] Register `cineart` in `provider-registry.js` with only proven/wired capabilities.
- [ ] Add provider-specific adapter/network/parser ownership around the proven Flight source.
- [ ] Normalize catalogue entries through the M6 contract.
- [ ] Publish a synchronous cached CineArt catalogue snapshot for shared home aggregation.
- [ ] Define short-lived CineArt source cache/stale policy without Service Worker live-data caching.
- [ ] Add provider-specific loading/error/stale state reporting.
- [ ] Keep existing Broadway/MCL/Emperor behavior unchanged.

## M7D — comparison / booking / optional enrichment

- [ ] Add CineArt showtimes to the shared comparison path.
- [ ] Preserve `Promise.allSettled` failure isolation and request cancellation.
- [ ] Add detailed ticket prices through lazy show-detail enrichment.
- [ ] Normalize coarse home seat summary without treating `avaliable` as selectable seats.
- [ ] Add strict seat summary/full seat map from `A/H/U/L` detail states only when the production normalizer/geometry adapter is complete.
- [ ] Preserve provider-neutral Metro presentation.
- [ ] Keep booking capability unknown/unsupported until a safe explicit booking contract is proven.

## M7E — release gate

- [ ] Regression suite passes after production CineArt integration.
- [ ] Chromium mobile smoke passes after production CineArt integration.
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
9. Stop after each bounded checkpoint and record PR/SHA/CI before proceeding.
