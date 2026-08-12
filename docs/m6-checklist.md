# Phase M6 — durable progress checklist

This file is the recovery/checkpoint source of truth for Phase M6. If a chat/session is lost, read this file first, then issue #66, then verify current `main` before making new changes.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Production UI: Metro default
- Classic fallback: `?skin=classic`
- M6 tracking issue: #66
- M6A: **complete**
- M6B: **complete**
- M6C: **in progress**
- Current stage: **M6C — provider onboarding contract**
- Latest completed application checkpoint: **M6C Checkpoint 2 review-corrected / PR #77**
- Authoritative application checkpoint: `6e5728a5061d0d9d6e5f21cd117086e6a4dca572`
- PR #77 branch Run #451: regression tests + Chromium mobile smoke passed
- PR #77 Cloudflare branch preview: successful on final head `c896680f32d34216ad1e3d958d6534b089247083`
- Main Actions Run #452: regression tests + Chromium mobile smoke + GitHub Pages deploy passed
- PR #76 automated review findings were addressed in PR #77 and both original review threads are resolved
- Next planned work: **M6C Checkpoint 3 — adopt the registry/capability contract in remaining shared home/comparison presentation paths, remove provider-name capability assumptions, and prove a fourth-provider-shaped source degrades cleanly without price/seat branches**

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

Status: **in progress**

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

Checkpoint 2 intentionally does **not** load `provider-contract.js` in the production page yet. Its semantics are now frozen against the actual runtime shape; Checkpoint 3 will adopt them in shared presentation/comparison paths in a controlled batch.

### Checkpoint 3 — shared presentation/comparison adoption

Status: **next**

- [ ] Audit shared home/comparison modules for capability decisions still expressed through provider-name checks or assumptions that price/seat data always exists.
- [ ] Load/use the normalized provider contract only where shared presentation needs capability decisions.
- [ ] Keep provider-specific network/request/seat-layout adapters provider-specific; do not erase legitimate upstream differences.
- [ ] Remove fixed provider enumeration from shared home/movie aggregate paths where registry enumeration is appropriate.
- [ ] Prove a fourth-provider-shaped source can participate in shared home/comparison paths without provider-name branches.
- [ ] Prove unsupported price/seat capabilities degrade without breaking or invalidating an otherwise valid showtime.
- [ ] Preserve current Broadway/MCL/Emperor UI and data behavior.

### Remaining M6C expansion proof

- [x] Data Health/status can enumerate more than three providers.
- [x] Contract-level unsupported-vs-missing price/seat semantics are covered.
- [x] Provider identity/capability evaluation is registry/descriptor-driven at the contract boundary.
- [ ] Home/movie aggregation can enumerate more than three providers.
- [ ] Comparison presentation can consume a fourth-provider-shaped source without provider-name UI branches.
- [ ] Shared UI cleanly degrades a provider with no price/seat capability.

M6C exit condition: a hypothetical fourth cinema chain can be described and consumed by the normalized shared contract without adding provider-name branches to home/comparison/health UI.

## M6D — expansion readiness review

Status: **not started**

### Failure isolation

- [ ] Verify one provider failure cannot block usable data from other providers.
- [ ] Verify partial provider catalogue failure states.
- [ ] Verify partial showtime failure states.
- [ ] Verify stale-data indication and last-success timestamps.
- [ ] Verify empty-data vs provider-error states are distinguishable.
- [ ] Verify seat/price capability failures do not invalidate the showtime card.

### Network/concurrency

- [ ] Inventory provider request fan-out on initial home load.
- [ ] Inventory comparison/showtime request fan-out.
- [ ] Review cancellation/ignore-stale-response behavior when changing movie/date/filter quickly.
- [ ] Review MCL lazy price/seat request concurrency before provider count grows.
- [ ] Verify duplicate requests are deduplicated/cached where appropriate without caching live data in the Service Worker shell.

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
