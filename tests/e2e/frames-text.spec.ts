import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { layoutAt } from "@/engine/render-frame";
import type { Project } from "@/schema/project";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function importFixture(page: Page, name = "landscape-h264-aac.mp4") {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles(fixture(name));
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

/** RGBA at canvas-unit coordinates (1920x1080 space) of the preview's backing store. */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.getByTestId("preview-canvas").evaluate(
    (canvas: HTMLCanvasElement, [cx, cy]: [number, number]) => {
      const s = canvas.width / 1920;
      return Array.from(canvas.getContext("2d")!.getImageData(Math.floor(cx * s), Math.floor(cy * s), 1, 1).data);
    },
    [x, y] as [number, number],
  );
}

/** The saved project, read back from IndexedDB after autosave. */
async function savedProject(page: Page): Promise<Project> {
  await page.waitForTimeout(1300);
  const id = page.url().split("/").pop()!;
  return page.evaluate(
    (projectId) =>
      new Promise<Project>((resolve, reject) => {
        const open = indexedDB.open("studio");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction("projects").objectStore("projects").get(projectId);
          get.onsuccess = () => resolve(get.result as Project);
          get.onerror = () => reject(get.error);
        };
      }),
    id,
  );
}

const near = (a: number[], b: number[], tolerance: number) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]!) <= tolerance);

test("the phone frame aligns with the screen area", async ({ page }) => {
  await importFixture(page, "portrait-h264.mp4");
  await page.getByRole("tab", { name: "style" }).click();
  await page.getByRole("radio", { name: /^Phone/ }).click();
  const project = await savedProject(page);
  expect(project.style.device?.frameId).toBe("phone");

  const { screen } = layoutAt(project, 0).media[0]!;
  const midY = screen.y + screen.h / 2;
  // Just outside the screen edge is the black glass bezel; just inside is the recording (a bright color bar).
  const outside = await pixelAt(page, screen.x - 3, midY);
  const inside = await pixelAt(page, screen.x + 3, midY);
  expect(near(outside, [6, 6, 6], 12)).toBe(true);
  expect(Math.max(...inside.slice(0, 3))).toBeGreaterThan(150);
  const outsideRight = await pixelAt(page, screen.x + screen.w + 3, midY);
  const insideRight = await pixelAt(page, screen.x + screen.w - 3, midY);
  expect(near(outsideRight, [6, 6, 6], 12)).toBe(true);
  expect(Math.max(...insideRight.slice(0, 3))).toBeGreaterThan(150);
});

test("each device frame can be chosen and colored", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("tab", { name: "style" }).click();
  await expect(page.getByRole("radio", { name: /Browser.*suggested/ })).toBeVisible();
  for (const name of ["Phone", "Tablet", "Laptop", "Browser"]) {
    await page.getByRole("radio", { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole("radiogroup", { name: "Device color" }).getByRole("radio").first()).toBeVisible();
  }
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.getByRole("radio", { name: "None" }).click();
  await expect(page.getByRole("radiogroup", { name: "Device color" })).toHaveCount(0);
});

/** Moves the playhead with the keyboard from a control that doesn't use arrow keys itself. */
async function seekSeconds(page: Page, seconds: number) {
  await page.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < seconds; i++) await page.keyboard.press("Shift+ArrowRight");
}

/** Number of near-white pixels in the lower-third band of the preview. */
async function whitePixelsInBand(page: Page): Promise<number> {
  return page.getByTestId("preview-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, Math.floor(canvas.height * 0.78), canvas.width, Math.floor(canvas.height * 0.14)).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! > 235 && data[i + 1]! > 235 && data[i + 2]! > 235) n++;
    return n;
  });
}

test("T adds text that renders, edits and reflows", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: "Apply preset Mono" }).click();
  await seekSeconds(page, 1);
  const baseline = await whitePixelsInBand(page);

  await page.keyboard.press("Home");
  await page.locator("body").press("t");
  await expect(page.getByTestId("timeline-text")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Text" }).fill("Ship faster");
  await expect(page.getByTestId("timeline-text")).toHaveAttribute("aria-label", /Ship faster/);
  const project = await savedProject(page);
  expect(project.textTracks[0]!.layers[0]!.text).toBe("Ship faster");

  await seekSeconds(page, 1);
  await expect.poll(() => whitePixelsInBand(page)).toBeGreaterThan(baseline + 200);

  // Resizing the box from the right handle narrows it (text reflows to the new width).
  const box = page.getByTestId("text-box");
  const before = (await box.boundingBox())!;
  const handle = (await box.locator('[data-handle="e"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - before.width * 0.4, handle.y + handle.height / 2, { steps: 4 });
  await page.mouse.up();
  const after = (await box.boundingBox())!;
  expect(after.width).toBeLessThan(before.width * 0.75);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await box.boundingBox())!.width).toBeCloseTo(before.width, 0);
});

test("G turns on the tap tool; click adds a tap and drag adds a swipe", async ({ page }) => {
  await importFixture(page);
  await page.locator("body").press("g");
  const canvas = page.getByTestId("preview-canvas");
  const b = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: b.width * 0.5, y: b.height * 0.5 } });
  await expect(page.getByTestId("timeline-gesture")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "tap" })).toHaveAttribute("aria-selected", "true");

  await page.locator("body").press("Shift+ArrowRight");
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("timeline-gesture")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Swipe" })).toBeVisible();

  await page.locator("body").press("Delete");
  await expect(page.getByTestId("timeline-gesture")).toHaveCount(1);
  await page.locator("body").press("g");
});

test("presets apply, and custom presets save and delete", async ({ page }) => {
  await importFixture(page);
  await page.getByRole("button", { name: "Apply preset Paper" }).click();
  await expect.poll(() => pixelAt(page, 10, 10)).toEqual([245, 241, 232, 255]);

  page.once("dialog", (d) => void d.accept("Warm paper"));
  await page.getByRole("button", { name: "Save current" }).click();
  await expect(page.getByRole("button", { name: "Apply preset Warm paper" })).toBeVisible();

  await page.getByRole("button", { name: "Apply preset Midnight" }).click();
  await expect.poll(() => pixelAt(page, 10, 10)).not.toEqual([245, 241, 232, 255]);
  await page.getByRole("button", { name: "Apply preset Warm paper" }).click();
  await expect.poll(() => pixelAt(page, 10, 10)).toEqual([245, 241, 232, 255]);

  await page.getByRole("button", { name: "Delete preset Warm paper" }).click();
  await expect(page.getByRole("button", { name: "Apply preset Warm paper" })).toHaveCount(0);
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("exports a project with a device frame, text and a tap", async ({ page }) => {
  await importFixture(page, "portrait-h264.mp4");
  await page.getByRole("tab", { name: "style" }).click();
  await page.getByRole("radio", { name: /^Phone/ }).click();
  await page.locator("body").press("t");
  await page.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.press("g");
  const canvas = page.getByTestId("preview-canvas");
  const b = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: b.width * 0.5, y: b.height * 0.4 } });
  await expect(page.getByTestId("timeline-gesture")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "export" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export MP4" }).click();
  const file = await (await downloadPromise).path();
  await expect(page.getByTestId("export-done")).toBeVisible();

  if (hasFfmpeg) {
    // The frame's black bezel is in the exported video, left of the phone screen.
    const project = await savedProject(page);
    const { screen } = layoutAt(project, 0).media[0]!;
    const x = Math.round(screen.x - 6);
    const y = Math.round(screen.y + screen.h / 2);
    const rgb = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout;
    expect(near([...rgb], [6, 6, 6], 16)).toBe(true);
  }
});

test("text renders identically in preview and export", async ({ page }) => {
  test.skip(!hasFfmpeg, "needs ffmpeg to decode the exported frame");
  await page.setViewportSize({ width: 2400, height: 1500 });
  await importFixture(page);
  await page.getByRole("button", { name: "Apply preset Mono" }).click();
  await page.locator("body").press("t");
  await page.getByRole("textbox", { name: "Text" }).fill("Identical text");
  await seekSeconds(page, 1); // text fully faded in
  await expect.poll(() => whitePixelsInBand(page)).toBeGreaterThan(500);

  // Preview pixels of the text band, at the preview's backing resolution.
  const preview = await page.getByTestId("preview-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const y = Math.floor(canvas.height * 0.78);
    const h = Math.floor(canvas.height * 0.14);
    return { width: canvas.width, height: canvas.height, y, h, data: Array.from(ctx.getImageData(0, y, canvas.width, h).data) };
  });

  await page.getByRole("tab", { name: "export" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export MP4" }).click();
  const file = await (await downloadPromise).path();

  // Decode the exported frame at 1 s, scaled to the preview's size, as raw RGBA.
  const raw = spawnSync(
    "ffmpeg",
    ["-v", "error", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", `scale=${preview.width}:${preview.height}:flags=area,crop=${preview.width}:${preview.h}:0:${preview.y}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 28 },
  ).stdout;
  expect(raw.length).toBe(preview.data.length);

  // Compare where the text is: the set of near-white pixels in each image. This ignores H.264 artifacts
  // in the colorful video underneath while catching a different font, size, position or wrapping.
  const white = (d: ArrayLike<number>, i: number) => d[i]! > 215 && d[i + 1]! > 215 && d[i + 2]! > 215;
  let both = 0;
  let either = 0;
  let previewText = 0;
  let diff = 0;
  for (let i = 0; i < raw.length; i += 4) {
    const p = white(preview.data, i);
    const e = white(raw, i);
    if (p) previewText++;
    if (p && e) both++;
    if (p || e) either++;
    for (let c = 0; c < 3; c++) diff += Math.abs(raw[i + c]! - preview.data[i + c]!);
  }
  const overlap = both / either;
  const meanDiff = diff / ((raw.length / 4) * 3);
  expect(previewText).toBeGreaterThan(500); // the band really contains text
  expect(overlap).toBeGreaterThan(0.8);
  expect(meanDiff).toBeLessThan(10); // whole band, including compressed video
});
