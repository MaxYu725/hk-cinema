# Phase M6 — durable progress checklist

This file is the durable completion/recovery source of truth for Phase M6. Detailed implementation history remains in the linked checkpoint documents and merged PRs.

## Final status

- Repository: `MaxYu725/hk-cinema`
- Production site: `https://maxyu725.github.io/hk-cinema/`
- Worker API: `https://hk-cinema-api.max-yu-jp.workers.dev`
- Production UI: **Metro**
- Classic fallback: `?skin=classic`
- Tracking issue: #66
- M6A: **complete**
- M6B: **complete**
- M6C: **complete**
- M6D: **complete**
- Expansion Gate: **complete**
- Phase M6: **COMPLETE**
- Authoritative application/runtime SHA: `26b8384466eb107322e1b714aedb093c94973c9f`
- Final application checkpoint: **PR #84 — M6 Expansion Gate automation/hardening**
- Final handoff: `docs/m6-handoff.md`

The final handoff/tracker commits after PR #84 are documentation-only and do not replace the authoritative application SHA.

## Final validation record

### Automated

- [x] PR #84 final branch Run #499 passed regression tests + Chromium mobile smoke.
- [x] PR #84 Cloudflare preview succeeded on final head `c25e3e9efe65d6b3b170d4c70f74e106e3ca3966`.
- [x] Main Run #500 passed regression tests + Chromium mobile smoke + GitHub Pages deploy.
- [x] Metro default is explicitly asserted.
- [x] Classic `?skin=classic` identity is explicitly asserted.
- [x] Mobile home, comparison and filter interaction are covered.
- [x] Deterministic shared Metro seat-map lifecycle is covered.
- [x] Gate-found Metro seat-map close target was hardened from 38×38 to 44×44 CSS px.
- [x] PR #84 automated review P1 was addressed, replied to and resolved.

### Physical device

Physical-device sign-off was explicitly accepted on 2026-08-12.

- [x] Metro home normal.
- [x] Metro comparison normal.
- [x] Metro filters normal.
- [x] Metro seat-map normal.
- [x] Classic fallback normal.

## Fixed M6 boundaries — final result

- [x] Metro remains the production default.
- [x] Classic remains available as explicit rollback/reference fallback.
- [x] No speculative visual redesign was introduced during hardening.
- [x] No broad provider/parser rewrite was performed.
- [x] No real fourth provider was integrated during M6.
- [x] Service Worker activation remains controlled; automatic install-time `skipWaiting()` was not restored.
- [x] Live cinema/API/Worker/MCL traffic remains outside the static PWA shell cache.
- [x] Multi-file work used branch → PR → CI → squash merge.

## M6A — production baseline audit

Status: **complete**

Outcome:

- accepted Metro production baseline frozen;
- Classic fallback preserved;
- presentation/PWA ownership boundaries audited;
- provider-expansion blockers recorded.

Checkpoint:

- PR #67 — merge `38796462b75e0e9470dd5bea1a7e42ffabc523b6`
- `docs/m6a-production-baseline-audit.md`

## M6B — presentation/runtime consolidation

Status: **complete**

Key outcomes:

- shared tab/sort ownership removed from Classic-only runtime;
- Metro Data Health placement has one owner;
- comparison consumes structured movie facts rather than rendered homepage metadata;
- Classic sticky behavior and Metro filter interaction have explicit skin ownership;
- redundant Metro M2/M4B patch layers retired;
- remaining Metro presentation files have distinct ownership.

Checkpoints:

- PR #68 — `fc66de22009c7e654f5d0644932e78939d2d75f0`
- PR #69 — `32cb3bc1615fba811ef36f48402b602539829bc5`
- PR #70 — `7f03ad1a064a6d3641093a7669ef20dec29bbf28`
- PR #71 — `8bc54af1d631129d2937a22c4b7915f22e0b751a`
- PR #73 — `4736d445e1ea7f7f236ab11ddb9c69c2f2b19366`
- PR #74 — authoritative M6B commit `554cab11c0f307b116abd7f2c135fdc26248b34f`
- `docs/m6b-architecture-map.md`

## M6C — provider onboarding contract

Status: **complete**

### Registry / identity

- [x] `app/provider-registry.js` owns provider identity and capability metadata.
- [x] Data Health enumerates registry providers rather than a fixed three-provider array.
- [x] Shared status copy is provider-neutral.

PR #75 — `ed1c1f8957b241759e33c964ee17b28e381fcc0b`

### Normalized data/capability contract

- [x] `app/provider-contract.js` defines catalogue, aggregate, showtime, price, seat-summary, seat-map and booking surfaces.
- [x] `available`, `unknown` and `unsupported` remain distinct.
- [x] Unsupported price is not HK$0.
- [x] Unsupported/missing seat data is not sold out.
- [x] Empty structured payloads do not become falsely available.
- [x] Active movie aggregate shape is `id` + structured `title` + provider-keyed `sources`.

PR #76 initial contract; PR #77 authoritative review-corrected commit `6e5728a5061d0d9d6e5f21cd117086e6a4dca572`.

### Shared adoption

- [x] Shared home/comparison consume registry/capability metadata where appropriate.
- [x] Provider-specific networking/parsing/seat geometry remains provider-specific.
- [x] A fourth-provider-shaped fixture can participate without provider-name UI branches.
- [x] A provider without price/seat support degrades cleanly.
- [x] Synchronous Phase 8A decoration does not invoke async generic `getCatalogue()`.

PR #78 — authoritative M6C application commit `8fb23347e158d3413852c523dfc8bf90a043a6df`.

References:

- `docs/m6c-provider-registry-contract.md`
- `docs/m6c-normalized-capability-contract.md`
- `docs/m6c-shared-provider-adoption.md`

## M6D — expansion readiness review

Status: **complete**

### Failure isolation

- [x] One provider failure cannot block usable data from others.
- [x] Partial catalogue/showtime failure remains distinguishable from clean empty data.
- [x] Stale/last-success state remains visible.
- [x] Price/seat enrichment failures do not invalidate showtimes.

PR #79 — `2aac1f171f20a822307e15889cc3892701e8de8e`

### Home request fan-out

- [x] Normal current-provider success path is bounded at five catalogue requests: Broadway 2 + MCL 1 + Emperor 2.
- [x] MCL failure-only retry is distinguished from normal success fan-out.
- [x] Generic synchronous catalogue decoration remains network-silent.

PR #80 — `b06a33ef92d57aac38b0d23215a3c180057e11cf`

### Comparison request lifecycle

- [x] Provider/source fetches remain failure-isolated with `Promise.allSettled`.
- [x] Foreground movie/date/close work has request-token, AbortController and stale-response guards.
- [x] Broadway/Emperor successful initial results alias to validated resolved-date cache keys.
- [x] MCL complete initial results can alias to resolved date; incomplete metadata deliberately remains retryable.
- [x] Adjacent-date prefetch is lifecycle-abortable.
- [x] Filters remain presentation-only/network-silent.

PR #81 — `c189cbb52c48321b96a90f3c9ecb639bc2a85cbc`

### MCL concurrency

- [x] `GetSessionInfo` max concurrency: 8.
- [x] Comparison MovieSet bulk: one sidecar per uncached cycle with real abort/timeout plumbing.
- [x] Old eager per-session comparison `GetPrice` fan-out retired.
- [x] Lazy price max concurrency: 4 with per-session dedupe/cache/cancellation.
- [x] Lazy seat-summary max concurrency: 2 with per-session dedupe/cache/cancellation.
- [x] MCL ownership: `WebAPI2 → hybrid → comparison bulk → main cache`.
- [x] Detail/no-signal consumers retain original WebAPI2 price fallback.

PR #82 — `61ebe11222cc0bad03c0433625bb0f6e44cf4002`

### Final duplicate-request/cache audit

- [x] Home-card capture ownership prevents detail + comparison double activation.
- [x] Refresh owners retain re-entry protection.
- [x] Sequential Broadway/Emperor showtime duplicates are covered by 60-second cache.
- [x] MCL comparison uses 90-second main cache.
- [x] HTTP 200 application errors/invalid Worker snapshots are evicted and retryable.
- [x] No generic global in-flight coalescer was added without a concrete same-key concurrent-demand path.
- [x] Live traffic remains outside Service Worker cache.

PR #83 — `e15d5cc27df0ea5e3babdca1612aa3f5162be525`

References:

- `docs/checkpoints/m6d-failure-isolation-audit.md`
- `docs/checkpoints/m6d-home-request-fanout.md`
- `docs/checkpoints/m6d-comparison-request-fanout.md`
- `docs/checkpoints/m6d-mcl-request-concurrency.md`
- `docs/checkpoints/m6d-final-network-audit.md`

## M6 Expansion Gate

Status: **complete**

- [x] Production regression suite and mobile smoke green after M6C/D.
- [x] Metro default and Classic explicit fallback covered in mobile release gate.
- [x] Home/comparison/filter mobile behavior covered.
- [x] Shared Metro seat-map deterministic mobile smoke added.
- [x] Seat-map close target hardened to 44×44 CSS px.
- [x] Main Run #500 passed regression + Chromium mobile smoke + Pages deploy.
- [x] Physical-device Metro home/comparison/filters/seat-map accepted.
- [x] Physical-device Classic fallback accepted.
- [x] Final M6 handoff written: `docs/m6-handoff.md`.

PR #84 — authoritative application/runtime commit `26b8384466eb107322e1b714aedb093c94973c9f`.

Reference: `docs/checkpoints/m6-expansion-gate-automation.md`

## Provider-expansion handoff

M6 exit condition is met. A future real provider may now be integrated, subject to the rules in `docs/m6-handoff.md`:

- register identity/capabilities first;
- keep provider-specific network/parser/seat-layout code adapter-specific;
- normalize shared data through the contract;
- provide a published synchronous catalogue snapshot for synchronous shared home decoration;
- treat price/seat as optional capabilities;
- avoid provider-name branches in shared presentation;
- preserve bounded concurrency, cancellation and failure isolation;
- keep live data outside the Service Worker shell;
- run regression/mobile smoke and focused real-device validation before enabling production traffic.

## Known limitations carried forward

- Provider upstream schemas/failure modes remain heterogeneous.
- Live price/seat availability depends on provider support and may be `unknown`/`unsupported`.
- MCL browser/direct paths are sensitive to network routing/environment; VPN routing can produce failures that are not parser defects.
- Deterministic CI seat-map smoke does not require a live current session; live provider payloads remain separately covered.
- No real fourth provider is part of M6.

## Phase closure

- [x] M6A complete.
- [x] M6B complete.
- [x] M6C complete.
- [x] M6D complete.
- [x] Expansion Gate automated checks complete.
- [x] Expansion Gate physical-device checks complete.
- [x] Final handoff complete.
- [x] Issue #66 may be closed after this documentation-only finalization PR is merged and its main CI result is recorded.

Phase M6 is complete. Resume future provider work from `docs/m6-handoff.md`; do not restart completed M6 hardening work.