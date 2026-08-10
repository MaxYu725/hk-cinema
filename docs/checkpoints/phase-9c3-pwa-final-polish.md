# Phase 9C3 — PWA final polish / Classic release acceptance

Status: ready for PR validation.

Scope:
- replace automatic Service Worker takeover with an explicit update-ready prompt
- activate the waiting worker only after the user chooses `重新載入`
- report offline / restored-network state without caching live cinema data
- apply four-edge safe-area protection to the app shell, PWA notice, comparison sheet and close control
- extend browser acceptance for offline shell and connectivity notices

Safety boundary:
- provider APIs, catalogue matching, comparison, filters, Smart Picks, price, seat, seat-map and booking behavior are unchanged
- cinema APIs, Worker requests, showtimes, prices and seats remain outside Service Worker caching
- Phase 9D0 sticky-scroll behavior is unchanged

Release intent:
- after device acceptance, freeze the Classic product surface and move future major presentation work to the Metro skin.
