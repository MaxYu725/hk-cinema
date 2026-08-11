import { test, expect } from "@playwright/test";

test("final Classic homepage centers flat data health and moves counts into tabs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });

  await expect(page.locator(".topbar-brand")).toBeHidden();
  await expect(page.locator("#refreshButton")).toBeHidden();
  await expect(page.locator(".section-heading")).toBeHidden();

  const health = page.locator("#dataHealth");
  await expect(health).toBeVisible({ timeout: 15_000 });
  const geometry = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const panel = document.querySelector("#dataHealth")?.getBoundingClientRect();
    const heading = document.querySelector("#dataHealth .data-health-heading");
    const style = heading ? getComputedStyle(heading) : null;
    return {
      topbarCenter: topbar ? topbar.left + topbar.width / 2 : 0,
      panelCenter: panel ? panel.left + panel.width / 2 : 0,
      boxShadow: style?.boxShadow || "",
      borderRadius: parseFloat(style?.borderRadius || "0")
    };
  });
  expect(Math.abs(geometry.topbarCenter - geometry.panelCenter)).toBeLessThanOrEqual(3);
  expect(geometry.boxShadow).toBe("none");
  expect(geometry.borderRadius).toBeLessThanOrEqual(10);

  await expect(page.locator('[data-classic-final-tab-count="now"]')).toHaveText(/^\d+$/, { timeout: 15_000 });
  await expect(page.locator('[data-classic-final-tab-count="coming"]')).toHaveText(/^\d+$/, { timeout: 15_000 });
});

test("final Classic comparison removes repeated UI and uses the 3-column filter matrix", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-timeline")).toBeVisible({ timeout: 30_000 });

  const repeatedMovieDetails = overlay.locator(".phase8b-movie-details");
  if (await repeatedMovieDetails.count()) await expect(repeatedMovieDetails).toBeHidden();

  const lazyNote = overlay.locator("[data-mcl-seat-lazy-note]");
  if (await lazyNote.count()) await expect(lazyNote).toBeHidden();

  const filterToggle = overlay.locator("[data-provider-filter-toggle]");
  await expect(filterToggle).toBeVisible();
  if ((await filterToggle.getAttribute("aria-expanded")) !== "true") await filterToggle.click();

  const controls = overlay.locator(".phase8c-controls");
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute("data-phase9b3-compact", "true", { timeout: 5_000 });

  const gridColumns = await controls.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
  expect(gridColumns).toBe(3);

  await expect(overlay.locator(".phase8c-active-filters")).toBeHidden();
  await expect(overlay.locator('[data-phase9b3-group="price"]')).toBeHidden();
  await expect(overlay.locator('[data-phase9b3-group="sort"]')).toBeHidden();

  const sort = overlay.locator("[data-classic-final-sort-select]");
  await expect(sort).toBeVisible({ timeout: 5_000 });
  await sort.selectOption("price");
  await expect(sort).toHaveValue("price");
});
