import { test, expect } from "@playwright/test";

async function waitForComparisonIdle(page, timeout = 45_000) {
  await page.waitForFunction(() => {
    const state = window.HKCinemaProviderCompare?.getState?.();
    return Boolean(state && state.loadingInitial !== true && state.loadingDate !== true);
  }, null, { timeout });
}

async function visibleCineArtCandidateCount(page) {
  const candidates = page.locator(
    '#movieGrid .movie-card[data-provider="cineart"], #movieGrid .movie-card[data-provider-sources*="cineart"]'
  );
  const count = await candidates.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await candidates.nth(index).isVisible()) visible += 1;
  }
  return visible;
}

async function openLiveCineArtComparison(page) {
  const candidates = page.locator(
    '#movieGrid .movie-card[data-provider="cineart"], #movieGrid .movie-card[data-provider-sources*="cineart"]'
  );
  const overlay = page.locator("#providerCompareOverlay");

  await expect.poll(() => visibleCineArtCandidateCount(page), {
    timeout: 45_000,
    intervals: [500, 1_000, 2_000]
  }).toBeGreaterThan(0);

  const candidateCount = Math.min(await candidates.count(), 12);
  for (let index = 0; index < candidateCount; index += 1) {
    const card = candidates.nth(index);
    if (!await card.isVisible()) continue;

    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await waitForComparisonIdle(page);

    const cineartShows = overlay.locator('.provider-compare-show[data-provider="cineart"]');
    if (await cineartShows.count()) return { overlay, cineartShows };

    const dates = overlay.locator("[data-provider-compare-date]");
    const dateCount = Math.min(await dates.count(), 7);
    for (let dateIndex = 0; dateIndex < dateCount; dateIndex += 1) {
      await dates.nth(dateIndex).click();
      await waitForComparisonIdle(page);
      if (await cineartShows.count()) return { overlay, cineartShows };
    }

    await overlay.locator(".provider-compare-close").click();
    await expect(overlay).toBeHidden({ timeout: 8_000 });
  }

  throw new Error(`No live CineArt showtime was reachable from ${candidateCount} visible/matched homepage candidates`);
}

test("production mobile PWA exposes live CineArt comparison, price and strict seat summary", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });

  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");
  await expect(page.locator('[data-tab="now"]')).toBeVisible();
  await expect(page.locator("#movieGrid")).toBeVisible();
  await expect(page.locator("#movieGrid .movie-card:not(.movie-group-member)").first()).toBeVisible({ timeout: 45_000 });

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toMatch(/manifest/i);

  await expect.poll(async () => page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return 0;
    return (await navigator.serviceWorker.getRegistrations()).length;
  }), {
    timeout: 20_000,
    intervals: [500, 1_000, 2_000]
  }).toBeGreaterThan(0);

  await page.waitForFunction(() => {
    const record = window.HKCinemaDataHealth?.getState?.()?.records?.cineart;
    return Boolean(record && record.status !== "loading");
  }, null, { timeout: 45_000 });

  const health = await page.evaluate(() => window.HKCinemaDataHealth.getState().records.cineart);
  expect(health.status).not.toBe("error");
  expect(health.updatedAt).toBeTruthy();
  await expect(page.locator('[data-data-health-provider="cineart"]')).toHaveCount(1);

  const homeGeometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(homeGeometry.scrollWidth).toBeLessThanOrEqual(homeGeometry.clientWidth + 1);

  const { overlay, cineartShows } = await openLiveCineArtComparison(page);
  const cineartShow = cineartShows.first();
  await cineartShow.scrollIntoViewIfNeeded();
  await expect(cineartShow).toBeVisible();
  await expect(cineartShow).toHaveAttribute("data-cineart-enriched", "true", { timeout: 35_000 });
  await expect(cineartShow).toHaveAttribute("data-price-loaded", "true", { timeout: 5_000 });
  await expect(cineartShow).toHaveAttribute("data-seat-loaded", "true", { timeout: 5_000 });

  const enrichment = await cineartShow.evaluate(card => ({
    adult: Number(card.dataset.priceAdult),
    available: Number(card.dataset.seatAvailable),
    total: Number(card.dataset.seatTotal),
    held: card.dataset.seatHeld === undefined ? null : Number(card.dataset.seatHeld),
    sold: card.dataset.seatSold === undefined ? null : Number(card.dataset.seatSold),
    blocked: card.dataset.seatBlocked === undefined ? null : Number(card.dataset.seatBlocked),
    priceText: card.querySelector(".provider-compare-show-price")?.textContent?.trim() || "",
    seatText: card.querySelector(".provider-compare-seat")?.textContent?.trim() || ""
  }));

  expect(Number.isFinite(enrichment.adult)).toBe(true);
  expect(enrichment.adult).toBeGreaterThan(0);
  expect(Number.isFinite(enrichment.available)).toBe(true);
  expect(enrichment.available).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(enrichment.total)).toBe(true);
  expect(enrichment.total).toBeGreaterThan(0);
  expect(enrichment.available).toBeLessThanOrEqual(enrichment.total);
  expect(enrichment.priceText).toMatch(/^\$\d+/);
  expect(enrichment.seatText).toMatch(/可選/);

  const filterToggle = overlay.locator("[data-provider-filter-toggle]");
  await expect(filterToggle).toBeVisible({ timeout: 12_000 });
  if ((await filterToggle.getAttribute("aria-expanded")) !== "true") await filterToggle.click();
  await expect(overlay.locator(".phase8c-controls")).toBeVisible();

  const sheetGeometry = await overlay.locator(".provider-compare-sheet").evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(sheetGeometry.scrollWidth).toBeLessThanOrEqual(sheetGeometry.clientWidth + 1);

  await overlay.locator(".provider-compare-close").click();
  await expect(overlay).toBeHidden({ timeout: 8_000 });
  await expect(page.locator("body")).not.toHaveClass(/provider-compare-open/);

  expect(pageErrors, `Unexpected production browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
