# M6 Expansion Gate — automated mobile coverage

Scope: close the automation gap before the final real-device M6 sign-off. Runtime changes are limited to a concrete accessibility issue exposed by the gate; this checkpoint does not integrate a new cinema provider or redesign the seat map.

## Existing release-gate coverage

The mobile Playwright release smoke already exercises the production app stack at a Pixel 7-sized viewport and covers:

- Metro as the default skin.
- Homepage visibility and now/coming tab interaction.
- Movie-first comparison open/close lifecycle.
- Metro filter matrix dropdown geometry and one-open behavior.
- Classic mobile homepage/comparison geometry through `?skin=classic`.
- Classic selected-date rail and compact filter behavior.

The Pages workflow runs the full regression suite first, then installs Chromium and runs the complete Playwright mobile suite before a main deployment can proceed.

## Expansion-gate additions

### Explicit Classic fallback identity

Both release-smoke paths that navigate to `/?skin=classic` now assert that the root document resolves to:

```text
data-skin="classic"
```

This prevents a future regression where the Classic query parameter silently falls back to Metro while still passing generic mobile geometry checks.

### Deterministic Metro seat-map smoke

A new release-smoke case exercises the real `HKCinemaSeatMapShared` runtime in the normal app page without relying on a live provider having a usable seat map at the moment CI runs.

The test:

- loads the production Metro app runtime at the mobile viewport;
- opens `HKCinemaSeatMapShared` with a minimal deterministic Broadway grid model;
- verifies the full-screen overlay and `body.seatmap-open` lifecycle;
- verifies the shared seat-map content/provider marker and grid render;
- verifies available/sold seat status rendering;
- verifies the sheet stays within the mobile viewport;
- verifies the close target remains at least 40 × 40 CSS px;
- closes the seat map and verifies scroll-lock/open state is restored.

This intentionally validates the shared seat-map DOM/CSS/lifecycle rather than a live seat endpoint. Live provider data remains separately covered by provider/seat parsing tests and production-provider validation workflows; tying the release smoke to a specific current session would make the gate unnecessarily flaky.

### Gate finding — Metro close touch target

The first PR run rendered the deterministic seat map correctly, but the new mobile gate exposed one concrete accessibility issue: the Metro seat-map close button was explicitly sized at only `38px × 38px`.

The runtime hardening is intentionally narrow:

- increase the Metro seat-map close target to `44px × 44px`;
- adjust its fixed-position offset so the existing 16px right-edge spacing is preserved;
- keep the square Metro visual treatment and all seat-map data/layout behavior unchanged;
- cache-bust the existing `metro-m4-seat-view.css` production link so installed PWAs do not remain on the old target size;
- add Node regression coverage locking the 44 × 44 target in the consolidated Metro M4 seat-map layer.

No provider, seat parser, seat geometry or shared seat-map request behavior changes in this checkpoint.

## What this checkpoint does not claim

Automated Chromium is not a substitute for the final physical-device visual check. After this PR is green and merged, the remaining M6 expansion-gate work is:

1. open the deployed Metro PWA/site on a real phone and check home, comparison, filters and at least one available seat-map path visually;
2. open `?skin=classic` on a real phone and confirm the fallback remains usable;
3. write the final M6 handoff with authoritative application SHA, known limitations and provider-onboarding contract;
4. close issue #66 only after the real-device gate is explicitly accepted.

No fourth provider should be started before the gate is complete.
