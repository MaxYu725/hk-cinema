import { expect, test } from "@playwright/test";

test("home toolbar crosses sticky boundary without compact-layout oscillation", async ({ page }) => {
  await page.goto("./");
  const tools = page.locator("#homeLibraryTools");
  await expect(tools).toBeVisible();

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.testScrollSpacer = "";
    spacer.style.height = "1600px";
    document.body.append(spacer);
  });

  const metrics = await tools.evaluate((element) => {
    let flowTop = 0;
    let node = element;
    while (node) {
      flowTop += Number(node.offsetTop) || 0;
      node = node.offsetParent;
    }
    const top = Number.parseFloat(getComputedStyle(element).top) || 8;
    const primaryHeight = element.querySelector(".home-library-primary")?.offsetHeight || 0;
    const enterBuffer = Math.max(64, element.offsetHeight - primaryHeight + 16);
    return { flowTop, top, enterBuffer };
  });

  const boundaryY = Math.max(0, metrics.flowTop - metrics.top + 12);
  await page.evaluate((y) => window.scrollTo(0, y), boundaryY);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await expect(tools).toHaveClass(/is-stuck/);
  await expect(tools).not.toHaveClass(/is-stuck-latched/);
  const boundaryDisplay = await tools.locator(".home-library-filter-options").evaluate((element) => getComputedStyle(element).display);
  expect(boundaryDisplay).toBe("flex");

  const latchedY = Math.max(0, metrics.flowTop - metrics.top + metrics.enterBuffer + 12);
  await page.evaluate((y) => window.scrollTo(0, y), latchedY);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(tools).toHaveClass(/is-stuck-latched/);

  const compactDisplay = await tools.locator(".home-library-filter-options").evaluate((element) => getComputedStyle(element).display);
  expect(compactDisplay).toBe("none");

  // A small upward correction like Chromium scroll anchoring must not expand the toolbar again.
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, latchedY - 48));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(tools).toHaveClass(/is-stuck-latched/);

  // It expands only after the user genuinely scrolls above the toolbar's natural position.
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, metrics.flowTop - metrics.top - 20));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(tools).not.toHaveClass(/is-stuck-latched/);
});
