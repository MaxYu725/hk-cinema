import { test, expect } from "@playwright/test";

async function openComparison(page) {
  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await expect(firstMovie).toHaveAttribute("data-phase8a-direct-compare", "true", { timeout: 10_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-timeline")).toBeVisible({ timeout: 30_000 });
  return overlay;
}

async function relativeGeometry(overlay) {
  return overlay.evaluate(root => {
    const section = root.querySelector(".provider-compare-timeline-section");
    const date = section?.querySelector(".provider-compare-date-rail");
    const filter = section?.querySelector("[data-provider-insights]");
    const reset = section?.querySelector("[data-provider-compare-reset]");
    if (!section || !date || !filter || !reset) return null;

    const sectionTop = section.getBoundingClientRect().top;
    const relativeTop = node => Math.round((node.getBoundingClientRect().top - sectionTop) * 10) / 10;
    return {
      dateTop: relativeTop(date),
      filterTop: relativeTop(filter),
      resetTop: relativeTop(reset),
      dateHeight: Math.round(date.getBoundingClientRect().height * 10) / 10,
      filterHeight: Math.round(filter.getBoundingClientRect().height * 10) / 10,
      dateBeforeFilter: Boolean(date.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING)
    };
  });
}

test("M9E1 date refresh keeps date/filter/reset geometry stable and never paints raw Smart Picks white", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");

  const overlay = await openComparison(page);
  const dates = overlay.locator("[data-provider-compare-date]");
  const dateCount = await dates.count();
  expect(dateCount, "release comparison should expose at least two selectable dates").toBeGreaterThanOrEqual(2);

  const rawSmartPickStyle = await overlay.locator("#providerCompareContent").evaluate(root => {
    const panel = document.createElement("div");
    panel.className = "provider-compare-recommendations phase8d-smart-picks";
    panel.innerHTML = `
      <div class="provider-compare-recommendation-grid phase8d-smart-grid pick-count-1">
        <button class="provider-compare-recommendation phase8d-smart-pick cheapest">Test</button>
      </div>
    `;
    root.append(panel);
    const card = panel.querySelector(".phase8d-smart-pick");
    const result = {
      panelBackground: getComputedStyle(panel).backgroundColor,
      panelRadius: getComputedStyle(panel).borderRadius,
      cardBackground: getComputedStyle(card).backgroundColor,
      cardRadius: getComputedStyle(card).borderRadius
    };
    panel.remove();
    return result;
  });

  expect(rawSmartPickStyle.panelBackground).not.toBe("rgb(255, 255, 255)");
  expect(rawSmartPickStyle.cardBackground).not.toBe("rgb(247, 248, 249)");
  expect(rawSmartPickStyle.panelRadius).toBe("0px");
  expect(rawSmartPickStyle.cardRadius).toBe("0px");

  const before = await relativeGeometry(overlay);
  expect(before).not.toBeNull();
  expect(before.dateBeforeFilter).toBe(true);

  const targetIndex = await dates.evaluateAll(nodes => nodes.findIndex(node => !node.classList.contains("active")));
  expect(targetIndex, "a non-active comparison date is required").toBeGreaterThanOrEqual(0);
  const targetDate = dates.nth(targetIndex);

  // Hold only the post-open Worker requests long enough to inspect the in-flight layout.
  await page.route(/https:\/\/hk-cinema-api\.max-yu-jp\.workers\.dev\/.*/, async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.continue();
  });

  await targetDate.click();

  const staleSection = overlay.locator(".provider-compare-timeline-section.m9b-date-loading");
  await expect(staleSection).toBeVisible({ timeout: 2_000 });
  await expect(targetDate).toHaveClass(/active/);

  const busyStatus = staleSection.locator(".m9b-local-loading-bar");
  await expect(busyStatus).toHaveCount(1);
  const busyVisual = await busyStatus.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      width: style.width,
      height: style.height,
      overflow: style.overflow,
      clipPath: style.clipPath,
      position: style.position
    };
  });
  expect(busyVisual.width).toBe("1px");
  expect(busyVisual.height).toBe("1px");
  expect(busyVisual.overflow).toBe("hidden");
  expect(busyVisual.position).toBe("absolute");

  const after = await relativeGeometry(overlay);
  expect(after).not.toBeNull();
  expect(after.dateBeforeFilter).toBe(true);
  expect(Math.abs(after.dateTop - before.dateTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.filterTop - before.filterTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.resetTop - before.resetTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.dateHeight - before.dateHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.filterHeight - before.filterHeight)).toBeLessThanOrEqual(1);

  await expect(staleSection).toBeHidden({ timeout: 30_000 });
  await expect(overlay.locator(".provider-compare-timeline")).toBeVisible();
  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
