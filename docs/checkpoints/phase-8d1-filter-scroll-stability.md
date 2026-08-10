# Phase 8D1 checkpoint — filter scroll stability

## Problem

On mobile browsers, selecting some comparison filters could jump the full-screen comparison sheet back toward the top.

The filter result calculation itself was not the direct cause. Phase 8C rebuilds the filter panel after each interaction, and Phase 8B then repositions that regenerated panel into the movie-first layout. Removing the currently interacted control plus the follow-up DOM move can make Chromium change the scroll position of `.provider-compare-sheet`.

## Fix

- add a small interaction scroll-stability layer for the comparison filter surface
- capture the current comparison-sheet scroll position and the tapped control's viewport anchor before Phase 8C handles click/change
- restore the same visual anchor after the synchronous filter rebuild
- restore again on the following animation frames so Phase 8B's mutation-driven layout pass cannot move the viewport
- fall back to the previous absolute `scrollTop` when the interacted control disappears (for example clearing an active-filter chip)
- do not force focus or open any control; only preserve viewport position

## Scope boundary

- no changes to Phase 8C filter matching, sorting or persisted preferences
- no changes to Smart Picks scoring
- no changes to provider loading, merged variants, booking or seat maps
- this is a mobile browsing stability hotfix only

## Validation

- syntax check for the new scroll-stability runtime
- deterministic contract checks for window-capture ordering, comparison-sheet targeting, visual-anchor restoration, and the second animation-frame restore
