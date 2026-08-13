import { test, expect } from "@playwright/test";

test("mobile release smoke keeps the movie-first comparison flow usable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator('[data-tab="now"]')).toBeVisible();
  await expect(page.locator('[data-tab="coming"]')).toBeVisible();
  await expect(page.locator("#movieGrid")).toBeVisible();

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await expect(firstMovie).toHaveAttribute("data-phase8a-direct-compare", "true", { timeout: 10_000 });

  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(overlay.locator(".provider-compare-sheet")).toBeVisible();
  await expect(overlay.locator(".provider-compare-close")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/provider-compare-open/);
  await expect(page.locator("#providerCompareContent")).toBeVisible();

  await overlay.locator(".provider-compare-close").click();
  await expect(overlay).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/provider-compare-open/);
  await expect(firstMovie).toBeVisible();

  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("home tabs remain interactive on the mobile viewport", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const now = page.locator('[data-tab="now"]');
  const coming = page.locator('[data-tab="coming"]');

  await expect(now).toHaveClass(/active/);
  await coming.click();
  await expect(coming).toHaveClass(/active/);
  await expect(now).not.toHaveClass(/active/);

  await now.click();
  await expect(now).toHaveClass(/active/);
  await expect(page.locator("#movieGrid")).toBeVisible();
});

test("Metro filter dropdown stays anchored without moving neighboring matrix tiles", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  const filterToggle = overlay.locator("[data-provider-filter-toggle]");
  await expect(filterToggle).toBeVisible({ timeout: 12_000 });
  if ((await filterToggle.getAttribute("aria-expanded")) !== "true") await filterToggle.click();

  const controls = overlay.locator(".phase8c-controls");
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute("data-phase9b3-compact", "true", { timeout: 5_000 });

  const provider = controls.locator('[data-phase9b3-group="provider"]');
  const language = controls.locator('[data-phase9b3-group="language"]');
  await expect(provider).toBeVisible();
  await expect(language).toBeVisible();

  const beforeProvider = await provider.boundingBox();
  const beforeLanguage = await language.boundingBox();
  await provider.locator("[data-phase9b3-group-toggle]").click();

  const body = provider.locator(".phase9b3-filter-group-body");
  await expect(body).toBeVisible();
  const bodyStyle = await body.evaluate(element => {
    const style = getComputedStyle(element);
    return { position: style.position, zIndex: style.zIndex };
  });
  expect(bodyStyle.position).toBe("absolute");
  expect(Number(bodyStyle.zIndex)).toBeGreaterThan(1);

  const afterProvider = await provider.boundingBox();
  const afterLanguage = await language.boundingBox();
  expect(Math.abs((afterProvider?.x || 0) - (beforeProvider?.x || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((afterProvider?.y || 0) - (beforeProvider?.y || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((afterLanguage?.x || 0) - (beforeLanguage?.x || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((afterLanguage?.y || 0) - (beforeLanguage?.y || 0))).toBeLessThanOrEqual(1);

  const firstOption = body.locator("button").first();
  await expect(firstOption).toBeVisible();
  await firstOption.click();
  await expect(body).toBeHidden();
});

test("deterministic Metro seat-map smoke keeps the full-screen lifecycle usable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");

  const opened = await page.evaluate(async () => {
    const model = {
      kind: "seat-map",
      provider: { id: "broadway" },
      layoutMode: "grid",
      screenLabel: "銀幕",
      showtime: {
        date: "2026-08-12",
        time: "19:30",
        cinema: { name: { display: "M6 Gate Test Cinema" } },
        house: { name: "House 1" },
        metadata: { formats: ["2D"], languages: ["粵語"], subtitles: ["中文字幕"] }
      },
      summary: { available: 3, total: 4 },
      sections: [{
        name: "House 1",
        rows: [{
          label: "A",
          cells: [
            { kind: "seat", seat: { id: "A1", label: "A1", row: "A", column: 1, status: "available", type: "standard" } },
            { kind: "seat", seat: { id: "A2", label: "A2", row: "A", column: 2, status: "available", type: "standard" } },
            { kind: "seat", seat: { id: "A3", label: "A3", row: "A", column: 3, status: "available", type: "standard" } },
            { kind: "seat", seat: { id: "A4", label: "A4", row: "A", column: 4, status: "sold", type: "standard" } }
          ]
        }]
      }],
      notices: []
    };

    return window.HKCinemaSeatMapShared.open({
      provider: "broadway",
      key: "m6-expansion-gate",
      showtime: model.showtime,
      load: async () => ({}),
      adapt: () => model
    });
  });

  expect(opened).toBe(true);
  const overlay = page.locator("#sharedSeatMapOverlay");
  await expect(overlay).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/seatmap-open/);
  await expect(overlay.locator('.shared-seatmap-content[data-seatmap-provider="broadway"]')).toBeVisible();
  await expect(overlay.locator(".shared-seatmap-grid")).toBeVisible();
  await expect(overlay.locator(".shared-seat.status-available")).toHaveCount(3);
  await expect(overlay.locator(".shared-seat.status-sold")).toHaveCount(1);

  const sheetGeometry = await overlay.locator(".shared-seatmap-sheet").evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(sheetGeometry.scrollWidth).toBeLessThanOrEqual(sheetGeometry.clientWidth + 1);

  const close = overlay.locator(".shared-seatmap-close");
  const closeBox = await close.boundingBox();
  expect(closeBox?.width || 0).toBeGreaterThanOrEqual(40);
  expect(closeBox?.height || 0).toBeGreaterThanOrEqual(40);

  await close.click();
  await expect(overlay).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/seatmap-open/);
});

test("Classic mobile polish stays inside the viewport and keeps key touch targets usable", async ({ page }) => {
  await page.goto("/?skin=classic", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "classic");

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });

  const homeGeometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(homeGeometry.scrollWidth).toBeLessThanOrEqual(homeGeometry.clientWidth + 1);

  const tabBox = await page.locator('[data-tab="now"]').boundingBox();
  expect(tabBox?.height || 0).toBeGreaterThanOrEqual(40);

  await firstMovie.click();
  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });

  const sheet = overlay.locator(".provider-compare-sheet");
  const sheetGeometry = await sheet.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(sheetGeometry.scrollWidth).toBeLessThanOrEqual(sheetGeometry.clientWidth + 1);

  const closeBox = await overlay.locator(".provider-compare-close").boundingBox();
  expect(closeBox?.width || 0).toBeGreaterThanOrEqual(40);
  expect(closeBox?.height || 0).toBeGreaterThanOrEqual(40);
});

test("selected date stays legible, date rail pins, and filters use one-open compact groups", async ({ page }) => {
  await page.goto("/?skin=classic", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "classic");

  const firstMovie = page.locator("#movieGrid .movie-card:not(.movie-group-member)").first();
  await expect(firstMovie).toBeVisible({ timeout: 30_000 });
  await firstMovie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  const sheet = overlay.locator(".provider-compare-sheet");
  const rail = overlay.locator(".provider-compare-date-rail");
  const activeDate = rail.locator(".provider-compare-date.active");

  await expect(activeDate).toBeVisible({ timeout: 30_000 });
  const activeStyle = await activeDate.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(activeStyle.background).not.toBe("rgb(255, 255, 255)");
  expect(activeStyle.background).not.toBe(activeStyle.color);

  await expect(rail.locator(".provider-compare-date-label")).toBeHidden();
  const stickyStyle = await rail.evaluate(element => {
    const style = getComputedStyle(element);
    return { position: style.position, top: style.top };
  });
  expect(stickyStyle.position).toBe("sticky");
  expect(stickyStyle.top).toBe("0px");

  const scrollRange = await sheet.evaluate(element => element.scrollHeight - element.clientHeight);
  if (scrollRange > 180) {
    await sheet.evaluate(element => { element.scrollTop = Math.min(element.scrollHeight, element.scrollTop + 900); });
    await page.waitForTimeout(100);
    const [sheetBox, railBox] = await Promise.all([sheet.boundingBox(), rail.boundingBox()]);
    expect(Math.abs((railBox?.y || 0) - (sheetBox?.y || 0))).toBeLessThanOrEqual(2);
  }

  const filterToggle = overlay.locator("[data-provider-filter-toggle]");
  await expect(filterToggle).toBeVisible({ timeout: 12_000 });
  if ((await filterToggle.getAttribute("aria-expanded")) !== "true") await filterToggle.click();

  const controls = overlay.locator(".phase8c-controls");
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute("data-phase9b3-compact", "true", { timeout: 5_000 });
  const summaries = controls.locator("[data-phase9b3-group-toggle]");
  expect(await summaries.count()).toBeGreaterThanOrEqual(6);

  await summaries.nth(0).click();
  await expect(summaries.nth(0)).toHaveAttribute("aria-expanded", "true");
  expect(await controls.locator(".phase9b3-filter-group-body:not([hidden])").count()).toBe(1);

  await summaries.nth(1).click();
  await expect(summaries.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(summaries.nth(1)).toHaveAttribute("aria-expanded", "true");
  expect(await controls.locator(".phase9b3-filter-group-body:not([hidden])").count()).toBe(1);
});