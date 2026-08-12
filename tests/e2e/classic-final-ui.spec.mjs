import { test, expect } from "@playwright/test";

const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
const CLASSIC_MOVIE = {
  id: "broadway:1059",
  provider: "broadway",
  sourceId: "1059",
  movieKey: null,
  title: {
    zh: "KATSEYE: WILD HEARTS (2026)",
    en: "KATSEYE: WILD HEARTS (2026)"
  },
  releaseDate: "2026-08-12",
  status: "now-showing",
  durationMinutes: 84,
  category: "IIA",
  rating: "IIA",
  language: ["英文"],
  subtitles: ["中文"],
  director: ["Nadia Hallgren"],
  cast: ["KATSEYE"],
  poster: null,
  trailer: null,
  formats: ["Music"]
};
const CLASSIC_DATES = ["2026-08-12", "2026-08-13"];

function classicShowsPayload(selectedDate) {
  const date = CLASSIC_DATES.includes(selectedDate) ? selectedDate : CLASSIC_DATES[0];
  return {
    ok: true,
    data: {
      movie: {
        id: CLASSIC_MOVIE.id,
        provider: CLASSIC_MOVIE.provider,
        sourceId: CLASSIC_MOVIE.sourceId,
        title: CLASSIC_MOVIE.title,
        releaseDate: CLASSIC_MOVIE.releaseDate,
        durationMinutes: CLASSIC_MOVIE.durationMinutes,
        rating: CLASSIC_MOVIE.rating,
        language: "英文",
        subtitles: ["中文"],
        director: CLASSIC_MOVIE.director,
        cast: CLASSIC_MOVIE.cast,
        description: null,
        poster: null,
        trailer: null
      },
      availableDates: CLASSIC_DATES,
      selectedDate: date,
      sessions: [{
        id: `broadway:test-${date}`,
        provider: "broadway",
        sourceId: `test-${date}`,
        movieId: CLASSIC_MOVIE.id,
        cinemaId: "broadway:1",
        cinema: {
          id: "broadway:1",
          provider: "broadway",
          sourceId: "1",
          name: {
            zh: "MOViE MOViE Pacific Place (金鐘)",
            en: "MOViE MOViE Pacific Place (Admiralty)"
          }
        },
        house: { id: "6", name: "5院" },
        startAt: `${date}T19:40:00+08:00`,
        date,
        time: "19:40",
        format: null,
        language: "英文",
        subtitles: ["中文"],
        bookingUrl: "https://www.cinema.com.hk/",
        price: {
          currency: "HKD",
          adult: 130,
          display: 130,
          lowest: 130,
          serviceFee: 0,
          ticketTypes: [],
          updatedAt: "2026-08-12T00:00:00.000Z"
        },
        seatSummary: {
          total: 100,
          available: 40,
          unavailable: 60,
          held: 0,
          sold: 60,
          blocked: 0,
          accessibleAvailable: 0,
          occupancy: 0.6,
          source: "provider-summary",
          updatedAt: "2026-08-12T00:00:00.000Z"
        }
      }]
    },
    meta: {
      provider: "broadway",
      updatedAt: "2026-08-12T00:00:00.000Z"
    }
  };
}

async function installClassicUiApiFixture(page) {
  await page.route(`${API_BASE}/**`, async route => {
    const url = new URL(route.request().url());
    let payload = null;

    if (url.pathname === "/api/broadway/movies") {
      payload = {
        ok: true,
        data: [CLASSIC_MOVIE],
        meta: { provider: "broadway", updatedAt: "2026-08-12T00:00:00.000Z" }
      };
    } else if (url.pathname === "/api/broadway/upcoming") {
      payload = {
        ok: true,
        data: [],
        meta: { provider: "broadway", updatedAt: "2026-08-12T00:00:00.000Z" }
      };
    } else if (url.pathname === "/api/broadway/movies/1059/shows") {
      payload = classicShowsPayload(url.searchParams.get("date"));
    }

    if (payload) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }

    // These are presentation smoke tests. Keep unrelated live providers from
    // turning layout assertions into upstream-availability checks; the release
    // workflows exercise provider live gates separately.
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "provider unavailable in deterministic Classic UI fixture" }
      })
    });
  });
}

async function openComparisonWithMultipleDates(page) {
  const movies = page.locator("#movieGrid .movie-card:not(.movie-group-member)");
  await expect(movies.first()).toBeVisible({ timeout: 30_000 });

  const overlay = page.locator("#providerCompareOverlay");
  const candidateCount = Math.min(await movies.count(), 12);

  for (let index = 0; index < candidateCount; index += 1) {
    await movies.nth(index).click();
    await expect(overlay).toBeVisible({ timeout: 12_000 });
    await expect(overlay.locator(".provider-compare-timeline")).toBeVisible({ timeout: 30_000 });

    const dates = overlay.locator("[data-provider-compare-date]");
    await expect(dates.first()).toBeVisible({ timeout: 10_000 });

    let dateCount = await dates.count();
    if (dateCount < 2) {
      try {
        await expect.poll(() => dates.count(), {
          timeout: 2_500,
          intervals: [250, 500, 1_000]
        }).toBeGreaterThan(1);
      } catch {
        // A genuine single-date movie is not a test failure; try the next candidate.
      }
      dateCount = await dates.count();
    }

    if (dateCount > 1) return overlay;

    await overlay.locator(".provider-compare-close").click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });
  }

  throw new Error(`No movie with at least two comparison dates found among ${candidateCount} fixture candidates`);
}

test.beforeEach(async ({ page }) => {
  await installClassicUiApiFixture(page);
});

test("final Classic homepage puts movie tabs first and relocates data health beneath sort", async ({ page }) => {
  await page.goto("/?skin=classic", { waitUntil: "domcontentloaded" });

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
    const sort = document.querySelector(".home-movie-sort")?.getBoundingClientRect();
    const summary = document.querySelector(".home-library-footer")?.getBoundingClientRect();
    const panel = document.querySelector("#dataHealth")?.getBoundingClientRect();
    const heading = document.querySelector("#dataHealth .data-health-heading");
    const style = heading ? getComputedStyle(heading) : null;
    const verticalOverlap = filters && panel
      ? Math.max(0, Math.min(filters.bottom, panel.bottom) - Math.max(filters.top, panel.top))
      : 0;
    return {
      healthParent: document.querySelector("#dataHealth")?.parentElement?.id || null,
      tabsTop: tabs?.top ?? null,
      toolsTop: tools?.top ?? null,
      filterHeight: filters?.height ?? 0,
      panelHeight: panel?.height ?? 0,
      verticalOverlap,
      filterRight: filters?.right ?? null,
      sortLeft: sort?.left ?? null,
      sortRight: sort?.right ?? null,
      sortBottom: sort?.bottom ?? null,
      healthLeft: panel?.left ?? null,
      healthRight: panel?.right ?? null,
      healthTop: panel?.top ?? null,
      healthBottom: panel?.bottom ?? null,
      healthCenter: panel ? (panel.left + panel.right) / 2 : null,
      sortCenter: sort ? (sort.left + sort.right) / 2 : null,
      summaryTop: summary?.top ?? null,
      boxShadow: style?.boxShadow || "",
      borderRadius: parseFloat(style?.borderRadius || "0")
    };
  });

  expect(geometry.healthParent).toBe("homeLibraryTools");
  expect(geometry.tabsTop).toBeLessThan(geometry.toolsTop);
  expect(geometry.verticalOverlap).toBeGreaterThanOrEqual(Math.min(geometry.filterHeight, geometry.panelHeight) * 0.5);
  expect(geometry.healthTop).toBeGreaterThanOrEqual(geometry.sortBottom + 2);
  expect(geometry.healthLeft).toBeGreaterThanOrEqual(geometry.filterRight + 2);
  expect(geometry.healthLeft).toBeGreaterThanOrEqual(geometry.sortLeft - 4);
  expect(geometry.healthRight).toBeLessThanOrEqual(geometry.sortRight + 4);
  expect(geometry.healthCenter).toBeGreaterThan(geometry.sortLeft);
  expect(geometry.healthCenter).toBeLessThan(geometry.sortRight);
  expect(Math.abs(geometry.healthCenter - geometry.sortCenter)).toBeLessThanOrEqual(4);
  expect(geometry.healthBottom).toBeLessThanOrEqual(geometry.summaryTop);
  expect(geometry.boxShadow).toBe("none");
  expect(geometry.borderRadius).toBeLessThanOrEqual(10);

  await expect(page.locator('[data-classic-final-tab-count="now"]')).toHaveText(/^\d+$/, { timeout: 15_000 });
  await expect(page.locator('[data-classic-final-tab-count="coming"]')).toHaveText(/^\d+$/, { timeout: 15_000 });
});

test("final Classic comparison uses full-width date rail and keeps the selected date visible after rerender", async ({ page }) => {
  await page.goto("/?skin=classic", { waitUntil: "domcontentloaded" });

  const overlay = await openComparisonWithMultipleDates(page);

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
