# M9E3 — Comparison Result Curtain

## Baseline

- base: `main@e339645ebcd9fd16afc18280ff0e80e1d96131a2`
- issue: real mobile/PWA could still show a faint one-frame flash when comparison date data finished, because core render and Phase8B/filter/Smart Picks decorators settle across adjacent frames.

## Decision

Stop trying to expose every intermediate DOM state correctly. Treat a comparison date refresh as a visual transaction:

1. user chooses a date
2. before the comparison owner handles the click, Metro installs an opaque black curtain
3. the existing comparison owner, filters, Smart Picks and Phase8B continue updating normally behind it
4. after the final timeline exists, required decorators are present and three consecutive animation frames are structurally quiet, the curtain fades away
5. a bounded fallback releases the curtain if an optional decorator never reaches the expected shape

## Presentation boundary

The curtain begins below the movie hero. This deliberately covers the date/filter/reset/result area during the request because those controls are also reconstructed by the current comparison renderer. Keeping them outside the curtain would leave one more transient repaint surface.

The live DOM remains in normal flow. The curtain is `position:absolute`; no section is collapsed, cloned or removed for presentation purposes.

## Ownership boundary

M9E3 does not:

- call `fetch()`
- replace `HKCinemaProviderCompare`
- prevent or stop input events
- change Provider / Worker / Registry logic
- clone comparison content
- move or resize the live result structure

It observes only `#providerCompareContent` while that node exists.

## Settle contract

Normal reveal requires:

- no provider loading state
- no M9B stale-date snapshot state
- `.provider-compare-timeline-section.phase8b-timeline-section`
- date rail
- provider insights/filter owner
- reset control
- all-showtimes heading
- timeline or empty result
- three consecutive quiet `requestAnimationFrame` checks

A 900ms post-result fallback prevents a permanently covered comparison if an optional decorator shape changes in the future.

## Reduced motion

The curtain remains functional but removes the reveal transition under `prefers-reduced-motion: reduce`.
