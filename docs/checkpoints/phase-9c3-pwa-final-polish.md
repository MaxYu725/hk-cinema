# Phase 9C3 — PWA final polish / Classic release acceptance

Status: release candidate; freeze Classic after PR CI and main Pages deploy are green.

Scope:
- replace automatic Service Worker takeover with an explicit update-ready prompt
- activate the waiting worker only after the user chooses `重新載入`
- report offline / restored-network state without caching live cinema data
- apply four-edge safe-area protection to the app shell, PWA notice, comparison sheet and close control
- extend browser acceptance for offline shell and connectivity notices

PWA acceptance isolation:
- Chromium PWA smoke runs the current build in a brand-new BrowserContext
- do not rely on `unregister()` to detach an already-active Service Worker from an existing client
- keep production Service Worker activation user-controlled; no automatic `skipWaiting()` takeover
- keep the offline notice requirement strict: `目前離線` must be visible after an offline shell reload and `已恢復連線` after connectivity returns

Safety boundary:
- provider APIs, catalogue matching, comparison, filters, Smart Picks, price, seat, seat-map and booking behavior are unchanged
- cinema APIs, Worker requests, showtimes, prices and seats remain outside Service Worker caching
- Phase 9D0 sticky-scroll behavior is unchanged

Release intent:
- after CI and Pages acceptance, freeze the Classic product surface
- the next major presentation phase is Windows Phone Metro Skin; Classic remains the stable reference skin rather than receiving further broad visual redesign
