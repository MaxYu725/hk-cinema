# Phase 10R3A — Mobile Shell & Comparison Date Strip

## Baseline

- Base commit: `cedf337ad2c6ada124d7574a8c931e402066749b`
- Base phase: completed Phase 10R2E
- Scope: mobile/PWA presentation and comparison date-strip behavior only
- Provider parsing, Worker routes, price/seat logic, Smart Picks and recommendation logic: unchanged

## Real-device findings

The Android PWA screenshots exposed four release-level issues:

1. The installed PWA still showed the Android status bar instead of using the full display.
2. The compact three-provider data-health control occupied the first visible row, leaving the movie tabs below it.
3. The comparison date rail retained an obsolete 50–56px right gutter and a redundant left `日期` label, clipping later dates.
4. Selecting a later date correctly changed `selectedDate`, but the comparison renderer rebuilt the date rail after the async request. The new horizontal scroller started at `scrollLeft = 0`, visually returning to today while the selected later date remained active off to the right.

## Changes

### PWA fullscreen

- Manifest primary `display` changed from `standalone` to `fullscreen`.
- `display_override` keeps `fullscreen` first and `standalone` as fallback.
- Manifest link receives the `10r3a-1` release query so installed clients can observe the changed manifest resource.
- Service Worker shell cache rotates to `hk-cinema-shell-10r3a-1`.
- Controlled update invariant is unchanged: there is no automatic install-time `skipWaiting()`; activation still requires the existing runtime message after user acceptance.

### Homepage ordering

- The now-empty Classic topbar is hidden.
- `現正上映 / 即將上映` becomes the first visible application row.
- The existing `#dataHealth` details element is moved, not recreated, into `#homeLibraryTools`.
- It occupies the second grid row beside the library chips, under the sort area.
- Existing data-health state, refresh-on-open behavior and flyout remain intact.
- When the search/sort tools become sticky on mobile, the secondary filter/status row stays collapsed as before.

### Comparison date rail

- The redundant `日期` label is hidden on mobile.
- The obsolete right gutter is removed; the sticky rail now uses symmetric 10px horizontal padding.
- The date scroller no longer carries the previous negative right margin / extra right padding, so it can use essentially the whole rail width.

### Selected-date position

- A small presentation runtime watches for replacement date rails.
- After the layout decorator has settled, it finds the `.active[data-provider-compare-date]` button and recenters that selected date inside the horizontal scroller.
- The calculation uses measured scroller/selected rectangles plus current `scrollLeft`; it does not assume today or the first date.
- This directly addresses the async DOM-replacement reset without changing provider loading or selected-date state logic.

## Regression coverage

- Existing fullscreen/manifest tests updated.
- New `phase10r3a-mobile-shell-date-strip.test.mjs` locks the PWA, home placement, date-width and selected-date contracts.
- Mobile Classic E2E now verifies:
  - topbar hidden and tabs first;
  - data health is inside the home tools beside the filter chips;
  - date label hidden and rail uses almost the full width;
  - replacing the date rail with a later active date recenters that active date inside the viewport.
- Offline PWA and release smoke tests are aligned with the tabs-first shell.

## Non-goals

No changes are made to:

- Broadway / MCL / Emperor parsers
- provider retries/timeouts
- Worker API routes
- MCL network-path behavior
- seat-map fetching
- price normalization
- comparison filters/recommendations
- Service Worker live-data cache boundary
