# Phase 5E Stable Checkpoint

Date: 2026-08-08

Recovery branch: `checkpoint/phase-5e-stable`

Pinned commit: `56032732c2bf4bbb5535fb87917138341b846672`

This checkpoint captures the completed Phase 5E comparison usability and stability work after the Phase 5D stable baseline.

## Included

- Phase 5E-1 local comparison filter persistence and reset.
- Phase 5E-2 request lifecycle hardening:
  - cancellable/deduplicated MCL SeatPlan requests;
  - stale-response protection and request timeouts;
  - short-lived Broadway/MCL main-data memory cache;
  - adjacent-date idle prefetch without SeatPlan prefetch.
- VPN/Proxy handling simplified to fast failure rather than complex long fallback chains.
- Phase 5E-3 provider-level resilience states and provider-scoped retry/cache clearing.
- Phase 5E-4 mobile UI polish:
  - compact healthy data status;
  - mobile date carousel/touch improvements;
  - safe-area handling;
  - loading skeleton and clearer empty states.
- Phase 5E-5 accessibility and final polish:
  - focus entry/trap/restore for the comparison dialog;
  - background `inert`/`aria-hidden` while the dialog is open;
  - scroll-position restoration after closing;
  - `aria-busy`, live status/error semantics and pressed states;
  - focus-visible styles;
  - removal of obsolete Phase 5C placeholder copy at render time.

## Preserved stable systems

- Broadway and MCL catalogue/detail/session flows.
- Cross-provider movie matching, shared timeline, filters and Smart Picks.
- MCL seat-plan lazy loading and full seat-map rendering.
- Phase 5D stable checkpoint remains unchanged at `checkpoint/phase-5d-stable`.

## Deployment

GitHub Pages workflow for pinned commit `56032732c2bf4bbb5535fb87917138341b846672` completed successfully before this recovery branch was created.
