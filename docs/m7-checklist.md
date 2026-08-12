# Phase M7 — CineArt fourth-provider integration

Status: **IN PROGRESS — M7A/M7B/M7C/M7D complete**

Phase M7 starts from the completed M6 provider-expansion contract. Do not reopen the Metro redesign while onboarding the fourth provider.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Tracking issue: #86
- Selected provider: **CineArt / 影藝戲院**
- M7A: **complete**
- M7B: **complete**
- M7C: **complete**
- M7D: **complete**
- Authoritative M7 application/runtime SHA: `a3144059bb2b0c2cded2f1255ec2d2879283eb0e`
- M7A PR: #87 — `M7A: add CineArt live provider probe`
- M7B PR: #88 — `M7B: discover CineArt catalogue and show sources`
- M7C PR: #89 — `M7C: add normalized CineArt catalogue adapter`
- M7D PR: #90 — `M7D: add CineArt showtimes and lazy comparison enrichment`
- M7D PR final head: `03412625b28b59bdd6914f45d64c639116e907d0`
- M7D squash merge: `a3144059bb2b0c2cded2f1255ec2d2879283eb0e`
- Final-head Deploy Run #529: regression tests + Chromium mobile smoke passed.
- Final-head CineArt Candidate Validation Run #24: M7A + M7B + M7C + M7D live gates passed against the final Cloudflare branch preview.
- Main Run #530: regression tests + Chromium mobile smoke + GitHub Pages deploy passed.
- GitHub Pages deployment `5871180924`: `success`, serving merge SHA `a3144059bb2b0c2cded2f1255ec2d2879283eb0e`.
- M7B source contract: `docs/checkpoints/m7b-cineart-data-source-discovery.md`
- M7C adapter checkpoint: `docs/checkpoints/m7c-cineart-provider-adapter.md`
- Next bounded work: **M7E — real-device release gate + final M7 handoff**.

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
- M7C established the normalized catalogue/cache/Data Health path;
- M7D established production showtime comparison plus bounded lazy price/seat-summary enrichment without enabling booking or a full seat map.

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

Important normalization rule: upstream home field `avaliable` is **not** strict selectable availability. Live sample `80483` had 381 seats with home `sold=50` and `avaliable=331`, while detail returned `A=327`, `H=3`, `U=50`, `L=1`. Thus `U == sold`, while `A + H + L == avaliable`. Seat normalization must not count held or locked seats as selectable.

The uploaded HAR had 23 movies and 727 shows for an earlier snapshot. M7B final-head live validation later returned different counts, demonstrating that the parser reads current upstream data rather than hard-coded HAR values.

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

This conservative descriptor was intentional. M7B upstream evidence alone did not make a production capability supported; the complete adapter path had to exist first.

### M7C cache/request ownership

Normal CineArt catalogue load:

1. check 60-second fresh edge catalogue cache;
2. on miss, issue one bounded `GET /hk` upstream request;
3. normalize the current/upcoming catalogue;
4. refresh fresh + 30-minute stale edge layers;
5. on upstream failure, use the stale layer only when still bounded/valid.

Browser fallback may retain the last valid normalized catalogue for up to 30 minutes while a refresh is attempted. Live cinema data remains outside Service Worker shell caching.

### M7C home/comparison safety gate

CineArt became a real production registry provider and participated in Data Health, but M7C intentionally did not expose CineArt movie cards. The generic extra-provider home extension only contributed cards/source IDs when both `catalogue` and `showtimes` were true. M7D subsequently satisfied this gate.

### M7C review hardening

PR #89 automated review identified and resolved:

- two P1 stale-test/fixture failures after fourth-provider registration;
- one P2 future-provider MutationObserver self-trigger loop.

The observer is disconnected during extension-owned reconciliation and restored in `finally`. All three review threads were resolved before merge.

M7C exit condition: **met**.

Detailed checkpoint: `docs/checkpoints/m7c-cineart-provider-adapter.md`.

## M7D — showtimes + comparison + lazy enrichment

Status: **complete**

- [x] Add normalized CineArt showtime adapter/Worker route using the M7B-proven home show data.
- [x] Add CineArt showtimes to the shared provider-neutral comparison path.
- [x] Preserve `Promise.allSettled` provider failure isolation and foreground request cancellation.
- [x] Enable production `showtimes` capability only after the complete route is wired and validated.
- [x] Let the generic registry home extension expose CineArt matches/cards after `showtimes:true`.
- [x] Add base price from home show data and detailed ticket-type prices through lazy GET-only show-detail enrichment.
- [x] Keep home `avaliable` explicitly coarse and never map it to strict selectable `available`.
- [x] Add strict lazy seat summary from `A/H/U/L` detail states.
- [x] Keep CineArt full `seatMap:false`; read-only geometry remains deferred to a separate bounded checkpoint.
- [x] Keep CineArt `booking:false`; no purchase/hold/booking POST is introduced.
- [x] Use 60-second fresh + 10-minute bounded stale edge caching for normalized showtime data.
- [x] Use only a 20-second fresh edge cache for strict show detail; do not serve stale strict seat state.
- [x] Bound lazy detail enrichment to max concurrency 2 with lifecycle cancellation.
- [x] Preserve provider-neutral Metro/Classic presentation; no CineArt-specific rendering branch.
- [x] Keep live cinema data outside Service Worker shell caching.
- [x] Propagate new provider source IDs into grouped movie aggregates so grouped CineArt matches are not lost.
- [x] Disambiguate simultaneous same-cinema/same-time CineArt sessions by rendered house/secondary text before lazy enrichment.

### M7D production capability descriptor

- catalogue: **true**
- showtimes: **true**
- prices: **true**
- seatSummary: **true**
- seatMap: **false**
- booking: **false**

### M7D Worker/runtime contract

Production paths added by M7D:

- normalized CineArt movie showtimes: `/api/cineart/movies/<movieId>/shows`;
- lazy GET-only CineArt show detail: `/api/cineart/shows/<showId>/detail?movieId=<movieId>`.

The showtime path normalizes current CineArt show IDs, dates/times, cinema/house identity and base price from the current `/hk` Flight source. The detail path enriches visible/near-visible comparison rows with ticket-type price data and strict seat summaries from current detail state.

### M7D cache/request ownership

Showtime path:

1. check 60-second fresh edge showtime cache;
2. on miss, read the bounded current `/hk` source and normalize only the target movie's showtimes;
3. maintain a 10-minute bounded stale showtime fallback;
4. preserve provider failure isolation in shared comparison.

Strict lazy detail path:

1. GET-only show detail;
2. at most one RSC fallback GET when required by the current page generation;
3. 20-second fresh edge cache only;
4. no stale seat-state fallback;
5. client-side enrichment concurrency capped at 2 and cancelled with comparison lifecycle changes.

### M7D review hardening

PR #90 automated review raised four P1 findings; all were fixed and all review threads were resolved before merge:

- grouped aggregate rebuild initially omitted CineArt source IDs;
- simultaneous sessions could coalesce under the wrong house during lazy detail enrichment;
- registry contract tests had to advance from M7C to M7D capabilities/version;
- the production-default Metro marker required by the baseline contract had to be preserved.

### M7D final CI/live gate

The original Run #525 Chromium mobile smoke blocker was investigated from the actual Playwright diagnostics rather than treated as a product regression. Subsequent traces proved the presentation smoke tests were coupled to variable live provider responses, including an auto-selected Broadway `?date=` showtime request that could remain pending long enough to strand the comparison UI in loading state. A temporary single-worker hypothesis was tested and rejected.

Final correction:

- deterministic Broadway fixtures now own Classic/release presentation smoke network boundaries;
- unrelated live providers fail fast inside those presentation tests;
- live CineArt reachability/contracts remain covered separately by the dedicated Cloudflare candidate-validation workflow;
- normal Playwright worker policy was restored; assertions were not relaxed or skipped.

Final-head evidence at `03412625b28b59bdd6914f45d64c639116e907d0`:

- Deploy Run #529: regression **success**;
- Deploy Run #529: Chromium mobile smoke **success**;
- CineArt Candidate Validation Run #24: M7A/M7B/M7C/M7D live validation **success**;
- no Playwright failure artifact was emitted by the successful final-head run.

Merge/release evidence:

- PR #90 squash-merged into `main` as `a3144059bb2b0c2cded2f1255ec2d2879283eb0e`;
- Main Run #530 regression **success**;
- Main Run #530 Chromium mobile smoke **success**;
- Main Run #530 GitHub Pages deploy **success**;
- GitHub Pages deployment `5871180924` targets `main` SHA `a3144059bb2b0c2cded2f1255ec2d2879283eb0e` and reports `success`.

M7D exit condition: **met**. CineArt now participates in production catalogue/showtime comparison with base/detailed prices and strict lazy seat summaries, while seat-map and booking boundaries remain disabled.

## M7E — release gate

Status: **not started — stop at M7D checkpoint**

Evidence already satisfied during the M7D merge gate:

- [x] Regression suite passes after CineArt comparison integration.
- [x] Chromium mobile smoke passes after CineArt comparison integration.
- [x] Cloudflare Worker final-head deployment/live validation succeeds.
- [x] Main Pages deployment succeeds after merge.

Remaining M7E work:

- [ ] Real-device check confirms CineArt catalogue/comparison and enabled price/seat-summary behavior.
- [ ] Final M7 handoff records the current provider contract, release evidence and known limitations.

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
