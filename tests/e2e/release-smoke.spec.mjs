import { test, expect } from "@playwright/test";

test("mobile release smoke keeps the movie-first comparison flow usable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".topbar")).toBeHidden();
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

test("selected date stays legible, date rail pins, and filters use one-open compact groups", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  const sheet = overlay.locator(".provider-compare-sheet");
  const rail = overlay.locator(".provider-compare-date-rail");
  const activeDate = rail.locator(".provider-compare-date.active");

  await expect(activeDate).toBeVisible({ timeout: 30_000 });
  const activeStyle = await activeDate.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(activeStyle.background).not.toBe("rgb(255, 255, 255)");
  expect(activeStyle.background).not.toBe(activeStyle.color);

  await expect(rail.locator(".provider-compare-date-label")).toBeHidden();
  const stickyStyle = await rail.evaluate(element => {
    const style = getComputedStyle(element);
    return { position: style.position, top: style.top };
  });
  expect(stickyStyle.position).toBe("sticky");
  expect(stickyStyle.top).toBe("0px");

  const scrollRange = await sheet.evaluate(element => element.scrollHeight - element.clientHeight);
  if (scrollRange > 180) {
    await sheet.evaluate(element => { element.scrollTop = Math.min(element.scrollHeight, element.scrollTop + 900); });
    await page.waitForTimeout(100);
    const [sheetBox, railBox] = await Promise.all([sheet.boundingBox(), rail.boundingBox()]);
    expect(Math.abs((railBox?.y || 0) - (sheetBox?.y || 0))).toBeLessThanOrEqual(2);
  }

  const filterToggle = overlay.locator("[data-provider-filter-toggle]");
  await expect(filterToggle).toBeVisible({ timeout: 12_000 });
  if ((await filterToggle.getAttribute("aria-expanded")) !== "true") await filterToggle.click();

  const controls = overlay.locator(".phase8c-controls");
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute("data-phase9b3-compact", "true", { timeout: 5_000 });
  const summaries = controls.locator("[data-phase9b3-group-toggle]");
  expect(await summaries.count()).toBeGreaterThanOrEqual(6);

  await summaries.nth(0).click();
  await expect(summaries.nth(0)).toHaveAttribute("aria-expanded", "true");
  expect(await controls.locator(".phase9b3-filter-group-body:not([hidden])").count()).toBe(1);

  await summaries.nth(1).click();
  await expect(summaries.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(summaries.nth(1)).toHaveAttribute("aria-expanded", "true");
  expect(await controls.locator(".phase9b3-filter-group-body:not([hidden])").count()).toBe(1);
});