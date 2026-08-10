import { test, expect } from "@playwright/test";

test("PWA shell registers, keeps cache same-origin, reports connectivity, and can reopen offline", async ({ page, context }) => {
  // Start from a same-origin page that does not boot the app runtime, then remove
  // any worker/cache left by another browser smoke. Controlled updates deliberately
  // keep an old active worker alive, so release acceptance must install the current
  // build from a deterministic clean origin state.
  await page.goto("/manifest.json", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith("hk-cinema-shell-"))
      .map(name => caches.delete(name)));
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.HKCinemaPWA?.getState?.().ready === true, null, { timeout: 15_000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15_000 });

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

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator("#movieGrid")).toBeVisible();
  await expect(page.locator("[data-pwa-notice-title]")).toHaveText("目前離線");
  await expect.poll(() => page.evaluate(() => window.HKCinemaPWA?.getState?.().online)).toBe(false);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => page.evaluate(() => window.HKCinemaPWA?.getState?.().online)).toBe(true);
  await expect(page.locator("[data-pwa-notice-title]")).toHaveText("已恢復連線");
});
