import { test, expect } from "@playwright/test";

function seatModel(columns = 18) {
  return {
    kind: "seat-map",
    provider: { id: "broadway" },
    layoutMode: "grid",
    screenLabel: "銀幕",
    showtime: {
      date: "2026-08-15",
      time: "20:00",
      cinema: { name: { display: "M9F2 Audit Cinema" } },
      house: { name: "House 2" },
      metadata: { formats: ["2D"], languages: ["粵語"], subtitles: ["中文字幕"] }
    },
    summary: { available: columns, total: columns },
    sections: [{
      name: "House 2",
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

test("M9F2 reveals the real seat map after the loading skeleton without changing seat-map ownership", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");

  await page.evaluate(model => {
    window.__m9f2SeatOpen = window.HKCinemaSeatMapShared.open({
      provider: "broadway",
      key: "m9f2-loaded-seat-map",
      showtime: model.showtime,
      load: () => new Promise(resolve => window.setTimeout(() => resolve({}), 650)),
      adapt: () => model
    });
  }, seatModel());

  const overlay = page.locator("#sharedSeatMapOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".m9b-seatmap-skeleton")).toBeVisible();
  await expect(overlay.locator(".shared-seatmap-header")).toBeVisible();

  const loaded = overlay.locator('.shared-seatmap-content[data-m9f2-loaded="true"]');
  await expect(loaded).toBeVisible({ timeout: 4_000 });
  await expect(overlay.locator(".m9b-seatmap-skeleton")).toHaveCount(0);

  const state = await page.evaluate(() => window.HKCinemaM9F2LoadedSurfaces.getState());
  expect(state.seatmapReveals).toBeGreaterThanOrEqual(1);

  await overlay.locator("[data-seatmap-close]").last().click();
  await expect(overlay).toBeHidden();
});

test("M9F2 PWA notice uses owner hidden state and creates only a passive exit after-image", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const notice = page.locator("#pwaNotice");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute("data-m9f2-visible", "true");

  await page.evaluate(() => {
    document.querySelector("#pwaNotice").hidden = true;
  });

  await expect(notice).toBeHidden();
  await page.waitForFunction(() => window.HKCinemaM9F2LoadedSurfaces?.getState?.().pwaExitGhosts >= 1);
  const state = await page.evaluate(() => window.HKCinemaM9F2LoadedSurfaces.getState());
  expect(state.pwaEntries).toBeGreaterThanOrEqual(1);
  expect(state.pwaExitGhosts).toBeGreaterThanOrEqual(1);
});

test("M9F2 cinema portal opens normally, exits passively and leaves no stale interactive portal", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const select = document.createElement("select");
    select.dataset.insightCinema = "true";
    select.style.position = "fixed";
    select.style.left = "20px";
    select.style.top = "80px";
    select.style.width = "240px";
    select.innerHTML = '<option value="all">全部戲院</option><option value="audit">Audit Cinema</option>';
    document.body.appendChild(select);
    select.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 21,
      clientX: 30,
      clientY: 90
    }));
  });

  const portal = page.locator("#providerCompareCinemaPortal");
  await expect(portal).toBeVisible();
  await expect(portal).toHaveAttribute("data-m9f2-entered", "true");

  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 22,
      clientX: 380,
      clientY: 700
    }));
  });

  await expect(portal).toHaveCount(0);
  await page.waitForFunction(() => window.HKCinemaM9F2LoadedSurfaces?.getState?.().portalExitGhosts >= 1);
  const state = await page.evaluate(() => window.HKCinemaM9F2LoadedSurfaces.getState());
  expect(state.portalEntries).toBeGreaterThanOrEqual(1);
  expect(state.portalExitGhosts).toBeGreaterThanOrEqual(1);
});

test("M9F2 reduced-motion mode suppresses loaded-surface after-images", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator("#pwaNotice")).toBeVisible();
  await page.evaluate(() => {
    document.querySelector("#pwaNotice").hidden = true;
  });
  await page.waitForTimeout(50);

  const state = await page.evaluate(() => window.HKCinemaM9F2LoadedSurfaces.getState());
  expect(state.reducedMotion).toBe(true);
  expect(state.exitGhosts).toBe(0);
  expect(state.pwaExitGhosts).toBe(0);
});
