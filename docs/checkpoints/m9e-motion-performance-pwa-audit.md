# M9E — Motion Performance / PWA Audit

Baseline: `main@f72a5a89ed9ac7e7556fcdccd2ca4a661e8596f4` (M9D)

## Goal

Close the M9 native-feeling motion phase by auditing the production Metro/PWA path for rapid interaction, slow loading, reduced motion and low-end Android overhead. Stability remains more important than adding more animation.

## Findings

### 1. Stale exit after-image could briefly cover a rapid reopen

M9C deliberately keeps comparison/seat-map close synchronous and renders a passive `pointer-events:none` exit surface for roughly one fast motion duration. That surface has a high visual stacking level.

If a user closes and immediately reopens another comparison/seat map, the old passive surface could remain above the new destination for a fraction of a second. It never blocked input, but it could create a visible black flash.

M9E hardening:

- a new comparison or seat-map open clears all stale M9C exit surfaces immediately;
- a hidden -> visible overlay transition also clears stale exit surfaces;
- only one full-screen exit ghost of each kind is kept;
- filter/Smart Picks entry clears stale local panel ghosts;
- original comparison/seat-map close/abort ownership is unchanged.

### 2. M9B body-wide class observation did unnecessary work

M9B previously observed `class`, `hidden` and `data-broadway-state` attributes across the entire body. M9D intentionally adds/removes short acknowledgement classes on taps, which meant ordinary micro-interactions could schedule a full M9B loading-state scan.

M9E hardening:

- `#movieGrid` alone is observed for `data-broadway-state`;
- `#refreshButton` alone is observed for `class`;
- comparison and seat-map overlays alone are observed for `hidden`;
- the body observer is now child-list only and schedules work only when a loading owner subtree is involved;
- provider/date/seat-map renders still trigger the same M9B presentation lifecycle.

### 3. M9C body observer was broader than required

M9C previously scheduled date/overlay scans for all body child mutations.

M9E hardening:

- overlay `hidden` state is watched directly on the two overlay owners;
- body child-list work is filtered to comparison/seat-map motion owner subtrees;
- unrelated homepage DOM work no longer schedules transition scans.

## PWA cache delivery

Because M9B and M9C runtime files changed, their script cachebusters in `app/index.html` are advanced to M9E variants. The existing service worker continues to discover shell assets from the network-first index; no service-worker cache-name change or ownership change is required.

## Regression gates

New static audit: `tests/m9e-motion-performance.test.mjs`

It checks:

- M9 presentation runtimes remain network/lifecycle passive;
- M9B/M9C observers are scoped to their real owners;
- stale exit surfaces are cleared on reopen;
- all M9 CSS retains reduced-motion handling;
- individual seats are never animated;
- M9 keyframes avoid layout/paint-heavy properties.

New mobile browser audit: `tests/e2e/m9e-motion-performance.spec.mjs`

It checks:

- repeated comparison close/reopen keeps exactly one real overlay;
- close state changes synchronously before visual exit finishes;
- stale exit ghosts disappear before a reopened destination is shown;
- a deliberately slow seat-map request keeps header/loading state visible;
- closing during the slow request remains synchronous and the late result cannot reopen the sheet;
- reduced-motion mode creates no exit after-image and keeps the comparison sheet animation disabled.

Existing release/PWA smoke remains responsible for:

- mobile Metro movie-first flow;
- filter layout stability;
- deterministic seat-map lifecycle;
- service-worker registration and same-origin shell cache;
- offline PWA reopen and online/offline state transitions.

## Acceptance

M9E is complete when:

1. full Node regression passes;
2. full Chromium mobile E2E suite, including the new M9E audit, passes;
3. CineArt live candidate validation remains green;
4. merged-main regression/mobile smoke passes;
5. GitHub Pages deployment passes.

After this checkpoint, M9 Motion / Native-feeling Interaction phase is considered complete unless real-device testing exposes a separate defect.
