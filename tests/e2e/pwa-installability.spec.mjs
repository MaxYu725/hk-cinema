import { expect, test } from "@playwright/test";

test("PWA manifest exposes loadable install icons", async ({ page, request }) => {
  await page.goto("./");

  const manifestResponse = await request.get("./manifest.json");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();

  const expected = [
    ["./icons/icon-192.png", "192x192", "any"],
    ["./icons/icon-512.png", "512x512", "any"],
    ["./icons/icon-maskable-512.png", "512x512", "maskable"],
  ];

  for (const [src, sizes, purpose] of expected) {
    const icon = manifest.icons?.find((item) => item.src === src);
    expect(icon).toBeTruthy();
    expect(icon.sizes).toBe(sizes);
    expect(icon.type).toBe("image/png");
    expect(icon.purpose).toContain(purpose);

    const response = await request.get(src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  const appleIcon = await request.get("./icons/apple-touch-icon.png");
  expect(appleIcon.ok()).toBeTruthy();

  const links = await page.locator('link[rel="apple-touch-icon"]').evaluateAll((nodes) =>
    nodes.map((node) => ({ href: node.getAttribute("href"), sizes: node.getAttribute("sizes") })),
  );
  expect(links).toContainEqual({ href: "./icons/apple-touch-icon.png", sizes: "180x180" });
});

test("maskable icon keeps the brand glyph inside the central safe zone", async ({ page }) => {
  await page.goto("./");
  const result = await page.evaluate(async () => {
    const img = new Image();
    img.src = "./icons/icon-maskable-512.png";
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  });

  expect(result).toEqual({ width: 512, height: 512 });
});
