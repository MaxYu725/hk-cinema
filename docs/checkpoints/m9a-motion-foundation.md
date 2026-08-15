# M9A — Motion Foundation

## Baseline

- Production base: `main@343b50cff33a556689b792dfeb52e72e3429e207`
- Scope: Metro/PWA presentation only
- Functional data, provider, comparison and seat-map lifecycle logic remain unchanged.

## Added contract

`app/motion-foundation.css` is the single motion vocabulary for M9B–M9D.

Timing:

- press: 120ms
- fast UI feedback: 160ms
- normal transition: 200ms
- slow sheet transition ceiling: 240ms
- loading pulse primitive: 900ms, opacity-only

Motion properties are limited to `transform` and `opacity` for keyframes. State transitions may additionally interpolate color/background/border/outline without changing layout geometry.

## Initial adoption

The foundation is loaded after Metro presentation owners and provides:

- consistent shallow press feedback for existing buttons/cards;
- focus/selected-state transition timing;
- entry motion for comparison and seat-map sheets without changing their `hidden` lifecycle;
- entry motion for Data Health / resilience flyouts;
- reusable fade, slide-up and pulse primitives for later M9 checkpoints.

No individual seat animation is introduced.

## Reduced motion

`prefers-reduced-motion: reduce` collapses motion durations/distances and disables reusable/overlay animations. Existing controls remain immediately operable.

## Boundaries

M9A intentionally does **not** add JavaScript close choreography. Reverse/exit transitions require lifecycle coordination and belong to M9C so the current X/back behavior cannot be delayed or blocked by presentation code.

## Regression gate

`tests/m9a-motion-foundation.test.mjs` verifies:

- stylesheet ownership/load order;
- bounded timing/easing tokens;
- reduced-motion support;
- compositor-friendly keyframes;
- no seat-by-seat animation;
- no `display:none` / lifecycle ownership in the motion layer.
