# M6 Expansion Gate — automated mobile coverage

Scope: close the automation gap before the final real-device M6 sign-off. This checkpoint does not change production runtime behavior and does not integrate a new cinema provider.

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

## What this checkpoint does not claim

Automated Chromium is not a substitute for the final physical-device visual check. After this PR is green and merged, the remaining M6 expansion-gate work is:

1. open the deployed Metro PWA/site on a real phone and check home, comparison, filters and at least one available seat-map path visually;
2. open `?skin=classic` on a real phone and confirm the fallback remains usable;
3. write the final M6 handoff with authoritative application SHA, known limitations and provider-onboarding contract;
4. close issue #66 only after the real-device gate is explicitly accepted.

No fourth provider should be started before the gate is complete.
