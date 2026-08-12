import { defineConfig, devices } from "@playwright/test";

const baseURL = String(
  process.env.HK_CINEMA_PAGES_URL || "https://maxyu725.github.io/hk-cinema/"
).replace(/\/?$/, "/");

export default defineConfig({
  testDir: "./tests/e2e-live",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  projects: [
    {
      name: "production-mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 }
      }
    }
  ]
});
