import { test, expect } from "@playwright/test";

test("Metro preview applies the Windows Phone shell without breaking movie navigation", async ({ page }) => {
  await page.goto("/?skin=metro", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");
  await expect(page.locator(".topbar-brand")).toBeVisible();
  await expect(page.locator(".topbar h1")).toHaveText("HK Cinema");

  const shellStyle = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const heading = getComputedStyle(document.querySelector(".topbar h1"));
    const activeTab = document.querySelector(".tab.active");
    const tabStyle = getComputedStyle(activeTab);
    const tabAccent = getComputedStyle(activeTab, "::after");
    return {
      background: body.backgroundColor,
      headingWeight: heading.fontWeight,
      tabRadius: tabStyle.borderRadius,
      tabAccent: tabAccent.backgroundColor
    };
  });

  expect(shellStyle.background).toBe("rgb(0, 0, 0)");
  expect(["200", "300"]).toContain(shellStyle.headingWeight);
  expect(shellStyle.tabRadius).toBe("0px");
  expect(shellStyle.tabAccent).not.toBe("rgba(0, 0, 0, 0)");

  const metroSort = page.locator("[data-metro-sort-command]");
  await expect(metroSort).toBeVisible({ timeout: 12_000 });
  await expect(page.locator(".home-movie-sort")).toBeHidden();
  await expect(metroSort).toContainText("原有排序");

  await metroSort.click();
  await expect.poll(() => page.evaluate(() => window.HKCinemaHomeLibrary?.getState().sort)).toBe("release");
  await expect(metroSort).toContainText(/最新上映|最快上映/);

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });

  const cardStyle = await firstMovie.evaluate(element => {
    const style = getComputedStyle(element);
    const info = getComputedStyle(element.querySelector(".movie-info"));
    const box = element.getBoundingClientRect();
    return {
      radius: style.borderRadius,
      shadow: style.boxShadow,
      background: style.backgroundColor,
      ratio: box.width / box.height,
      infoPosition: info.position
    };
  });
  expect(cardStyle.radius).toBe("0px");
  expect(cardStyle.shadow).toBe("none");
  expect(cardStyle.background).toBe("rgb(17, 17, 17)");
  expect(cardStyle.ratio).toBeGreaterThan(0.96);
  expect(cardStyle.ratio).toBeLessThan(1.04);
  expect(cardStyle.infoPosition).toBe("absolute");
  await expect(firstMovie.locator(".movie-title-en")).toBeHidden();
  await expect(firstMovie.locator(".movie-meta")).toBeHidden();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);

  await firstMovie.click();
  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-sheet")).toBeVisible();

  const sheetBackground = await overlay.locator(".provider-compare-sheet").evaluate(element => getComputedStyle(element).backgroundColor);
  expect(sheetBackground).toBe("rgb(0, 0, 0)");

  await overlay.locator(".provider-compare-close").click();
  await expect(overlay).toBeHidden();
});

test("Classic remains the default when no skin preview is requested", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "classic");
  await expect(page.locator("[data-metro-sort-command]")).toHaveCount(0);
});