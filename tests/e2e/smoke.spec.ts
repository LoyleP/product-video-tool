import { devices, expect, test } from "@playwright/test";

test("landing page links to the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Open the editor" }).click();
  await expect(page).toHaveURL(/\/editor$/);
});

test("import screen shows the capabilities debug panel", async ({ page }) => {
  await page.goto("/editor");
  const panel = page.getByTestId("capabilities-panel");
  await panel.getByText("Debug: capabilities").click();
  await expect(panel.locator('[data-capability="videoEncoder"] dd')).toHaveText("yes");
  await expect(panel.locator('[data-capability="h264_1080p"] dd')).not.toHaveText("…");
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ status: "ok" });
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["iPhone 15"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test("editor asks for a desktop browser", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.getByRole("heading", { name: "Use a desktop browser" })).toBeVisible();
    await expect(page.getByTestId("capabilities-panel")).toHaveCount(0);
  });
});
