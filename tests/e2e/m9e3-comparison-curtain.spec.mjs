import { test, expect } from "@playwright/test";

async function openComparison(page) {
  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await expect(firstMovie).toHaveAttribute("data-phase8a-direct-compare", "true", { timeout: 10_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-timeline")).toBeVisible({ timeout: 30_000 });
  await expect(overlay.locator("[data-provider-insights]")).toBeVisible({ timeout: 10_000 });
  return overlay;
}

test("M9E3 keeps date refresh behind an opaque curtain until decorated results settle", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");

  const overlay = await openComparison(page);
  const content = overlay.locator("#providerCompareContent");
  const dates = overlay.locator("[data-provider-compare-date]");
  const dateCount = await dates.count();
  expect(dateCount).toBeGreaterThanOrEqual(2);

  const targetIndex = await dates.evaluateAll(nodes => nodes.findIndex(node => !node.classList.contains("active")));
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const targetDate = dates.nth(targetIndex);

  await page.route(/https:\/\/hk-cinema-api\.max-yu-jp\.workers\.dev\/.*/, async route => {
    await new Promise(resolve => setTimeout(resolve, 900));
    await route.continue();
  });

  await targetDate.click();
  await expect(content).toHaveAttribute("data-m9e3-curtain", "active", { timeout: 2_000 });
  await expect(content).toHaveAttribute("aria-busy", "true");

  const curtainVisual = await content.evaluate(root => {
    const hero = root.querySelector(":scope > .provider-compare-hero");
    const style = getComputedStyle(root, "::after");
    return {
      position: style.position,
      background: style.backgroundColor,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      top: Number.parseFloat(style.top),
      heroBottom: hero ? hero.offsetTop + hero.offsetHeight : 0,
      label: style.content
    };
  });

  expect(curtainVisual.position).toBe("absolute");
  expect(curtainVisual.background).toBe("rgb(0, 0, 0)");
  expect(curtainVisual.opacity).toBe(1);
  expect(curtainVisual.pointerEvents).toBe("auto");
  expect(curtainVisual.top).toBeGreaterThanOrEqual(curtainVisual.heroBottom);
  expect(curtainVisual.label).toContain("更新");

  // The old live timeline remains in flow behind the curtain while the delayed request runs.
  const staleSection = overlay.locator(".provider-compare-timeline-section.m9b-date-loading");
  await expect(staleSection).toBeVisible({ timeout: 2_000 });
  await expect(content).toHaveAttribute("data-m9e3-curtain", "active");

  // Reveal is allowed only after the real final structure is decorated and quiet.
  await expect(content).not.toHaveAttribute("data-m9e3-curtain", /.+/, { timeout: 30_000 });
  await expect(overlay.locator(".provider-compare-timeline-section.phase8b-timeline-section")).toBeVisible();
  await expect(overlay.locator("[data-provider-insights]")).toBeVisible();
  await expect(overlay.locator("[data-provider-compare-reset]")).toBeVisible();
  await expect(overlay.locator(".provider-compare-section-heading")).toBeVisible();
  await expect(overlay.locator(".provider-compare-timeline, .provider-compare-empty")).toBeVisible();

  const state = await page.evaluate(() => window.HKCinemaM9E3ComparisonCurtain?.getState?.());
  expect(state?.active).toBe(false);
  expect(state?.phase).toBe("idle");
  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
