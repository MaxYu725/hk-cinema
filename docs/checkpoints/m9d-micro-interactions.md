# M9D — Micro-interactions

## Baseline

Pre-M9D production baseline:

`main@9a65c04efc2d71848cdfa87b3ca864cde06a2252`

M9A established motion tokens, M9B added waiting states, and M9C added navigation/overlay transitions. M9D intentionally stays below those layers and only adds immediate touch acknowledgement and first-use guidance.

## Scope

### Movie-card press

- replace the older deep Metro `.96` press with a shallow `.985` press
- cancel the pressed class when pointer movement exceeds 10px so scrolling does not leave a card visually depressed
- tapping the favourite control does not depress the whole movie card

### Date / filter / sort acknowledgement

- short 180ms acknowledgement for home filter buttons
- comparison date buttons
- main comparison filter toggle and compact filter-group controls
- comparison filter option buttons
- Smart Pick buttons
- home sort selector
- comparison sort selector and cinema selector

The acknowledgement is visual only. It does not delay or block the owner click/change handler.

### Smart Pick target

M9C already owns the arrival animation and existing recommendation jump class. M9D adds a narrow absolute accent rail while `is-recommendation-jump` is present; no layout shift and no new recommendation logic.

### First-use seat-map horizontal hint

The shared seat-map owner already emits `.shared-seatmap-scroll-hint` only when geometry is wider than the viewport. M9D decorates that existing signal rather than estimating geometry itself.

- first scrollable seat map shows a compact `↔` hint
- the hint is considered learned only after real horizontal user interaction
- automatic post-render centering does not mark the hint as seen because scroll recognition is armed only by user pointer input
- horizontal wheel and keyboard arrow use also count as learning the interaction
- learned state is stored under `hkcinema:m9d-seat-scroll-hint-seen`
- storage access is guarded; restricted/private contexts keep a safe in-memory session state
- after learning, later scrollable seat maps suppress the hint

## Ownership boundaries

M9D does not:

- call `fetch()`
- replace `HKCinemaProviderCompare`
- replace `HKCinemaSeatMapShared`
- alter provider / Worker / Registry code
- call `preventDefault`, `stopPropagation`, or `stopImmediatePropagation`
- assign `scrollLeft` or take ownership of seat-map centering
- animate individual seats

## Motion / performance

- card press is a shallow transform + opacity change
- the only new keyframe is the first-use `↔` hint nudge and uses transform + opacity only
- Smart Pick target rail is static while the existing jump class is active
- `prefers-reduced-motion` removes the hint nudge and press transform

## Regression gate

`tests/m9d-micro-interactions.test.mjs` verifies:

1. M9D asset order after M9C
2. presentation-only ownership boundaries
3. shallow press and acknowledgement coverage
4. first-use hint persistence and protection against auto-centering false positives
5. Smart Pick target emphasis, compositor-only keyframes, reduced-motion behavior, and no per-seat animation
