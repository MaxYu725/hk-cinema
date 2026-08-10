# Phase 9D0 — Home sticky scroll trap hotfix

Status: ready for review.

## Root cause

On mobile, `home-library.js` toggles `.is-stuck` at the exact sticky boundary. `home-library.css` used that same transient class to set the library view chips and result footer to `display: none`, shrinking the sticky element at the boundary. Android Chromium scroll anchoring could then correct `scrollY` back across the threshold, causing repeated expand/collapse oscillation during slow finger scrolling. Fast inertial flicks could cross the threshold in one gesture, which masked the issue.

## Fix

- keep `.is-stuck` layout-height neutral via a late additive CSS override
- compact the toolbar only with a separate `.is-stuck-latched` class
- latch only after the viewport has moved safely past the sticky boundary using a dynamic enter buffer (minimum 64px)
- unlatch only after genuinely scrolling above the toolbar's natural position
- preserve passive scroll handling and the existing compact sticky appearance

## Scope boundary

No provider, movie catalogue, filter, comparison, seat, booking, PWA cache or icon behavior changes.

## Validation

- Node regression verifies cascade order and buffered latch contract
- Chromium regression verifies transient `.is-stuck` does not hide rows, latched state survives a small scroll correction, and normal expansion returns above the natural toolbar position
