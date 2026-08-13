# M8A4 — CineArt Seat-map Presentation

## Baseline and prerequisite

- Baseline: `main@bcda8bb16ce20e2e03b94924174b0c987ecaaf1c`.
- M8A3 Emperor Android installed-PWA acceptance: **PASS**. The user replied `正常` after verifying the Emperor presentation.

## Goal

Finish the provider-specific seat-map presentation pass for CineArt while preserving CineArt's official positioned geometry and its existing front-row-at-bottom orientation.

## Presentation policy

- keep official CineArt seat coordinates and the shared positioned scale unchanged;
- keep visible CineArt seat squares at 20 px;
- keep `銀幕` below the seats;
- move the visible `銀幕` marker into the last positioned canvas so horizontal scrolling moves it together with the seat plan;
- reserve 52 px at the bottom of the last positioned canvas for the screen marker;
- keep the existing horizontal scrolling and centering lifecycle.

## Boundaries

No changes to CineArt Worker routes, upstream transport, showtimes, prices, strict seat states, booking capability, provider adapter, shared seat-map JavaScript, Service Worker, Broadway, MCL or Emperor presentation.

The global Worker `/health phase:"6G"` contract remains unchanged.

## Release gates

Before merge: Node regression, Chromium install, mobile browser smoke, CineArt candidate validation, exact-head diff audit and review.

After squash merge: merged-main regression, Chromium/mobile smoke and Pages deploy.

## Manual gate

Android installed-PWA verification is mandatory before closing M8A4. Confirm CineArt seats remain visually consistent, `銀幕` remains below the seats and scrolls horizontally with the plan, repeated close/reopen stays responsive, there is still no CineArt booking button, and MCL/Broadway/Emperor remain unchanged.
