# Phase 10A3.1 — Data health flyout refresh hotfix

## Issue

After the initial provider refresh completed, opening the data-health flyout triggered the hidden refresh button. That synthetic click bubbled to the document-level outside-click handler and immediately closed the flyout, so users had to click again while refresh was already in progress.

## Fix

- Keep the original product behavior: opening the data-health flyout still triggers a three-provider refresh.
- During that one synchronous programmatic refresh click, treat the refresh button as part of the data-health panel for outside-click containment.
- Preserve normal click bubbling so Broadway, MCL, Emperor and data-health busy-state handlers all continue to receive the refresh click.
- Restore the native `contains()` behavior immediately after the refresh click completes.

## Regression acceptance

- Wait until the initial refresh is complete and the hidden refresh button is enabled.
- The first click on the data-health summary must open the flyout immediately.
- Exactly one refresh click must be triggered.
- The flyout must remain visible after the refresh starts.
- Existing Metro flyout geometry, Live Tile, sticky command and movie-to-comparison flows remain green.

No provider parsing, freshness thresholds, caching, comparison, seat or booking behavior is changed.
