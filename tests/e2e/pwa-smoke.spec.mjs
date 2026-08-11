import { test, expect, devices } from "@playwright/test";

const pixel7 = devices["Pixel 7"];

test("PWA shell registers, keeps cache same-origin, reports connectivity, and can reopen offline", async ({ browser }) => {
  // A Service Worker that was active before unregister() can keep controlling the
  // original client until that client goes away. Release acceptance therefore uses
  // a brand-new BrowserContext instead of trying to recycle/unregister an existing
  // page. The first page only bootstraps an active worker; the smoke assertions run
  // in a second, new client that is controlled from navigation start.
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    screen: pixel7.screen,
    userAgent: pixel7.userAgent,
    deviceScaleFactor: pixel7.deviceScaleFactor,
    isMobile: pixel7.isMobile,
    hasTouch: pixel7.hasTouch,
    serviceWorkers: "allow"
  });

  try {
    const bootstrapPage = await context.newPage();
    await bootstrapPage.goto("/", { waitUntil: "domcontentloaded" });
    await bootstrapPage.waitForFunction(
      () => window.HKCinemaPWA?.getState?.().ready === true,
      null,
      { timeout: 15_000 }
    );
    await bootstrapPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) {
        throw new Error("Service Worker did not become active");
      }
    });
    await bootstrapPage.close();

    const page = await context.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.HKCinemaPWA?.getState?.().ready === true,
      null,
      { timeout: 15_000 }
    );
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      null,
      { timeout: 15_000 }
    );

    const pwa = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const cachedUrls = [];
      for (const name of cacheNames.filter(name => name.startsWith("hk-cinema-shell-"))) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        cachedUrls.push(...requests.map(request => request.url));
      }
      return {
        state: window.HKCinemaPWA.getState(),
        scope: registration.scope,
        cachedUrls,
        origin: location.origin
      };
    });

    expect(pwa.state.ready).toBe(true);
    expect(pwa.state.error).toBeNull();
    expect(pwa.state.updateReady).toBe(false);
    expect(pwa.scope).toContain("127.0.0.1:4173");
    expect(pwa.cachedUrls.length).toBeGreaterThan(3);
    expect(pwa.cachedUrls.every(url => new URL(url).origin === pwa.origin)).toBe(true);
    expect(pwa.cachedUrls.some(url => url.includes("hk-cinema-api.max-yu-jp.workers.dev"))).toBe(false);

    // Verify the actual shell can reopen with browser networking disabled. Chromium
    // does not consistently emit an `offline` DOM event for the newly reloaded
    // document, so dispatch it explicitly after reload to test the runtime contract
    // separately from the network/cache contract.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".tabs")).toBeVisible();
    await expect(page.locator("#movieGrid")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect.poll(() => page.evaluate(() => window.HKCinemaPWA?.getState?.().online)).toBe(false);
    await expect(page.locator("[data-pwa-notice-title]")).toHaveText("目前離線");

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => page.evaluate(() => window.HKCinemaPWA?.getState?.().online)).toBe(true);
    await expect(page.locator("[data-pwa-notice-title]")).toHaveText("已恢復連線");
  } finally {
    await context.close();
  }
});