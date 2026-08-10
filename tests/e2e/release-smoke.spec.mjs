import { test, expect } from "@playwright/test";

test("mobile release smoke keeps the movie-first comparison flow usable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator('[data-tab="now"]')).toBeVisible();
  await expect(page.locator('[data-tab="coming"]')).toBeVisible();
  await expect(page.locator("#movieGrid")).toBeVisible();

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await expect(firstMovie).toHaveAttribute("data-phase8a-direct-compare", "true", { timeout: 10_000 });

  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-sheet")).toBeVisible();
  await expect(overlay.locator(".provider-compare-close")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/provider-compare-open/);
  await expect(page.locator("#providerCompareContent")).toBeVisible();

  await overlay.locator(".provider-compare-close").click();
  await expect(overlay).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/provider-compare-open/);
  await expect(firstMovie).toBeVisible();

  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("home tabs remain interactive on the mobile viewport", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const now = page.locator('[data-tab="now"]');
  const coming = page.locator('[data-tab="coming"]');

  await expect(now).toHaveClass(/active/);
  await coming.click();
  await expect(coming).toHaveClass(/active/);
  await expect(now).not.toHaveClass(/active/);

  await now.click();
  await expect(now).toHaveClass(/active/);
  await expect(page.locator("#movieGrid")).toBeVisible();
});

test("Classic mobile polish stays inside the viewport and keeps key touch targets usable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });

  const homeGeometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(homeGeometry.scrollWidth).toBeLessThanOrEqual(homeGeometry.clientWidth + 1);

  const tabBox = await page.locator('[data-tab="now"]').boundingBox();
  expect(tabBox?.height || 0).toBeGreaterThanOrEqual(40);

  await firstMovie.click();
  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });

  const sheet = overlay.locator(".provider-compare-sheet");
  const sheetGeometry = await sheet.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(sheetGeometry.scrollWidth).toBeLessThanOrEqual(sheetGeometry.clientWidth + 1);

  const closeBox = await overlay.locator(".provider-compare-close").boundingBox();
  expect(closeBox?.width || 0).toBeGreaterThanOrEqual(40);
  expect(closeBox?.height || 0).toBeGreaterThanOrEqual(40);
});
