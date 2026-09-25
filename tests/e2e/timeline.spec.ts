import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function importFixture(page: Page, name = "landscape-h264-aac.mp4") {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles(fixture(name));
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

async function pixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.getByTestId("preview-canvas").evaluate(
    (canvas: HTMLCanvasElement, [x, y]: [number, number]) =>
      Array.from(canvas.getContext("2d")!.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data),
    [fx, fy] as [number, number],
  );
}

test("S splits at the playhead, and undo and redo restore it exactly", async ({ page }) => {
  await importFixture(page);
  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(1);

  await page.locator("body").press("Shift+ArrowRight");
  await expect(page.getByTestId("time-display")).toContainText("0:01.00");
  await page.locator("body").press("s");
  await expect(clips).toHaveCount(2);
  await expect(clips.nth(1)).toHaveAttribute("aria-label", /0:01\.00 to 0:03\.00/);

  await page.locator("body").press("ControlOrMeta+z");
  await expect(clips).toHaveCount(1);
  await page.locator("body").press("ControlOrMeta+Shift+z");
  await expect(clips).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(clips).toHaveCount(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(clips).toHaveCount(2);
});

test("Delete removes the selected clip and the gap stays", async ({ page }) => {
  await importFixture(page);
  await page.locator("body").press("Shift+ArrowRight");
  await page.locator("body").press("s");
  await page.getByTestId("timeline-clip").first().click();
  await page.locator("body").press("Delete");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByTestId("time-display")).toContainText("/ 0:03.00");
});

test("clip speed changes the duration and can be undone", async ({ page }) => {
  await importFixture(page);
  await page.getByTestId("timeline-clip").click();
  await expect(page.getByRole("tab", { name: "clip" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "2×", exact: true }).click();
  await expect(page.getByTestId("time-display")).toContainText("/ 0:01.50");
  await page.locator("body").press("ControlOrMeta+z");
  await expect(page.getByTestId("time-display")).toContainText("/ 0:03.00");
});

test("Z adds a zoom that visibly zooms the preview", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: "Paper" }).click();
  // With padding, the top-left corner is background.
  await expect.poll(() => pixel(page, 0.02, 0.02)).toEqual([250, 250, 250, 255]);

  await page.locator("body").press("z");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "zoom" })).toHaveAttribute("aria-selected", "true");

  // Hold point of the zoom: the media now covers the corner.
  await page.locator("body").press("Shift+ArrowRight");
  await expect.poll(() => pixel(page, 0.02, 0.02)).not.toEqual([250, 250, 250, 255]);

  // Clicking the preview aims the zoom.
  const before = await page.getByRole("slider", { name: "Focus horizontal" }).getAttribute("aria-valuenow");
  const canvas = page.getByTestId("preview-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.5 } });
  await expect(page.getByRole("slider", { name: "Focus horizontal" })).not.toHaveAttribute("aria-valuenow", before!);

  await page.locator("body").press("Delete");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(0);
  await page.locator("body").press("ControlOrMeta+z");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
});

test("zooms can't overlap", async ({ page }) => {
  await importFixture(page);
  await page.locator("body").press("z");
  await page.locator("body").press("Shift+ArrowRight");
  await page.locator("body").press("z");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
});

test("J K L shuttle and arrow keys step frames", async ({ page }) => {
  await importFixture(page);
  await page.locator("body").press("ArrowRight");
  await expect(page.getByTestId("time-display")).toContainText("0:00.03");
  await page.locator("body").press("ArrowLeft");
  await expect(page.getByTestId("time-display")).toContainText("0:00.00");

  await page.locator("body").press("l");
  await page.locator("body").press("l");
  await expect(page.getByTestId("shuttle-rate")).toHaveText("2×");
  await page.locator("body").press("k");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

  await page.locator("body").press("End");
  await page.locator("body").press("j");
  await expect(page.getByTestId("shuttle-rate")).toHaveText("◀ 1×");
  await page.locator("body").press("k");
});

test("dragging a clip edge trims it", async ({ page }) => {
  await importFixture(page);
  const clip = page.getByTestId("timeline-clip");
  const box = (await clip.boundingBox())!;
  const edge = clip.locator('[data-edge="end"]');
  const edgeBox = (await edge.boundingBox())!;
  await page.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, edgeBox.y + edgeBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("time-display")).toContainText(/\/ 0:01\.[45]/);
  await page.locator("body").press("ControlOrMeta+z");
  await expect(page.getByTestId("time-display")).toContainText("/ 0:03.00");
});

test("adding a second video appends it to the timeline", async ({ page }) => {
  await importFixture(page);
  await page.getByTestId("add-video-input").setInputFiles(fixture("portrait-h264.mp4"));
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await expect(page.getByTestId("time-display")).toContainText("/ 0:06.00");
});

test("projects autosave and reopen from the project list", async ({ page }) => {
  await importFixture(page);
  await page.locator("body").press("z");
  await page.waitForTimeout(1500); // autosave debounce
  const url = page.url();
  await page.getByRole("link", { name: "Projects" }).click();
  const list = page.getByTestId("recent-projects");
  await expect(list).toBeVisible();
  await list.getByRole("link").first().click();
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
});
