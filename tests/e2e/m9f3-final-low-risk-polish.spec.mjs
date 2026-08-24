import { test, expect } from "@playwright/test";

const POSTER_DATA_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='60'%3E%3Crect width='40' height='60' fill='%23111111'/%3E%3C/svg%3E";

async function waitForHomeCatalogueSettled(page) {
  await expect(page.locator("#refreshButton")).toHaveAttribute("aria-busy", "false", {
    timeout: 20_000
  });
  await expect(page.locator("#movieGrid")).not.toHaveAttribute("data-home-state", "loading");
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function installSyntheticPoster(page, id) {
  await page.evaluate(testId => {
    const card = document.createElement("article");
    card.className = "movie-card";
    card.dataset.m9f3TestCard = testId;
    card.innerHTML = `<div class="movie-poster"><img data-m9f3-test-poster="${testId}" alt="M9F3 poster audit"></div>`;
    document.querySelector("#movieGrid")?.appendChild(card);
  }, id);
  return page.locator(`[data-m9f3-test-poster="${id}"]`);
}

test("M9F3 Data Health closes synchronously while a passive 140ms after-image finishes", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-skin", "metro");

  const panel = page.locator("#dataHealth");
  const summary = panel.locator(":scope > summary");
  await expect(summary).toBeVisible({ timeout: 12_000 });
  await panel.evaluate(element => { element.open = false; });
  await summary.click();
  await expect.poll(() => panel.evaluate(element => element.open)).toBe(true);
  await expect(panel.locator(":scope > .data-health-body")).toBeVisible();

  const closeState = await page.evaluate(() => {
    const panelElement = document.querySelector("#dataHealth");
    const outside = document.querySelector(".tabs");
    outside?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const ghost = document.querySelector(".m9f3-data-health-exit-ghost");
    return {
      open: Boolean(panelElement?.open),
      ghosts: document.querySelectorAll(".m9f3-data-health-exit-ghost").length,
      pointerEvents: ghost ? getComputedStyle(ghost).pointerEvents : null,
      ariaHidden: ghost?.getAttribute("aria-hidden") || null
    };
  });

  expect(closeState.open).toBe(false);
  expect(closeState.ghosts).toBe(1);
  expect(closeState.pointerEvents).toBe("none");
  expect(closeState.ariaHidden).toBe("true");
  await expect(page.locator(".m9f3-data-health-exit-ghost")).toHaveCount(0, { timeout: 1_000 });
  expect(pageErrors, `Unexpected browser errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("M9F3 lazy poster reveal stays opacity-only and does not animate cached geometry", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHomeCatalogueSettled(page);

  const poster = await installSyntheticPoster(page, "lazy");
  await expect(poster).toHaveClass(/m9f3-poster-media/);

  const pendingStyle = await poster.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      opacity: style.opacity,
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      transform: style.transform,
      filter: style.filter
    };
  });
  expect(Number(pendingStyle.opacity)).toBeCloseTo(0.7, 2);
  expect(pendingStyle.transitionProperty).toContain("opacity");
  expect(pendingStyle.transitionDuration).toContain("0.16s");
  expect(pendingStyle.transform).toBe("none");

  await poster.evaluate((element, src) => { element.src = src; }, POSTER_DATA_URL);
  await expect(poster).toHaveClass(/m9f3-poster-loaded/);
  await expect.poll(() => poster.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);

  const state = await page.evaluate(() => window.HKCinemaM9F3FinalPolish.getState());
  expect(state.posterDecorated).toBeGreaterThanOrEqual(1);
  expect(state.posterReveals).toBeGreaterThanOrEqual(1);
});

test("M9F3 final Pixel 7 reduced-motion/PWA audit remains static and lifecycle-neutral", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const platform = await page.evaluate(async () => {
    const manifest = await fetch(document.querySelector('link[rel="manifest"]').href).then(response => response.json());
    return {
      userAgent: navigator.userAgent,
      manifestDisplay: manifest.display,
      displayOverride: manifest.display_override,
      themeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
      hasPwaApi: Boolean(window.HKCinemaPWA),
      reducedMotion: window.HKCinemaM9F3FinalPolish?.getState?.().reducedMotion
    };
  });

  expect(platform.userAgent).toMatch(/Android/i);
  expect(platform.manifestDisplay).toBe("fullscreen");
  expect(platform.displayOverride.slice(0, 2)).toEqual(["fullscreen", "standalone"]);
  expect(platform.themeColor).toBe("#000000");
  expect(platform.hasPwaApi).toBe(true);
  expect(platform.reducedMotion).toBe(true);

  await waitForHomeCatalogueSettled(page);
  const poster = await installSyntheticPoster(page, "reduced");
  await expect(poster).toHaveClass(/m9f3-poster-loaded/);
  const posterStyle = await poster.evaluate(element => {
    const style = getComputedStyle(element);
    return { opacity: style.opacity, transitionDuration: style.transitionDuration };
  });
  expect(posterStyle.opacity).toBe("1");
  expect(posterStyle.transitionDuration).toBe("0s");

  const panel = page.locator("#dataHealth");
  await expect(panel.locator(":scope > summary")).toBeVisible();
  await panel.evaluate(element => { element.open = true; });
  await expect(panel.locator(":scope > .data-health-body")).toBeVisible();
  const closeState = await page.evaluate(() => {
    document.querySelector(".tabs")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return {
      open: Boolean(document.querySelector("#dataHealth")?.open),
      ghosts: document.querySelectorAll(".m9f3-data-health-exit-ghost").length
    };
  });
  expect(closeState.open).toBe(false);
  expect(closeState.ghosts).toBe(0);
});
