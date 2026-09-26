import { expect, test, type Page } from "@playwright/test";

async function record(page: Page, seconds: number, { camera }: { camera: boolean }) {
  await page.goto("/editor");
  await page.getByRole("button", { name: "Record screen" }).click();
  const setup = page.getByRole("region", { name: "Recording setup" });
  await expect(setup).toBeVisible();
  const allow = setup.getByRole("button", { name: "Allow access" });
  if (await allow.isVisible()) await allow.click();
  await expect(setup.getByLabel("Microphone").locator("option")).not.toHaveCount(1);
  if (camera) {
    const cameraSelect = setup.getByLabel("Camera");
    await cameraSelect.selectOption({ index: 1 });
  }
  await setup.getByRole("button", { name: "Choose screen and start" }).click();
  await expect(page.getByRole("region", { name: "Recording" })).toBeVisible();
  await expect(page.getByTestId("recording-time")).toContainText(`0:0${seconds}`, { timeout: (seconds + 5) * 1000 });
  await page.getByRole("button", { name: "Stop and edit" }).click();
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

test("records the screen with microphone and camera straight into a project", async ({ page }) => {
  await record(page, 3, { camera: true });
  // Screen and camera tracks, no re-import.
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await expect(page.getByText("Camera", { exact: true })).toBeVisible();
  const total = (await page.getByTestId("time-display").textContent())!.split("/")[1]!.trim();
  const [m, s] = total.split(":");
  const seconds = Number(m) * 60 + Number(s);
  expect(seconds).toBeGreaterThan(2.5);
  expect(seconds).toBeLessThan(5);

  // The camera clip opens overlay settings.
  await page.getByTestId("timeline-clip").nth(1).click();
  await expect(page.getByRole("region", { name: "Camera overlay" })).toBeVisible();
  await page.getByRole("radio", { name: "Rounded" }).click();
  await page.getByRole("radio", { name: "top left" }).click();
  await page.getByRole("button", { name: "Hide camera" }).click();
  await expect(page.getByRole("button", { name: "Show camera" })).toBeVisible();

  // The recording is a normal project: it exports.
  await page.getByRole("tab", { name: "export" }).click();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export MP4" }).click();
  await download;
  await expect(page.getByTestId("export-done")).toBeVisible();
});

test("records without a camera", async ({ page }) => {
  await record(page, 2, { camera: false });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
});

test("cancelling setup returns to the import screen", async ({ page }) => {
  await page.goto("/editor");
  await page.getByRole("button", { name: "Record screen" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Record screen" })).toBeVisible();
});
