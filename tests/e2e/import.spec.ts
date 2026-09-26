import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openLeftPanel } from "./helpers";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function pixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.getByTestId("preview-canvas").evaluate(
    (canvas: HTMLCanvasElement, [x, y]: [number, number]) => {
      const ctx = canvas.getContext("2d")!;
      return Array.from(ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data);
    },
    [fx, fy] as [number, number],
  );
}

async function importFixture(page: Page, name: string) {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles(fixture(name));
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

/** App alerts, excluding Next.js's built-in route announcer. */
const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

const PLACEHOLDER = [26, 26, 26, 255];

for (const name of ["landscape-h264-aac.mp4", "portrait-h264.mp4", "vfr-h264.mov", "vp9-opus.webm"]) {
  test(`imports ${name} and composites its first frame`, async ({ page }) => {
    await importFixture(page, name);
    // The center of the canvas is inside the media and shows decoded video, not the placeholder.
    expect(await pixel(page, 0.5, 0.5)).not.toEqual(PLACEHOLDER);
    // The top-left corner is background (default padding keeps media away from it).
    const corner = await pixel(page, 0.01, 0.01);
    expect(corner[3]).toBe(255);
  });
}

test("first frame is composited within 2 seconds of the drop", async ({ page }) => {
  const timing = new Promise<number>((resolve) => {
    page.on("console", (msg) => {
      const match = /first frame composited (\d+) ms/.exec(msg.text());
      if (match) resolve(Number(match[1]));
    });
  });
  await importFixture(page, "landscape-h264-aac.mp4");
  expect(await timing).toBeLessThan(2000);
});

test("style changes update the preview and survive a reload", async ({ page }) => {
  await importFixture(page, "landscape-h264-aac.mp4");
  const before = await pixel(page, 0.01, 0.01);

  await openLeftPanel(page, "Backgrounds");
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await expect(page.getByRole("button", { name: "Paper", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => pixel(page, 0.01, 0.01)).toEqual([250, 250, 250, 255]);
  expect(before).not.toEqual([250, 250, 250, 255]);

  const padding = page.getByRole("slider", { name: "Padding" });
  await padding.focus();
  await page.keyboard.press("Home");
  await expect(page.getByRole("textbox", { name: "Padding" })).toHaveValue("0");

  // Autosave is debounced by one second.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
  await openLeftPanel(page, "Backgrounds");
  await expect(page.getByRole("button", { name: "Paper", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "Padding" })).toHaveAttribute("aria-valuenow", "0");
});

test("rejects unsupported files with a readable message", async ({ page }) => {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(appAlert(page)).toContainText("Drop an MP4, MOV or WebM video");
});

test("reports a corrupt video instead of failing silently", async ({ page }) => {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles({
    name: "broken.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(4096, 7),
  });
  await expect(appAlert(page)).toBeVisible();
  await expect(page).toHaveURL(/\/editor$/);
});

test("unknown project ids show a way back", async ({ page }) => {
  await page.goto("/editor/00000000-0000-0000-0000-000000000000");
  await expect(appAlert(page)).toContainText("isn't in this browser's storage");
  await expect(page.getByRole("link", { name: "Import a video" })).toBeVisible();
});
