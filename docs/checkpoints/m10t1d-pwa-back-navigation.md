# M10T1D — PWA Back Navigation

Status: **implementation complete — exact-head gates pending**

Baseline: `main@4ab6fe3de8c6d9c032d9686a5e59e2a17bf82cf9`

## Trigger

Android installed-PWA acceptance found that pressing the system Back gesture/button while an HK Cinema internal full-screen view was open exited/closed the app instead of returning to the previous HK Cinema view.

Returning from an external official ticketing website already behaved correctly because that navigation creates its own browser history entry outside HK Cinema.

## Root cause

HK Cinema comparison, movie-detail and shared seat-map surfaces are DOM overlays. Their owners toggle `hidden` and body classes, but the app did not create any same-document History API entry when those surfaces opened.

From Android's perspective, an installed PWA launched at the home document therefore had no intermediate navigation entry to consume. A Back action at a comparison/detail/seat-map surface could immediately leave the PWA.

## Change

`app/pwa-back-navigation.js` becomes the single same-document PWA history owner.

It models only these full-screen navigation layers:

- `compare` — `#providerCompareOverlay`
- `detail` — `#movieDetailOverlay`
- `seatmap` — `#sharedSeatMapOverlay`

The runtime initializes the current document as the base `[]` stack with `history.replaceState()`.

When an existing overlay owner opens a tracked surface, the runtime records the new visible layer with `history.pushState()` while keeping the exact same URL.

Expected stacks:

- Home: `[]`
- Home → comparison: `["compare"]`
- Home → detail: `["detail"]`
- Comparison → seat map: `["compare", "seatmap"]`
- Detail → seat map: `["detail", "seatmap"]`

On `popstate`, the runtime calls the existing owner close API only for layers above the target state. It does not reproduce, clone or rerender product content.

## Manual close synchronization

The existing X/backdrop/Escape owners remain authoritative and close their overlays synchronously as before.

M10T1D observes the tracked overlay's `hidden` attribute. If a user closes a tracked layer manually, the history runtime consumes the matching same-document history entry with `history.go(-N)`.

This prevents stale/ghost history entries such as:

1. open comparison;
2. press X;
3. later press Android Back;
4. accidentally consume an invisible comparison entry.

If both a detail surface and its seat map close together, the runtime can consume both matching entries in one bounded traversal.

## Observation boundary

No shared owner is monkey-patched.

- the body observer is `childList` only and direct-child only;
- it exists solely to discover the three dynamically created overlay roots;
- each discovered root receives its own `hidden`-attribute-only observer;
- there is no body-wide attribute/subtree observation.

## External official ticketing behavior

M10T1D does not intercept or rewrite official ticketing anchors.

- no `window.open()` ownership;
- no location navigation;
- no URL route/hash change;
- History API entries use the current `window.location.href` unchanged.

Therefore the existing behavior remains: leaving HK Cinema for an official ticketing page and pressing browser Back returns to the still-open HK Cinema PWA surface.

## Safety boundary

M10T1D does not:

- call `fetch()`;
- change Provider / Worker / Registry code;
- change comparison/detail/seat-map request lifecycle;
- change Service Worker or manifest behavior;
- call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`;
- own scroll position;
- intercept official booking links;
- suppress the final Back action when the app is already at the home/base stack.

At the base `[]` state, Android Back remains browser/OS-owned and may leave the PWA normally.

## Validation

Static regression verifies:

- same-document History API ownership only;
- only compare/detail/seatmap are tracked;
- direct-child body observation and hidden-only overlay observers;
- existing external URL behavior is untouched;
- runtime loads after the existing overlay owners.

Pixel 7 E2E verifies:

1. open comparison;
2. open a synthetic shared seat-map surface without network dependence;
3. browser/Android-equivalent Back closes seat map but leaves comparison visible;
4. second Back closes comparison but leaves the home document visible;
5. URL remains unchanged throughout;
6. manually closing comparison consumes its matching history entry and does not leave a ghost state.

## Required gates

Before merge:

- full Node regression;
- Chromium install;
- Pixel 7 mobile browser smoke;
- exact-head branch diff / mergeability review.

After merge:

- merged-main Regression / Chromium / Pixel 7 smoke;
- GitHub Pages deployment.

No Cloudflare Worker deployment is expected because this checkpoint changes browser/PWA files only.
