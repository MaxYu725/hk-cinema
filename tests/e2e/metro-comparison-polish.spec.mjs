import { test, expect } from "@playwright/test";

test("Metro filter Pivot opens rich controls as full-width dark command groups", async ({ page }) => {
  await page.goto("/?skin=metro", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  const pivot = overlay.locator("[data-metro-comparison-pivot]");
  await expect(pivot).toBeVisible({ timeout: 30_000 });

  const filtersPivot = pivot.locator('[data-metro-comparison-pivot-tab="filters"]');
  await filtersPivot.click();

  const controls = overlay.locator(".phase8c-controls");
  await expect(controls).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator("[data-provider-filter-toggle]")).toHaveAttribute("aria-expanded", "true");

  const filterStyle = await overlay.locator("[data-provider-filter-toggle]").evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
      color: style.color
    };
  });
  expect(filterStyle.background).toBe("rgb(12, 12, 12)");
  expect(filterStyle.radius).toBe("0px");
  expect(filterStyle.color).toBe("rgb(255, 255, 255)");

  const providerGroup = controls.locator('[data-phase9b3-group="provider"]');
  const providerSummary = providerGroup.locator(".phase9b3-filter-group-summary");
  await expect(providerSummary).toBeVisible();
  const summaryStyle = await providerSummary.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const parentBox = element.parentElement.getBoundingClientRect();
    const label = element.querySelector(".phase9b3-filter-group-label");
    const value = element.querySelector(".phase9b3-filter-group-value");
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
      widthDelta: Math.abs(box.width - parentBox.width),
      labelColor: label ? getComputedStyle(label).color : "",
      valueColor: value ? getComputedStyle(value).color : ""
    };
  });
  expect(summaryStyle.background).toBe("rgb(13, 13, 13)");
  expect(summaryStyle.radius).toBe("0px");
  expect(summaryStyle.widthDelta).toBeLessThanOrEqual(1);
  expect(summaryStyle.labelColor).not.toBe("rgb(255, 255, 255)");
  expect(summaryStyle.valueColor).toBe("rgb(255, 255, 255)");

  await providerSummary.click();
  await expect(providerSummary).toHaveAttribute("aria-expanded", "true");
  const firstActive = providerGroup.locator(".phase9b3-filter-group-body button.active").first();
  await expect(firstActive).toBeVisible();
  const activeStyle = await firstActive.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      radius: style.borderRadius
    };
  });
  expect(activeStyle.background).not.toBe("rgb(255, 255, 255)");
  expect(activeStyle.color).toBe("rgb(255, 255, 255)");
  expect(activeStyle.radius).toBe("0px");

  const cinemaGroup = controls.locator('[data-phase9b3-group="cinema"]');
  const cinemaSummary = cinemaGroup.locator(".phase9b3-filter-group-summary");
  await expect(cinemaSummary).toBeVisible();
  const cinemaSummaryStyle = await cinemaSummary.evaluate(element => {
    const style = getComputedStyle(element);
    const value = element.querySelector(".phase9b3-filter-group-value");
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
      valueColor: value ? getComputedStyle(value).color : ""
    };
  });
  expect(cinemaSummaryStyle.background).toBe("rgb(13, 13, 13)");
  expect(cinemaSummaryStyle.radius).toBe("0px");
  expect(cinemaSummaryStyle.valueColor).toBe("rgb(255, 255, 255)");

  await cinemaSummary.click();
  const cinema = cinemaGroup.locator("[data-insight-cinema]");
  await expect(cinema).toBeVisible();
  const cinemaStyle = await cinema.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, radius: style.borderRadius };
  });
  expect(cinemaStyle.background).toBe("rgb(13, 13, 13)");
  expect(cinemaStyle.color).toBe("rgb(255, 255, 255)");
  expect(cinemaStyle.radius).toBe("0px");
});

test("Metro Smart Pick tiles cannot inherit the Classic light card surface", async ({ page }) => {
  await page.goto("/?skin=metro", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  const pivot = overlay.locator("[data-metro-comparison-pivot]");
  await expect(pivot).toBeVisible({ timeout: 30_000 });
  await pivot.locator('[data-metro-comparison-pivot-tab="picks"]').click();

  const root = overlay.locator("#providerCompareContent");
  await expect(root).toHaveAttribute("data-metro-comparison-active-pivot", "picks");

  const realPick = overlay.locator(".phase8d-smart-pick").first();
  if (await realPick.count()) {
    await expect(realPick).toBeVisible();
    const style = await realPick.evaluate(element => {
      const box = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const strong = element.querySelector("strong");
      return {
        background: computed.backgroundColor,
        radius: computed.borderRadius,
        height: box.height,
        strongColor: strong ? getComputedStyle(strong).color : ""
      };
    });
    expect(style.background).not.toBe("rgb(255, 255, 255)");
    expect(style.radius).toBe("0px");
    expect(style.height).toBeLessThan(260);
    expect(style.strongColor).toBe("rgb(255, 255, 255)");
  }
});
