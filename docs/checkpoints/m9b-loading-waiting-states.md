# M9B — Loading / Waiting States

## Baseline

- Production base: `main@8ba49e433b7d4d6b0dc2079df9f5c6d9e24bf209`
- M9A motion foundation remains the only motion vocabulary.
- Scope is Metro/PWA presentation. Provider adapters, Worker routes and request owners are unchanged.

## Home first load

The existing Broadway home loading state is decorated with six lightweight movie-card skeletons.

- no extra network request;
- no fake movie data;
- Home Library continues to ignore the skeletons because they are not `.movie-card` records;
- cached catalogue paths continue to render real content immediately instead of forcing skeletons.

## Comparison waiting

Initial comparison loading keeps the movie hero visible and adds a showtime-shaped skeleton below it.

For a user-initiated date change, M9B captures the already-rendered timeline at the `window` capture phase, before the existing document-level comparison handler starts the new request. The original comparison owner still performs date selection, abort/supersede and fetch work.

While that request is pending:

- the previous timeline stays visible at reduced opacity;
- the newly selected date is highlighted in the visual snapshot;
- a local busy strip states that the selected date is updating;
- old showtime cards are temporarily non-interactive so a stale seat map cannot be opened accidentally;
- close/back and date controls remain immediately operable.

When the existing comparison owner renders the completed request, the snapshot is replaced naturally by the fresh DOM.

## Seat-map waiting

The shared seat-map loader keeps the cinema/showtime header and receives a cheap geometry skeleton:

- one screen line;
- eight repeated seat-row bands;
- no individual-seat animation;
- no change to shared seat-map cache, timeout, adapter or close behavior.

## Data refresh progress

M9B mirrors the existing hidden `#refreshButton.is-loading` state into a 2px Metro top progress indicator.

This deliberately follows Data Health's established busy/safety lifecycle instead of starting a second refresh timer or calculating fake percentages.

## Motion/performance boundaries

- skeletons use the M9A opacity pulse, not shimmer;
- progress animation uses `transform + opacity` only;
- no layout property is animated;
- no provider/network API is called from M9B;
- `prefers-reduced-motion` disables repeated animation while retaining the waiting UI.

## Regression gate

`tests/m9b-loading-states.test.mjs` verifies:

- M9B asset order after M9A/Metro owners;
- runtime syntax;
- no network/request-owner takeover;
- home/comparison/seat-map/data-progress coverage;
- date snapshot behavior without blocking original events;
- compositor-friendly keyframes and reduced-motion support.