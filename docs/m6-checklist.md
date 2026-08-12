# Phase M6 — durable progress checklist

This file is the recovery/checkpoint source of truth for Phase M6. Update it after every merged M6 pull request so work can resume from the repository even if a chat/session is lost.

## Current checkpoint

- Repository: `MaxYu725/hk-cinema`
- Production UI: Metro default
- Classic fallback: `?skin=classic`
- M6 tracking issue: #66
- Latest completed M6 checkpoint: **M6B Checkpoint 4**
- Latest production `main`: `8bc54af1d631129d2937a22c4b7915f22e0b751a`
- Latest merged PR: **#71 — Phase M6B: fold Metro seat-map patch layer**
- Main Actions Run #439: regression tests, mobile browser smoke and GitHub Pages deploy passed
- Next planned work: **M6B Checkpoint 5 — continue narrow presentation-layer consolidation; review the Metro M2 homepage polish layer as the next candidate, preserving the accepted UI exactly**

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

Status: **in progress**

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

### Checkpoint 5 — next narrow consolidation

Status: **next**

- [ ] Audit `metro-m2-home-polish.css` against `metro-theme.css`.
- [ ] Confirm M2 contains presentation overrides owned entirely by the Metro homepage layer and has no independent runtime/data contract.
- [ ] If safe, fold the M2 rules into the owning Metro theme/home layer without changing selectors/values.
- [ ] Retire the redundant M2 `<link>` only after regression coverage locks the accepted homepage dimensions.
- [ ] Run full regression tests + Chromium mobile smoke + Pages deploy.
- [ ] Update this checklist with the merged PR number and new `main` commit.

### Remaining M6B completion criteria

- [ ] Review remaining late Metro CSS files for proven ownership overlap only; do not bulk-merge merely to reduce file count.
- [ ] Review any remaining Classic/Phase 10 runtime cross-skin dependency.
- [ ] Confirm no Metro runtime contains compensating behavior for a Classic-only presentation state.
- [ ] Confirm no shared renderer depends on presentation text/DOM formatting as a data contract.
- [ ] Stop consolidation when remaining layers have distinct responsibilities; M6B does not require a single monolithic stylesheet/runtime.
- [ ] Record final M6B architecture map before entering M6C.

## M6C — provider onboarding contract

Status: **not started**

### Provider identity / registry

- [ ] Define one provider descriptor contract for ID, display name, health label and capabilities.
- [ ] Remove fixed three-provider assumptions from Data Health presentation.
- [ ] Replace fixed `Broadway / MCL / Emperor` status copy where provider count should be dynamic.
- [ ] Replace accessibility copy such as `重新整理三院線資料` with provider-count-neutral wording.
- [ ] Make home loading/status copy provider-count-neutral.

### Normalized capability contract

- [ ] Document fields required for home catalogue entries.
- [ ] Document fields required for movie aggregation/matching.
- [ ] Document fields required for showtime comparison.
- [ ] Document optional/required price capability.
- [ ] Document optional/required seat-summary capability.
- [ ] Document optional full seat-map capability.
- [ ] Document booking-link capability/fallback semantics.
- [ ] Define how unsupported capabilities are represented without UI branching by provider name.

### Tests / fixtures

- [ ] Add provider-contract fixture for a minimal fourth-provider-shaped record without integrating a real chain.
- [ ] Add tests proving home/comparison/status UI can enumerate more than three providers.
- [ ] Add tests proving a provider without seats/prices degrades cleanly.
- [ ] Add tests proving provider identity is registry-driven rather than hard-coded in presentation modules.

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
2. Read issue #66 for the current M6 objective and checkpoint comments.
3. Verify the current `main` head; if it is newer than the commit recorded above, inspect merged PRs after the recorded checkpoint and update this file before doing new work.
4. Resume only the first unchecked item under the current checkpoint; do not restart completed M6A/M6B work.
5. Use a feature/refactor branch, open a PR, wait for regression + mobile smoke, squash merge, verify main Pages deployment, then update this checklist.
6. If a Worker file changed, also verify the Cloudflare Workers build/check on the merged main commit.

## Update rule

After every M6 merge, this document must be updated with:

- latest completed checkpoint
- PR number/title
- production `main` commit
- CI/deploy status
- first unchecked next action

The checklist is deliberately stored in the repository rather than relying on chat history.