import { test, expect } from "@playwright/test";

test("final Classic homepage puts movie tabs first and relocates data health beside library filters", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });

  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".topbar-brand")).toBeHidden();
  await expect(page.locator("#refreshButton")).toBeHidden();
  await expect(page.locator(".section-heading")).toBeHidden();

  const health = page.locator("#dataHealth");
  await expect(health).toBeVisible({ timeout: 15_000 });
  await expect(health).toHaveAttribute("data-phase10r3a-home-health", "true");

  const geometry = await page.evaluate(() => {
    const tabs = document.querySelector(".tabs")?.getBoundingClientRect();
    const tools = document.querySelector("#homeLibraryTools")?.getBoundingClientRect();
    const filters = document.querySelector(".home-library-filter-options")?.getBoundingClientRect();
    const panel = document.querySelector("#dataHealth")?.getBoundingClientRect();
    const heading = document.querySelector("#dataHealth .data-health-heading");
    const style = heading ? getComputedStyle(heading) : null;
    return {
      healthParent: document.querySelector("#dataHealth")?.parentElement?.id || null,
      tabsTop: tabs?.top ?? null,
      toolsTop: tools?.top ?? null,
      filterCenter: filters ? filters.top + filters.height / 2 : null,
      panelCenter: panel ? panel.top + panel.height / 2 : null,
      rightGap: tools && panel ? tools.right - panel.right : null,
      boxShadow: style?.boxShadow || "",
      borderRadius: parseFloat(style?.borderRadius || "0")
    };
  });

  expect(geometry.healthParent).toBe("homeLibraryTools");
  expect(geometry.tabsTop).toBeLessThan(geometry.toolsTop);
  expect(Math.abs(geometry.filterCenter - geometry.panelCenter)).toBeLessThanOrEqual(4);
  expect(geometry.rightGap).toBeLessThanOrEqual(12);
  expect(geometry.boxShadow).toBe("none");
  expect(geometry.borderRadius).toBeLessThanOrEqual(10);

  await expect(page.locator('[data-classic-final-tab-count="now"]')).toHaveText(/^\d+$/, { timeout: 15_000 });
  await expect(page.locator('[data-classic-final-tab-count="coming"]')).toHaveText(/^\d+$/, { timeout: 15_000 });
});

test("final Classic comparison uses full-width date rail and keeps the selected date visible after rerender", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-timeline")).toBeVisible({ timeout: 30_000 });

  await expect(overlay.locator(".provider-compare-date-label")).toBeHidden();
  const railGeometry = await overlay.locator(".provider-compare-date-rail").evaluate(rail => {
    const scroller = rail.querySelector(".provider-compare-dates");
    const railRect = rail.getBoundingClientRect();
    const scrollerRect = scroller?.getBoundingClientRect();
    return {
      rightGap: railRect.right - (scrollerRect?.right || railRect.left),
      scrollerWidth: scrollerRect?.width || 0,
      railWidth: railRect.width
    };
  });
  expect(railGeometry.rightGap).toBeLessThan(20);
  expect(railGeometry.scrollerWidth).toBeGreaterThan(railGeometry.railWidth * 0.85);

  const dateCount = await overlay.locator("[data-provider-compare-date]").count();
  expect(dateCount).toBeGreaterThan(1);
  await page.evaluate(() => {
    const rail = document.querySelector("#providerCompareOverlay .provider-compare-date-rail");
    const buttons = Array.from(rail?.querySelectorAll("[data-provider-compare-date]") || []);
    if (!rail || buttons.length < 2) return;
    buttons.forEach(button => button.classList.remove("active"));
    const target = buttons.at(-1);
    target.classList.add("active");
    window.__phase10r3aTestDate = target.dataset.providerCompareDate;
    rail.replaceWith(rail.cloneNode(true));
  });

  await page.waitForTimeout(120);
  const selectedGeometry = await page.evaluate(() => {
    const scroller = document.querySelector("#providerCompareOverlay .provider-compare-dates");
    const selected = scroller?.querySelector(`.provider-compare-date.active[data-provider-compare-date="${window.__phase10r3aTestDate}"]`);
    const scrollerRect = scroller?.getBoundingClientRect();
    const selectedRect = selected?.getBoundingClientRect();
    return {
      selectedDate: selected?.dataset.providerCompareDate || null,
      expectedDate: window.__phase10r3aTestDate || null,
      left: selectedRect?.left ?? null,
      right: selectedRect?.right ?? null,
      viewportLeft: scrollerRect?.left ?? null,
      viewportRight: scrollerRect?.right ?? null
    };
  });
  expect(selectedGeometry.selectedDate).toBe(selectedGeometry.expectedDate);
  expect(selectedGeometry.left).toBeGreaterThanOrEqual(selectedGeometry.viewportLeft - 2);
  expect(selectedGeometry.right).toBeLessThanOrEqual(selectedGeometry.viewportRight + 2);

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
