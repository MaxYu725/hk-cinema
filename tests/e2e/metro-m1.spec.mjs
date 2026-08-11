import { test, expect } from "@playwright/test";

test("Metro preview builds the home shell and keeps homepage controls stable", async ({ page }) => {
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
  const search = page.locator(".home-movie-search");
  const sort = page.locator(".home-movie-sort");
  const sortSelect = page.locator("[data-home-movie-sort]");
  await expect(tools).toBeVisible();
  await expect(page.locator("#dataHealth")).toBeVisible({ timeout: 15_000 });
  await expect(sort.locator(":scope > span")).toBeHidden();
  await expect(sortSelect.locator("option")).toHaveText(["預設", "最新上映", "片名"]);

  const shell = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const app = document.querySelector(".app-shell");
    const tabs = document.querySelector(".tabs");
    const grid = document.querySelector("#movieGrid");
    const card = document.querySelector("#movieGrid .movie-card:not(.movie-group-member)");
    const controls = document.querySelector(".home-library-filter-options");
    const toolsNode = document.querySelector("#homeLibraryTools");
    const health = document.querySelector("#dataHealth");
    const searchNode = document.querySelector(".home-movie-search");
    const sortNode = document.querySelector(".home-movie-sort");
    const appRect = app?.getBoundingClientRect();
    const searchRect = searchNode?.getBoundingClientRect();
    const sortRect = sortNode?.getBoundingClientRect();
    return {
      background: html.backgroundColor,
      appWidth: appRect?.width || 0,
      tabsBorderRadius: parseFloat(getComputedStyle(tabs).borderRadius || "0"),
      cardBorderRadius: parseFloat(getComputedStyle(card).borderRadius || "0"),
      gridColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
      controlColumns: getComputedStyle(controls).gridTemplateColumns.split(" ").filter(Boolean).length,
      toolsPosition: getComputedStyle(toolsNode).position,
      healthParentClass: health?.parentElement?.className || "",
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
      searchTop: searchRect?.top || 0,
      sortTop: sortRect?.top || 0,
      searchHeight: searchRect?.height || 0,
      sortHeight: sortRect?.height || 0
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
  expect(Math.abs(shell.searchTop - shell.sortTop)).toBeLessThan(2);
  expect(shell.searchHeight).toBeGreaterThanOrEqual(44);
  expect(shell.searchHeight).toBeLessThanOrEqual(52);
  expect(shell.sortHeight).toBeGreaterThanOrEqual(44);
  expect(shell.sortHeight).toBeLessThanOrEqual(52);

  const metadata = firstMovie.locator(".movie-meta");
  if (await metadata.count()) {
    await expect(metadata).toHaveAttribute("data-metro-decorated", "true");
  }

  await page.evaluate(() => {
    const button = document.querySelector("#refreshButton");
    if (!button) return;
    button.disabled = false;
    window.__metroRefreshClicks = 0;
    button.addEventListener("click", event => {
      window.__metroRefreshClicks += 1;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
  await page.locator("#dataHealth > summary").click();
  await expect(page.locator("#dataHealth")).toHaveJSProperty("open", true);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__metroRefreshClicks || 0)).toBe(0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  await expect(page.locator(".home-library-filter-options")).toBeVisible();
});
