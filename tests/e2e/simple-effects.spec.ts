import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function importFixture(page: Page, name = "landscape-h264-aac.mp4") {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles(fixture(name));
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

/** Mean brightness of the preview in a region given as fractions of its size. */
async function brightness(page: Page, fx: number, fy: number, fw: number, fh: number): Promise<number> {
  return page.getByTestId("preview-canvas").evaluate(
    (canvas: HTMLCanvasElement, [x, y, w, h]: number[]) => {
      const d = canvas
        .getContext("2d")!
        .getImageData(Math.floor(canvas.width * x!), Math.floor(canvas.height * y!), Math.ceil(canvas.width * w!), Math.ceil(canvas.height * h!)).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      return sum / (d.length / 4);
    },
    [fx, fy, fw, fh],
  );
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

const scale = async (page: Page) => Number(await page.getByRole("slider", { name: "Zoom scale" }).getAttribute("aria-valuenow"));

test("drawing a box on the preview sets where and how far a zoom goes, in one undo step", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("toolbar", { name: "Add" }).getByRole("button", { name: "Zoom" }).click();
  await expect(page.getByTestId("edit-box")).toBeVisible();
  expect(await scale(page)).toBe(2);

  // Draw a small box near the top left: a closer zoom aimed there.
  const c = (await page.getByTestId("preview-canvas").boundingBox())!;
  await drag(page, { x: c.x + c.width * 0.05, y: c.y + c.height * 0.1 }, { x: c.x + c.width * 0.3, y: c.y + c.height * 0.2 });
  await expect.poll(() => scale(page)).toBeGreaterThan(3);
  // Focus is in the recording's pixels (the fixture is 1280 wide): the box was drawn left of a third.
  const focusX = Number(await page.getByRole("slider", { name: "Focus horizontal" }).getAttribute("aria-valuenow"));
  expect(focusX).toBeLessThan(1280 * 0.35);

  // One drag is one undo step.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => scale(page)).toBe(2);
});

test("the floating toolbar sets motion in words and splits the zoom", async ({ page }) => {
  await importFixture(page);
  await page.locator("body").press("z");
  const box = page.getByTestId("edit-box");
  await box.getByRole("button", { name: "Quick" }).click();
  await expect(page.getByRole("radio", { name: "Quick" })).toHaveAttribute("aria-checked", "true");
  await box.getByRole("button", { name: "Slow" }).click();
  await expect(page.getByRole("radio", { name: "Slow" })).toHaveAttribute("aria-checked", "true");

  // S splits the selected zoom at the playhead into two linked zooms the camera pans between.
  await page.locator("body").press("Shift+ArrowRight");
  await page.locator("body").press("s");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(2);
  await expect(page.getByTestId("zoom-chain")).toHaveCount(1);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1); // the clip was not split
});

test("dragging across the zoom row creates a zoom for that range", async ({ page }) => {
  await importFixture(page);
  const row = (await page.getByTestId("zoom-row-area").boundingBox())!;
  const clip = (await page.getByTestId("timeline-clip").boundingBox())!;
  // From one sixth to two thirds of the 3 s clip.
  await drag(
    page,
    { x: clip.x + clip.width / 6, y: row.y + row.height / 2 },
    { x: clip.x + (clip.width * 2) / 3, y: row.y + row.height / 2 },
  );
  const zoom = page.getByTestId("timeline-zoom");
  await expect(zoom).toHaveCount(1);
  await expect(zoom).toHaveAttribute("aria-label", /0:00\.[45]\d to 0:0[12]\.\d\d/);
  await expect(page.getByTestId("edit-box")).toBeVisible();

  // A plain click on the row still moves the playhead.
  await page.locator("body").press("Escape");
  await page.mouse.click(clip.x + clip.width * 0.9, row.y + row.height / 2);
  await expect(page.getByTestId("time-display")).toContainText(/0:02\.[6-8]/);
});

test("a zoom added right after another joins it so the camera pans", async ({ page }) => {
  await importFixture(page, "portrait-h264.mp4");
  await page.locator("body").press("z"); // 0 to 2 s
  await page.locator("body").press("Escape");
  await page.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 124; i++) await page.keyboard.press("ArrowRight"); // about 2.07 s at 60 fps
  await page.locator("body").press("z");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(2);
  await expect(page.getByTestId("zoom-chain")).toHaveCount(1);
});

test("spotlight dims around its box, can become a blur, and exports", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: "Apply preset Paper" }).click();
  const outsideBefore = await brightness(page, 0.12, 0.12, 0.1, 0.1);

  await page.getByRole("toolbar", { name: "Add" }).getByRole("button", { name: "Spotlight" }).click();
  await expect(page.getByTestId("timeline-effect")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "effect" })).toHaveAttribute("aria-selected", "true");
  // Past the fade in, the recording outside the box is dimmed.
  await page.locator("body").press("Shift+ArrowRight");
  await expect.poll(() => brightness(page, 0.12, 0.12, 0.1, 0.1)).toBeLessThan(outsideBefore * 0.85);

  // Draw a new box: the effect's area follows.
  const c = (await page.getByTestId("preview-canvas").boundingBox())!;
  const before = await page.getByTestId("edit-box").boundingBox();
  await drag(page, { x: c.x + c.width * 0.1, y: c.y + c.height * 0.15 }, { x: c.x + c.width * 0.35, y: c.y + c.height * 0.5 });
  await expect.poll(async () => (await page.getByTestId("edit-box").boundingBox())!.x).toBeLessThan(before!.x - 20);

  await page.getByTestId("edit-box").getByRole("button", { name: "Blur" }).click();
  await expect(page.getByTestId("timeline-effect")).toHaveAttribute("aria-label", /^Blur/);

  await page.getByRole("tab", { name: "export" }).click();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export MP4" }).click();
  await download;
  await expect(page.getByTestId("export-done")).toBeVisible();
});
