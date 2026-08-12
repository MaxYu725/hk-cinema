# Phase M6 — durable progress checklist

This file is the recovery/checkpoint source of truth for Phase M6. Update it as M6 advances so work can resume from the repository even if a chat/session is lost.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Production UI: Metro default
- Classic fallback: `?skin=classic`
- M6 tracking issue: #66
- Durable tracker introduced by: **PR #72 — Phase M6: add durable progress checklist**
- Latest completed application checkpoint: **M6C Checkpoint 1 / PR #75 — add provider registry contract**
- Latest application checkpoint commit: `ed1c1f8957b241759e33c964ee17b28e381fcc0b`
- PR #75 branch Run #447: regression tests and Chromium mobile smoke passed
- PR #75 Cloudflare branch preview: successful
- Main Actions Run #448: regression tests, Chromium mobile smoke and GitHub Pages deploy passed
- M6A: **complete**
- M6B: **complete**
- M6C: **in progress**
- Current M6 stage: **M6C — provider onboarding contract**
- Next planned work: **M6C Checkpoint 2 — document and lock the normalized shared data/capability contract for catalogue, movie aggregation, showtimes, prices, seat summary/map and booking; then define truthful unsupported-capability semantics without provider-name branches**

## Fixed M6 boundaries

- [x] Metro remains the production default.
- [x] Classic remains available throughout M6 as rollback/reference.
- [x] No speculative visual redesign during hardening.
- [x] No broad provider/parser rewrite.
- [x] No new cinema chain until M6C provider contracts and M6D failure-isolation review are stable.
- [x] Provider/showtime/price/seat semantics stay unchanged during presentation-only consolidation.
- [x] Service Worker activation stays controlled; no automatic `skipWaiting()` restoration.
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

- [x] Move homepage tab counts from Classic-only runtime to neutral `shared-final-controls.js`.
- [x] Move comparison heading sort control to neutral shared ownership.
- [x] Make Metro the sole home Data Health DOM-placement owner.
- [x] Keep Classic Data Health refresh behavior Classic-only.
- [x] Preserve existing DOM hooks so both skins render unchanged.

Checkpoint:

- PR #68 — `Phase M6B: consolidate shared UI ownership`
- merge commit: `fc66de22009c7e654f5d0644932e78939d2d75f0`
- notes: `docs/m6b-shared-ui-ownership.md`

### Checkpoint 2 — structured movie facts

- [x] Add structured aggregate facts: classification, duration and release date.
- [x] Make Phase 8B use aggregate facts instead of parsing rendered homepage `.movie-meta` text.
- [x] Remove the Metro hidden ` · ` metadata separator bridge.
- [x] Add no new provider request; missing metadata remains missing rather than guessed.

Checkpoint:

- PR #69 — `Phase M6B: consolidate movie facts into aggregates`
- merge commit: `32cb3bc1615fba811ef36f48402b602539829bc5`
- notes: `docs/m6b-aggregate-movie-facts.md`

### Checkpoint 3 — skin runtime ownership

- [x] Keep neutral transient home sticky marker shared.
- [x] Make the buffered sticky latch and collapse presentation Classic-only.
- [x] Remove Metro JavaScript that counteracted Classic sticky state.
- [x] Keep compact filter structure skin-neutral.
- [x] Move Metro-only filter dropdown auto-close/outside-tap policy into `metro-runtime.js`.

Checkpoint:

- PR #70 — `Phase M6B: consolidate skin runtime ownership`
- merge commit: `7f03ad1a064a6d3641093a7669ef20dec29bbf28`
- notes: `docs/m6b-skin-runtime-ownership.md`

### Checkpoint 4 — Metro seat-map CSS layer fold

- [x] Fold the Broadway-only M4B row-label scroll guard into `metro-m4-seat-view.css`.
- [x] Remove the redundant `metro-m4b-seat-scroll-fix.css` production layer.
- [x] Preserve the Broadway selector and exact accepted styling values.
- [x] Keep MCL/Emperor and Classic unaffected.

Checkpoint:

- PR #71 — `Phase M6B: fold Metro seat-map patch layer`
- merge commit: `8bc54af1d631129d2937a22c4b7915f22e0b751a`
- notes: `docs/m6b-seat-style-layer-fold.md`

### Checkpoint 5 — Metro homepage CSS layer fold

Status: **complete**

- [x] Audit `metro-m2-home-polish.css` against `metro-theme.css`.
- [x] Confirm M2 contains presentation overrides owned entirely by the Metro homepage layer and has no independent runtime/data contract.
- [x] Fold the complete M2 rule block into the end of `metro-theme.css` without changing selectors or values.
- [x] Retire the redundant `metro-m2-home-polish.css` production stylesheet and `<link>`.
- [x] Version the consolidated Metro theme as `metro-theme.css?v=m6b-5`.
- [x] Add regression coverage for the accepted homepage dimensions and M3 load order.
- [x] PR #73 regression tests passed.
- [x] PR #73 Chromium mobile smoke passed.
- [x] PR #73 squash merged; main Pages deployment passed in Run #442.
- [x] Authoritative application checkpoint: `4736d445e1ea7f7f236ab11ddb9c69c2f2b19366`.

### M6B completion audit

Status: **complete**

- [x] Review remaining late Metro CSS files for proven ownership overlap only; no additional redundant patch layer remains.
- [x] Review Classic/Phase 10 runtime cross-skin dependencies; Metro Data Health ownership is guarded and shared date-centering remains intentionally shared.
- [x] Confirm Metro runtime contains no compensating behavior for Classic sticky state.
- [x] Confirm shared comparison facts no longer depend on presentation text/DOM formatting as a data contract.
- [x] Stop consolidation because the remaining Metro layers have distinct feature responsibilities rather than duplicate ownership.
- [x] Record final architecture map in `docs/m6b-architecture-map.md`.
- [x] Add M6B completion regression contracts.
- [x] PR #74 branch regression/mobile smoke passed and Cloudflare preview succeeded.
- [x] PR #74 squash merged; main regression/mobile smoke/Pages deploy passed in Run #444.
- [x] Authoritative M6B completion commit: `554cab11c0f307b116abd7f2c135fdc26248b34f`.

M6B exit decision: do not fold additional presentation files unless a future regression proves a duplicate owner. Proceed to M6C.

## M6C — provider onboarding contract

Status: **in progress**

### Checkpoint 1 — provider identity / registry

Status: **complete**

- [x] Define one provider descriptor contract for ID, display name, health label and capabilities.
- [x] Add `app/provider-registry.js` as the provider identity/capability metadata owner without moving provider fetch/parser logic.
- [x] Remove fixed three-provider assumptions from Data Health presentation.
- [x] Replace fixed `Broadway / MCL / Emperor` status copy where provider count should be dynamic.
- [x] Replace accessibility copy such as `重新整理三院線資料` with provider-count-neutral wording.
- [x] Make home loading/status copy provider-count-neutral.
- [x] Add a minimal fourth-provider-shaped contract fixture without integrating a real chain.
- [x] Prove Data Health can enumerate four registry providers and derive 4/4 totals dynamically.
- [x] Keep the existing Broadway/MCL/Emperor provider IDs and health-report calls unchanged.
- [x] PR #75 regression tests and Chromium mobile smoke passed in Run #447 after updating legacy test harness/copy assertions to the new registry contract.
- [x] PR #75 Cloudflare branch preview succeeded on the final PR head.
- [x] PR #75 squash merged; main regression/mobile smoke/Pages deploy passed in Run #448.
- [x] Authoritative M6C Checkpoint 1 application commit: `ed1c1f8957b241759e33c964ee17b28e381fcc0b`.
- [x] Contract notes: `docs/m6c-provider-registry-contract.md`.

### Checkpoint 2 — normalized capability/data contract

Status: **next**

- [ ] Document fields required for home catalogue entries.
- [ ] Document fields required for movie aggregation/matching.
- [ ] Document fields required for showtime comparison.
- [ ] Document optional/required price capability.
- [ ] Document optional/required seat-summary capability.
- [ ] Document optional full seat-map capability.
- [ ] Document booking-link capability/fallback semantics.
- [ ] Define how unsupported capabilities are represented without UI branching by provider name.
- [ ] Add normalized contract fixtures/tests before changing any real provider.

### Remaining M6C tests / expansion proof

- [x] Add provider-contract fixture for a minimal fourth-provider-shaped record without integrating a real chain.
- [ ] Add tests proving home/comparison/status UI can enumerate more than three providers. Data Health/status enumeration is covered by Checkpoint 1; home/comparison enumeration remains pending.
- [ ] Add tests proving a provider without seats/prices degrades cleanly. The Checkpoint 1 fixture defines missing capabilities, but UI degradation semantics are not yet implemented.
- [ ] Add tests proving provider identity is registry-driven rather than hard-coded across the relevant presentation modules. Data Health is registry-driven; remaining home/comparison assumptions are still to be audited.

M6C exit condition: a hypothetical fourth cinema chain can be described by the normalized contract without adding provider-name branches to home/comparison/health UI.

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

1. Open this file first: `docs/m6-checklist.md`.
2. Read issue #66 for the current M6 objective and the latest merged-main/CI checkpoint.
3. Verify current `main`. If it is newer than the application checkpoint recorded here, inspect the newer commit/PR before doing new work; a docs-only tracker commit does not invalidate the recorded application checkpoint.
4. If an M6 PR is open, inspect that PR and its checks before starting another branch.
5. Resume only the first unchecked item under the current checkpoint; do not restart completed M6A/M6B/M6C checkpoint work.
6. Use a feature/refactor branch, open a PR, wait for regression + mobile smoke, squash merge, verify main Pages deployment, then advance this checklist/issue record.
7. If a Worker file changed, also verify the Cloudflare Workers build/check on the merged main commit.

## Update rule

For every M6 application/runtime checkpoint:

- advance this file with completed work, PR number, verified application commit and next action;
- record the authoritative merged `main` SHA and main CI/deploy result in issue #66;
- distinguish application checkpoint commits from docs-only tracker maintenance commits.

The repository checklist plus issue #66 together are the durable recovery record, rather than chat history.