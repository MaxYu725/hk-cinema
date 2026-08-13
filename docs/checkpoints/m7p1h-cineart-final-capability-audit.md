# M7P1H checkpoint — CineArt final capability audit

Status: **started — branch-preview evidence audit pending**

Baseline: `f0cd43f6e7a96b3a0c195d983ccf55ecf4a0f702` (accepted M7P1G + screen-orientation hotfix)

M7P1G Android installed-PWA acceptance: **PASS**.

The deployed M7P1G seat-map capability and the follow-up CineArt screen-orientation hotfix passed real-device acceptance. The user also identified broader seat-map presentation improvements, but explicitly deferred that UI work until CineArt provider completion. That future work must remain a separate display-only phase and must not be mixed into this capability audit.

## Objective

Close the remaining CineArt capability uncertainty without guessing.

Current production Registry state:

- catalogue: true
- showtimes: true
- prices: true
- seatSummary: true
- seatMap: true
- booking: false

M7P1H audits the **current** CineArt Next.js source for two previously unproven areas:

1. whether a stable official booking/deep-link contract can be proven for an authoritative show id;
2. whether format metadata has a stable structured source rather than title-string inference.

## Safety boundary

No production capability changes are allowed until branch-preview evidence proves the contract.

Historical or indexed legacy routes such as `/en/seat/index/<id>` are research evidence only and must not be promoted into current production unless the current `/hk` Next.js application itself proves that route/identifier mapping.

If current evidence is absent or ambiguous:

- `booking` remains false;
- no booking URL is synthesized;
- no title-derived format guessing is added;
- CineArt is considered production-complete with unsupported/unproven capabilities explicitly disabled.

## Explicit non-goals

- no seat-map presentation redesign in this phase;
- no seat selection, hold, reservation or purchase calls;
- no POST to CineArt;
- no browser request to `cinearthouse.com.hk`;
- no MutationObserver/IntersectionObserver lifecycle;
- no PWA/Service Worker changes;
- global Worker `/health` remains `phase:"6G"`.

## Next action

Add a branch-preview-only evidence probe against the current CineArt `/hk` and one bounded current `/hk/show/<showId>` document. The probe may report field names/route-shaped strings and format evidence, but must not expose credentials, personal data, raw seat maps or ticket purchase payloads.
