import { test, expect } from "@playwright/test";

test("Metro M1 preview builds the new home shell without changing the Classic default", async ({ page }) => {
  await page.goto("/?skin=metro", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");
  await expect(page.locator(".topbar-brand .eyebrow")).toHaveText("MOVIEMETRO / 電影資訊");
  await expect(page.locator(".topbar-brand h1")).toBeHidden();
  await expect(page.locator("#systemStatus")).toBeHidden();
  await expect(page.locator(".section-heading")).toBeHidden();

  await expect(page.locator('[data-tab="now"]')).toContainText("現正在映");
  await expect(page.locator('[data-tab="coming"]')).toContainText("即將上映");
  await expect(page.locator('[data-classic-final-tab-count="now"]')).toHaveText(/^\d+$/, { timeout: 30_000 });
  await expect(page.locator('[data-classic-final-tab-count="coming"]')).toHaveText(/^\d+$/, { timeout: 30_000 });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });

  const tools = page.locator("#homeLibraryTools");
  await expect(tools).toBeVisible();
  await expect(page.locator("#dataHealth")).toBeVisible({ timeout: 15_000 });

  const shell = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const app = document.querySelector(".app-shell");
    const tabs = document.querySelector(".tabs");
    const grid = document.querySelector("#movieGrid");
    const card = document.querySelector("#movieGrid .movie-card:not(.movie-group-member)");
    const controls = document.querySelector(".home-library-filter-options");
    const toolsNode = document.querySelector("#homeLibraryTools");
    const health = document.querySelector("#dataHealth");
    const appRect = app?.getBoundingClientRect();
    return {
      background: html.backgroundColor,
      appWidth: appRect?.width || 0,
      tabsBorderRadius: parseFloat(getComputedStyle(tabs).borderRadius || "0"),
      cardBorderRadius: parseFloat(getComputedStyle(card).borderRadius || "0"),
      gridColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
      controlColumns: getComputedStyle(controls).gridTemplateColumns.split(" ").filter(Boolean).length,
      toolsPosition: getComputedStyle(toolsNode).position,
      healthParentClass: health?.parentElement?.className || "",
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || ""
    };
  });

  expect(shell.background).toBe("rgb(0, 0, 0)");
  expect(shell.appWidth).toBeLessThanOrEqual(500);
  expect(shell.tabsBorderRadius).toBe(0);
  expect(shell.cardBorderRadius).toBe(0);
  expect(shell.gridColumns).toBe(2);
  expect(shell.controlColumns).toBe(4);
  expect(shell.toolsPosition).toBe("static");
  expect(shell.healthParentClass).toContain("home-library-filter-options");
  expect(shell.themeColor).toBe("#000000");

  const metadata = firstMovie.locator(".movie-meta");
  if (await metadata.count()) {
    await expect(metadata).toHaveAttribute("data-metro-decorated", "true");
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  await expect(page.locator(".home-library-filter-options")).toBeVisible();
});
