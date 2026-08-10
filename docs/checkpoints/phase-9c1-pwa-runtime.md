# Phase 9C1 checkpoint — PWA runtime and cache boundary

## Scope

Add the first production PWA runtime without changing the established movie/comparison UI or caching any live cinema data.

## Product behavior

- `manifest.json` now has an explicit app id, standalone display metadata and categories.
- `pwa-runtime.js` registers `sw.js` only where Service Workers are supported in a secure context.
- The Service Worker discovers the same-origin CSS/JS assets referenced by the production index and precaches the app shell.
- Navigation uses network-first with an app-shell fallback for offline reopening.
- Same-origin static script/style/font/image/manifest requests use stale-while-revalidate.
- Cross-origin requests are deliberately ignored by the Service Worker.
- Broadway/MCL/Emperor live requests, the Cloudflare Worker API, prices, showtimes and seats therefore stay on their existing network/data-health paths.
- Old HK Cinema shell caches are removed on Service Worker activation.

## Release protection

- Node syntax gate covers `pwa-runtime.js` and `sw.js`.
- Static regression verifies manifest wiring and the same-origin cache boundary.
- Playwright verifies Service Worker registration, that the shell cache only contains same-origin URLs, and that the app shell can reopen with the browser offline.

## Intentionally deferred to 9C2

- final app icons / maskable icons
- Apple touch icon
- install presentation polish
- optional install/update affordances

## Metro boundary

PWA runtime is presentation-neutral and can serve both Classic and the future Metro skin.
