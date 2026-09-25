import { devices, expect, test } from "@playwright/test";

test("landing page links to the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Open the editor" }).click();
  await expect(page).toHaveURL(/\/editor$/);
});

test("editor shows the capabilities debug panel on desktop", async ({ page }) => {
  await page.goto("/editor");
  const panel = page.getByTestId("capabilities-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-capability="videoEncoder"] dd')).toHaveText("yes");
  await expect(panel.locator('[data-capability="h264_1080p"] dd')).not.toHaveText("…");
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ status: "ok" });
});

test.describe("on a phone", () => {
  const { defaultBrowserType: _, ...iPhone } = devices["iPhone 15"];
  test.use(iPhone);

  test("editor asks for a desktop browser", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.getByRole("heading", { name: "Use a desktop browser" })).toBeVisible();
    await expect(page.getByTestId("capabilities-panel")).toHaveCount(0);
  });
});
