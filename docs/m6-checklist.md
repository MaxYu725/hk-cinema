# Phase M6 — durable progress checklist

This file is the recovery/checkpoint source of truth for Phase M6. If a chat/session is lost, read this file first, then issue #66, then verify current `main` before making new changes.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Production UI: Metro default
- Classic fallback: `?skin=classic`
- M6 tracking issue: #66
- M6A: **complete**
- M6B: **complete**
- M6C: **complete**
- Current stage: **M6D — expansion readiness review**
- Latest completed application checkpoint: **M6D Checkpoint 2B / PR #81**
- Authoritative application checkpoint: `c189cbb52c48321b96a90f3c9ecb639bc2a85cbc`
- PR #81 final branch Run #477: regression tests + Chromium mobile smoke passed
- PR #81 Cloudflare branch preview succeeded on final head `e329fa34ee38652f059164a90d5c831976096d1c`
- PR #81 automated review findings were addressed and both review threads are resolved
- Main Actions Run #478: regression tests + Chromium mobile smoke + GitHub Pages deploy passed
- Next planned work: **M6D Checkpoint 2C — MCL lazy metadata/price/bulk request concurrency + remaining duplicate-request behavior**

## Fixed M6 boundaries

- [x] Metro remains the production default.
- [x] Classic remains available throughout M6 as rollback/reference.
- [x] No speculative visual redesign during hardening.
- [x] No broad provider/parser rewrite.
- [x] No real new cinema chain until M6C contracts and M6D failure-isolation review are stable.
- [x] Service Worker activation stays controlled; do not restore automatic `skipWaiting()`.
- [x] Live cinema/API traffic remains outside the static PWA shell cache.
- [x] Multi-file work uses branch → PR → CI → squash merge.

## M6A — production baseline audit

Status: **complete**

- [x] Freeze the accepted Metro production baseline after M5/M5A.
- [x] Inventory shared/core, Phase 8/9/10, Classic and Metro presentation/runtime layers.
- [x] Record duplicate/ambiguous ownership without deleting code merely because it is old.
- [x] Lock Metro default + Classic fallback + PWA update/cache contracts in regression tests.
- [x] Record provider-expansion blockers for M6C.

Checkpoint:

- PR #67 — `Phase M6A: audit and freeze production baseline`
- merge commit: `38796462b75e0e9470dd5bea1a7e42ffabc523b6`
- audit: `docs/m6a-production-baseline-audit.md`

## M6B — presentation/runtime consolidation

Status: **complete**

### Checkpoint 1 — shared UI ownership

- [x] Neutral shared ownership for homepage tab counts and comparison heading sort.
- [x] Metro sole owner for home Data Health DOM placement.
- [x] Classic-only Data Health refresh behavior retained.
- PR #68 — merge `fc66de22009c7e654f5d0644932e78939d2d75f0`
- Notes: `docs/m6b-shared-ui-ownership.md`

### Checkpoint 2 — structured movie facts

- [x] Add aggregate classification, duration and release date.
- [x] Remove comparison dependence on rendered homepage metadata text.
- [x] Remove Metro hidden metadata separator bridge.
- PR #69 — merge `32cb3bc1615fba811ef36f48402b602539829bc5`
- Notes: `docs/m6b-aggregate-movie-facts.md`

### Checkpoint 3 — skin runtime ownership

- [x] Keep neutral transient sticky marker shared.
- [x] Make buffered sticky latch/collapse Classic-only.
- [x] Move Metro-only filter auto-close/outside-tap policy into `metro-runtime.js`.
- PR #70 — merge `7f03ad1a064a6d3641093a7669ef20dec29bbf28`
- Notes: `docs/m6b-skin-runtime-ownership.md`

### Checkpoint 4 — Metro seat-map CSS fold

- [x] Fold Broadway M4B row-label guard into `metro-m4-seat-view.css`.
- [x] Retire redundant `metro-m4b-seat-scroll-fix.css` production layer.
- PR #71 — merge `8bc54af1d631129d2937a22c4b7915f22e0b751a`
- Notes: `docs/m6b-seat-style-layer-fold.md`

### Checkpoint 5 — Metro homepage CSS fold

- [x] Fold `metro-m2-home-polish.css` into `metro-theme.css` with accepted values unchanged.
- [x] Retire redundant stylesheet link and add regression coverage.
- PR #73 — merge `4736d445e1ea7f7f236ab11ddb9c69c2f2b19366`
- Main Run #442 passed.

### M6B completion audit

- [x] Remaining Metro layers have distinct feature ownership; stop speculative folding.
- [x] Shared data contracts no longer depend on Metro rendered metadata.
- [x] Final architecture map recorded.
- PR #74 — authoritative M6B completion commit `554cab11c0f307b116abd7f2c135fdc26248b34f`
- Main Run #444 passed regression + Chromium mobile smoke + Pages deploy.
- Architecture: `docs/m6b-architecture-map.md`

## M6C — provider onboarding contract

Status: **complete**

### Checkpoint 1 — provider identity / registry

Status: **complete**

- [x] Add `app/provider-registry.js` as provider identity/capability metadata owner.
- [x] Define provider ID, display name, health label and capability flags.
- [x] Make Data Health enumerate registry providers instead of a fixed three-provider array.
- [x] Make provider-count/status/refresh/loading copy provider-neutral.
- [x] Prove Data Health scales to a fourth registry entry without integrating a real chain.
- [x] Keep existing Broadway/MCL/Emperor fetch/parser/report behavior unchanged.
- PR #75 — application commit `ed1c1f8957b241759e33c964ee17b28e381fcc0b`
- PR Run #447 passed; Cloudflare preview passed; main Run #448 passed.
- Notes: `docs/m6c-provider-registry-contract.md`

### Checkpoint 2 — normalized capability/data contract

Status: **complete, review-corrected**

Initial contract:

- [x] Add `app/provider-contract.js` defining catalogue, movie aggregate, showtime, price, seat summary, full seat map and booking surfaces.
- [x] Define `available`, `unknown` and `unsupported` optional-capability states.
- [x] Ensure unsupported price is not interpreted as HK$0.
- [x] Ensure unsupported seat data is not interpreted as sold out/no seats.
- [x] Keep supported-but-missing data `unknown` rather than permanently unsupported.
- [x] Add a hypothetical fourth-provider-shaped fixture with catalogue/showtimes/booking but no price/seat capabilities.
- [x] Keep capability evaluation descriptor-driven instead of branching on provider names.
- PR #76 — initial application commit `4e8c9bbfc610abb275bb0de18c81f3a91160f1ae`
- PR Run #449 passed; Cloudflare preview passed; main Run #450 passed.

Post-merge review correction:

- [x] Automated review found the movie aggregate contract used invented `key` / `providers` fields instead of the active Phase 8A `id` / `title` / `sources` shape.
- [x] Align `movieAggregate.required` with the active runtime: `id`, structured `title`, provider-keyed `sources`.
- [x] Align `tests/fixtures/provider-contract-minimal.json` with the actual Phase 8A aggregate shape.
- [x] Add regression coverage directly checking `phase8a-movie-navigation.js` aggregate construction.
- [x] Automated review found empty structured payloads such as `price: {}` were incorrectly considered usable.
- [x] Make meaningful-value detection recursive for objects/arrays.
- [x] Keep empty supported price/seat payloads `unknown`, not `available`.
- [x] Make empty required containers such as `title: {}` and `cinema: {}` fail validation.
- [x] Bump executable contract version to `m6c-2.1`.
- [x] Reply to and resolve both original PR #76 review threads after the fix landed.
- PR #77 — authoritative review-corrected application commit `6e5728a5061d0d9d6e5f21cd117086e6a4dca572`
- PR #77 branch Run #451 passed regression + Chromium mobile smoke.
- PR #77 Cloudflare preview succeeded on `c896680f32d34216ad1e3d958d6534b089247083`.
- Main Run #452 passed regression + Chromium mobile smoke + Pages deploy.
- Notes: `docs/m6c-normalized-capability-contract.md`

Checkpoint 2 intentionally did **not** load `provider-contract.js` in the production page. Checkpoint 3 completed the controlled adoption after the semantics were frozen against the actual runtime shape.

### Checkpoint 3 — shared presentation/comparison adoption

Status: **complete**

- [x] Audit shared home/comparison modules for capability decisions still expressed through provider-name checks or assumptions that price/seat data always exists.
- [x] Load/use the normalized provider contract only where shared presentation needs capability decisions.
- [x] Keep provider-specific network/request/seat-layout adapters provider-specific; do not erase legitimate upstream differences.
- [x] Remove fixed provider enumeration from shared home/movie aggregate paths where registry enumeration is appropriate.
- [x] Prove a fourth-provider-shaped source can participate in shared home/comparison paths without provider-name branches.
- [x] Prove unsupported price/seat capabilities degrade without breaking or invalidating an otherwise valid showtime.
- [x] Preserve current Broadway/MCL/Emperor UI and data behavior.
- [x] Correct all stale cache-busting test assertions identified by CI/review.
- [x] Ensure synchronous Phase 8A catalogue lookup does not start/return async `getCatalogue()` Promises.
- [x] Reply to and resolve both PR #78 automated review threads.
- PR #78 — authoritative M6C application commit `8fb23347e158d3413852c523dfc8bf90a043a6df`
- PR #78 branch Run #462 passed regression + Chromium mobile smoke.
- PR #78 Cloudflare branch preview succeeded on `f4499c8a080709f373cdbeff255985e1a1be9cdc`.
- Main Run #463 passed regression + Chromium mobile smoke + Pages deploy.
- Notes: `docs/m6c-shared-provider-adoption.md`

### Remaining M6C expansion proof

- [x] Data Health/status can enumerate more than three providers.
- [x] Contract-level unsupported-vs-missing price/seat semantics are covered.
- [x] Provider identity/capability evaluation is registry/descriptor-driven at the contract boundary.
- [x] Home/movie aggregation can enumerate more than three providers.
- [x] Comparison presentation can consume a fourth-provider-shaped source without provider-name UI branches.
- [x] Shared UI cleanly degrades a provider with no price/seat capability.

M6C exit condition: **met**. A hypothetical fourth cinema chain can be described and consumed by the normalized shared contract without adding provider-name branches to home/comparison/health UI.

## M6D — expansion readiness review

Status: **in progress — Checkpoint 1 + Checkpoint 2A + Checkpoint 2B complete**

### Checkpoint 1 — failure isolation + partial / stale / empty-state audit

- [x] Verify one provider failure cannot block usable data from other providers.
- [x] Verify partial provider catalogue failure states.
- [x] Verify partial showtime failure states.
- [x] Verify stale-data indication and last-success timestamps.
- [x] Verify empty-data vs provider-error states are distinguishable.
- [x] Verify seat/price capability failures do not invalidate the showtime card.

Checkpoint result:

- [x] Broadway home catalogue now exposes explicit `loading` / `error` / `empty` / `ready` state instead of using the movie count as a global loading/error gate.
- [x] Usable MCL / Emperor catalogue data can populate the home screen when Broadway fails or returns an empty active tab.
- [x] Emperor active-section `meta.errors` / `fallbackSections` are respected, so a failed active section without cache is unavailable rather than misreported as a successful empty catalogue.
- [x] Aggregate empty-state copy distinguishes a clean empty result from partial provider failure.
- [x] Existing comparison provider/source `Promise.allSettled` behavior preserves successful provider/session data when another provider or source fails.
- [x] Existing stale/last-success age handling and optional price/seat enrichment degradation were audited and protected by regression tests.
- [x] All three PR #79 automated review threads were addressed and resolved.
- PR #79 — authoritative M6D Checkpoint 1 application commit `2aac1f171f20a822307e15889cc3892701e8de8e`
- PR #79 branch Run #469 passed regression + Chromium mobile smoke.
- Main Run #470 passed regression + Chromium mobile smoke + Pages deploy.
- Notes: `docs/checkpoints/m6d-failure-isolation-audit.md`

### Checkpoint 2 — network/concurrency

- [x] Inventory provider request fan-out on initial home load.
- [x] Inventory comparison/showtime request fan-out.
- [x] Review cancellation/ignore-stale-response behavior when changing movie/date/filter quickly.
- [ ] Review MCL lazy price/seat request concurrency before provider count grows.
- [ ] Verify duplicate requests are deduplicated/cached where appropriate without caching live data in the Service Worker shell.

#### Checkpoint 2A — home request fan-out + duplicate-request audit

- [x] Normal current-provider home success path is bounded at five catalogue requests: Broadway 2 + MCL 1 + Emperor 2.
- [x] MCL failure-only retry is distinguished from normal success-path fan-out.
- [x] MCL / Emperor status owners retain `refreshInFlight` re-entry guards.
- [x] Live Worker/MCL/cinema data remains outside the Service Worker static shell cache.
- [x] Phase 8A synchronous aggregate decoration no longer invokes generic async `getCatalogue()` and discards its Promise.
- [x] Generic future providers can expose an already-published synchronous `catalogue` / cached snapshot for movie-fact enrichment without hidden per-card network fan-out.
- [x] Regression coverage locks the current home fan-out boundary and network-silent aggregate behavior.
- PR #80 — authoritative M6D Checkpoint 2A application commit `b06a33ef92d57aac38b0d23215a3c180057e11cf`
- PR #80 branch Run #471 passed regression + Chromium mobile smoke.
- PR #80 Cloudflare branch preview succeeded on `629836cff0bd6c4bc18b09bb9ca0f94454c939bc`.
- PR #80 had no automated review findings or unresolved review threads at merge time.
- Main Run #472 passed regression + Chromium mobile smoke + Pages deploy.
- Notes: `docs/checkpoints/m6d-home-request-fanout.md`

#### Checkpoint 2B — comparison/showtime request fan-out + cancellation audit

- [x] Foreground comparison fan-out is source-shaped and remains provider/source failure-isolated through `Promise.allSettled`.
- [x] Successful initial Broadway / Emperor responses are aliased to their validated resolved-date cache key, avoiding a second native Worker fetch when the preferred date is unchanged.
- [x] MCL comparison main-cache wrapper forwards the caller `AbortSignal` into the hybrid/WebAPI2 transport and rejects already-aborted work before transport starts.
- [x] Complete initial MCL results can alias to their resolved selected-date key; incomplete `metadataComplete: false` results deliberately remain eligible for explicit-date retry.
- [x] Existing foreground movie/date/close request-token and stale-response guards are regression-locked.
- [x] Adjacent-date prefetch now owns an AbortController and can abort already-started Broadway/Emperor and abortable MCL prefetch on lifecycle changes.
- [x] Compact comparison filters remain presentation-only and do not start provider requests.
- [x] Both PR #81 automated review findings were addressed, replied to and both review threads were resolved.
- [ ] MCL outer bulk-enrichment sidecar still lacks parent-signal cancellation and remains part of Checkpoint 2C.
- PR #81 — authoritative M6D Checkpoint 2B application commit `c189cbb52c48321b96a90f3c9ecb639bc2a85cbc`
- PR #81 final branch Run #477 passed regression + Chromium mobile smoke.
- PR #81 Cloudflare branch preview succeeded on final head `e329fa34ee38652f059164a90d5c831976096d1c`.
- Main Run #478 passed regression + Chromium mobile smoke + Pages deploy.
- Notes: `docs/checkpoints/m6d-comparison-request-fanout.md`

Next M6D batch: **Checkpoint 2C — MCL lazy metadata/price/bulk request concurrency + remaining duplicate-request behavior**. Keep seat-map redesign and any real new provider outside this bounded work unless a direct dependency is proven.

### Expansion gate

- [ ] Run production regression suite and mobile smoke after M6C/D changes.
- [ ] Perform real-device check on Metro home, comparison, filters and seat-map.
- [ ] Confirm Classic fallback still works.
- [ ] Write final M6 handoff with current `main`, known limitations and provider-integration contract.
- [ ] Close issue #66 only after all M6C/M6D exit criteria are met.

## Recovery procedure after chat/session interruption

1. Open `docs/m6-checklist.md` first.
2. Read issue #66 for the current M6 objective and latest merged-main/CI checkpoint.
3. Verify current `main`. If it is newer than the application checkpoint above, inspect the newer commit/PR before starting work; a docs-only tracker commit does not replace the recorded application checkpoint.
4. If an M6 PR is open, inspect that PR and checks before creating another branch.
5. Resume only the first unchecked item under the current checkpoint; do not restart completed M6A/M6B/M6C work.
6. Use feature/hotfix branch → PR → regression + mobile smoke → squash merge → verify main Pages deploy → update this checklist and issue #66.
7. If Worker source changes, also verify the Cloudflare Workers build/check on merged `main`.

## Update rule

For every M6 application/runtime checkpoint:

- record completed work, PR number, authoritative merged application SHA and next action here;
- record main CI/deploy result in issue #66;
- distinguish application checkpoints from docs-only tracker maintenance commits.

The repository checklist plus issue #66 are the durable recovery record; chat history is not required to resume safely.