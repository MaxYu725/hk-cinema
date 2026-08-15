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

async function installFrameSampler(page) {
  await page.evaluate(() => {
    window.__m9e2Frames = [];
    window.__m9e2Sampling = false;
    window.__m9e2SampleCount = 0;

    const sample = () => {
      if (window.__m9e2Sampling) {
        const root = document.querySelector("#providerCompareContent");
        const section = root?.querySelector(".provider-compare-timeline-section");
        const date = section?.querySelector(":scope > .provider-compare-date-rail");
        const filter = section?.querySelector(":scope > [data-provider-insights]");
        const reset = filter?.querySelector("[data-provider-compare-reset]");
        const heading = section?.querySelector(":scope > .provider-compare-section-heading");

        if (section && date && filter && reset) {
          const sectionTop = section.getBoundingClientRect().top;
          const top = node => Math.round((node.getBoundingClientRect().top - sectionTop) * 10) / 10;
          window.__m9e2Frames.push({
            missing: false,
            dateTop: top(date),
            filterTop: top(filter),
            resetTop: top(reset),
            headingTop: heading ? top(heading) : null,
            sectionLoading: section.classList.contains("m9b-date-loading"),
            filterAnimation: getComputedStyle(filter).animationName,
            filterTransition: getComputedStyle(filter).transitionDuration
          });
        } else {
          window.__m9e2Frames.push({
            missing: true,
            hasSection: Boolean(section),
            hasDate: Boolean(date),
            hasFilter: Boolean(filter),
            hasReset: Boolean(reset)
          });
        }
        window.__m9e2SampleCount += 1;
      }
      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
}

test("M9E2 date refresh never paints filter/reset above the date rail on any sampled frame", async ({ page }) => {
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
  expect(before.filterTop).toBeGreaterThan(before.dateTop);

  const targetIndex = await dates.evaluateAll(nodes => nodes.findIndex(node => !node.classList.contains("active")));
  expect(targetIndex, "a non-active comparison date is required").toBeGreaterThanOrEqual(0);
  const targetDate = dates.nth(targetIndex);

  await page.route(/https:\/\/hk-cinema-api\.max-yu-jp\.workers\.dev\/.*/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  });

  await installFrameSampler(page);
  await page.evaluate(() => { window.__m9e2Sampling = true; });
  await targetDate.click();

  const staleSection = overlay.locator(".provider-compare-timeline-section.m9b-date-loading");
  await expect(staleSection).toBeVisible({ timeout: 2_000 });
  await expect(targetDate).toHaveClass(/active/);

  const busyStatus = staleSection.locator(".m9b-local-loading-bar");
  await expect(busyStatus).toHaveCount(1);

  await page.waitForTimeout(700);
  const inFlightFrames = await page.evaluate(() => {
    window.__m9e2Sampling = false;
    return window.__m9e2Frames.slice();
  });

  expect(inFlightFrames.length, "must sample multiple painted frames during the delayed request").toBeGreaterThanOrEqual(8);
  const completeFrames = inFlightFrames.filter(frame => !frame.missing);
  expect(completeFrames.length, "date/filter/reset should remain present through the sampled loading window").toBe(inFlightFrames.length);

  for (const frame of completeFrames) {
    expect(frame.filterTop, `filter painted above date: ${JSON.stringify(frame)}`).toBeGreaterThan(frame.dateTop);
    expect(frame.resetTop, `reset painted above filter: ${JSON.stringify(frame)}`).toBeGreaterThanOrEqual(frame.filterTop);
    if (frame.headingTop !== null) {
      expect(frame.headingTop, `heading painted before filter: ${JSON.stringify(frame)}`).toBeGreaterThan(frame.filterTop);
    }
    if (frame.sectionLoading) {
      expect(frame.filterAnimation).toBe("none");
    }
  }

  const after = await relativeGeometry(overlay);
  expect(after).not.toBeNull();
  expect(after.filterTop).toBeGreaterThan(after.dateTop);
  expect(Math.abs(after.dateTop - before.dateTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.filterTop - before.filterTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.resetTop - before.resetTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.dateHeight - before.dateHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.filterHeight - before.filterHeight)).toBeLessThanOrEqual(1);

  await expect(staleSection).toBeHidden({ timeout: 30_000 });
  await expect(overlay.locator(".provider-compare-timeline")).toBeVisible();
  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
