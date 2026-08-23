import { test, expect } from "@playwright/test";

async function firstMovie(page) {
  const movie = page.locator("#movieGrid .movie-card").first();
  await expect(movie).toBeVisible({ timeout: 30_000 });
  await expect(movie).toHaveAttribute("data-phase8a-direct-compare", "true", { timeout: 10_000 });
  return movie;
}

function seatModel(columns = 30) {
  return {
    kind: "seat-map",
    provider: { id: "broadway" },
    layoutMode: "grid",
    screenLabel: "銀幕",
    showtime: {
      date: "2026-08-15",
      time: "19:30",
      cinema: { name: { display: "M9E Audit Cinema" } },
      house: { name: "House 1" },
      metadata: { formats: ["2D"], languages: ["粵語"], subtitles: ["中文字幕"] }
    },
    summary: { available: columns, total: columns },
    sections: [{
      name: "House 1",
      rows: [{
        label: "A",
        cells: Array.from({ length: columns }, (_, index) => ({
          kind: "seat",
          seat: {
            id: `A${index + 1}`,
            label: `A${index + 1}`,
            row: "A",
            column: index + 1,
            status: "available",
            type: "standard"
          }
        }))
      }]
    }],
    notices: []
  };
}

test("M9E rapid comparison close/reopen keeps one overlay and clears stale exit ghosts", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const movie = await firstMovie(page);
  const overlay = page.locator("#providerCompareOverlay");

  await movie.click();
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  await expect(page.locator("#providerCompareOverlay")).toHaveCount(1);

  for (let index = 0; index < 3; index += 1) {
    const closeState = await page.evaluate(() => {
      const root = document.querySelector("#providerCompareOverlay");
      root?.querySelector("[data-provider-compare-close]")?.click();
      return {
        hidden: Boolean(root?.hidden),
        bodyOpen: document.body.classList.contains("provider-compare-open"),
        exitGhosts: document.querySelectorAll(".m9c-exit-ghost").length
      };
    });

    expect(closeState.hidden).toBe(true);
    expect(closeState.bodyOpen).toBe(false);
    expect(closeState.exitGhosts).toBe(1);

    await movie.click();
    await expect(overlay).toBeVisible({ timeout: 12_000 });
    await expect(page.locator("#providerCompareOverlay")).toHaveCount(1);
    await expect(page.locator(".m9c-exit-ghost")).toHaveCount(0);
  }

  await overlay.locator(".provider-compare-close").click();
  await expect(overlay).toBeHidden();
  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("M9E slow seat-map load keeps header/loading state visible and close remains synchronous", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");

  await page.evaluate(model => {
    window.__m9eSeatOpen = window.HKCinemaSeatMapShared.open({
      provider: "broadway",
      key: "m9e-slow-seat-map",
      showtime: model.showtime,
      load: () => new Promise(resolve => window.setTimeout(() => resolve({}), 900)),
      adapt: () => model
    });
  }, seatModel());

  const overlay = page.locator("#sharedSeatMapOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".shared-seatmap-header")).toBeVisible();
  await expect(overlay.locator(".m9b-seatmap-skeleton")).toBeVisible();
  await expect(overlay.locator(".shared-seatmap-close")).toBeVisible();

  const closeState = await page.evaluate(() => {
    const root = document.querySelector("#sharedSeatMapOverlay");
    root?.querySelector("[data-seatmap-close]")?.click();
    return {
      hidden: Boolean(root?.hidden),
      bodyOpen: document.body.classList.contains("seatmap-open")
    };
  });

  expect(closeState.hidden).toBe(true);
  expect(closeState.bodyOpen).toBe(false);
  await expect(overlay).toBeHidden();
  await page.waitForTimeout(1000);
  await expect(overlay).toBeHidden();
});

test("M9E reduced-motion mode stays near-static and creates no exit after-images", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const movie = await firstMovie(page);
  await movie.click();

  const overlay = page.locator("#providerCompareOverlay");
  await expect(overlay).toBeVisible({ timeout: 12_000 });
  const sheetMotion = await overlay.locator(".provider-compare-sheet").evaluate(element => {
    const style = getComputedStyle(element);
    return { animationName: style.animationName, animationDuration: style.animationDuration };
  });
  expect(sheetMotion.animationName).toBe("none");

  const closeState = await page.evaluate(() => {
    const root = document.querySelector("#providerCompareOverlay");
    root?.querySelector("[data-provider-compare-close]")?.click();
    return {
      hidden: Boolean(root?.hidden),
      exitGhosts: document.querySelectorAll(".m9c-exit-ghost").length
    };
  });
  expect(closeState.hidden).toBe(true);
  expect(closeState.exitGhosts).toBe(0);
});
