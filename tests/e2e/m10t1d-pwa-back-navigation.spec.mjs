import { test, expect } from "@playwright/test";

async function waitHomeStable(page) {
  await expect(page.locator("#movieGrid .movie-card:not(.movie-group-member)").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#refreshButton")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openComparison(page) {
  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toHaveAttribute("data-phase8a-direct-compare", "true", { timeout: 10_000 });
  await firstMovie.click();
  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect.poll(async () => page.evaluate(() => window.HKCinemaPWABackNavigation?.getState?.().stack || []))
    .toEqual(["compare"]);
  return overlay;
}

async function openSyntheticSeatMap(page) {
  await page.evaluate(async () => {
    const provider = window.HKCinemaViewModels.provider("cineart");
    await window.HKCinemaSeatMapShared.open({
      provider: "cineart",
      key: "m10t1d-synthetic-seatmap",
      showtime: {
        sourceId: "m10t1d",
        date: "2026-08-15",
        time: "23:00",
        cinema: { name: { zh: "PWA Back Test" } },
        metadata: { formats: [], languages: [], subtitles: [] }
      },
      load: async () => ({}),
      adapt: () => ({
        kind: "seat-map",
        schemaVersion: 1,
        provider,
        sessionId: "m10t1d",
        layoutMode: "grid",
        screenLabel: "銀幕",
        summary: { total: 0, available: 0 },
        sections: [],
        notices: [],
        bookingUrl: null,
        showtime: null,
        source: { quality: "test", name: "m10t1d", updatedAt: null }
      })
    });
  });
  await expect(page.locator("#sharedSeatMapOverlay")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.HKCinemaPWABackNavigation?.getState?.().stack || []))
    .toEqual(["compare", "seatmap"]);
}

test("M10T1D Android back closes seat map then comparison before leaving the app", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");
  await waitHomeStable(page);

  const appUrl = page.url();
  const comparison = await openComparison(page);
  await openSyntheticSeatMap(page);

  await page.goBack();
  await expect(page.locator("#sharedSeatMapOverlay")).toBeHidden();
  await expect(comparison).toBeVisible();
  expect(page.url()).toBe(appUrl);
  await expect.poll(async () => page.evaluate(() => window.HKCinemaPWABackNavigation?.getState?.().stack || []))
    .toEqual(["compare"]);

  await page.goBack();
  await expect(comparison).toBeHidden();
  await expect(page.locator("#movieGrid")).toBeVisible();
  expect(page.url()).toBe(appUrl);
  await expect.poll(async () => page.evaluate(() => window.HKCinemaPWABackNavigation?.getState?.().stack || []))
    .toEqual([]);

  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("M10T1D manual close consumes its same-document history entry without leaving a ghost", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitHomeStable(page);

  const appUrl = page.url();
  const comparison = await openComparison(page);
  await comparison.locator("[data-provider-compare-close]").last().click();
  await expect(comparison).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.HKCinemaPWABackNavigation?.getState?.().stack || []))
    .toEqual([]);
  expect(page.url()).toBe(appUrl);

  await openComparison(page);
  const state = await page.evaluate(() => window.HKCinemaPWABackNavigation.getState());
  expect(state.stack).toEqual(["compare"]);
  expect(state.stats.pushes).toBeGreaterThanOrEqual(2);
});
