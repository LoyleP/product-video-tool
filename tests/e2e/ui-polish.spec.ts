import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openLeftPanel } from "./helpers";

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

const menu = (page: Page) => page.getByRole("navigation", { name: "Menu" });

test.describe("left icon bar", () => {
  test("has an icon per menu, and opens one panel at a time next to the bar", async ({ page }) => {
    await importFixture(page);
    await expect(menu(page).getByRole("button")).toHaveCount(2);
    await expect(menu(page).getByRole("button", { name: "Presets", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "Presets panel" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Backgrounds panel" })).toHaveCount(0);

    await menu(page).getByRole("button", { name: "Backgrounds", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Backgrounds panel" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Presets panel" })).toHaveCount(0);

    // The panel sits right next to the icon bar.
    const bar = (await menu(page).boundingBox())!;
    const panel = (await page.getByRole("complementary", { name: "Backgrounds panel" }).boundingBox())!;
    expect(Math.abs(panel.x - (bar.x + bar.width))).toBeLessThan(2);
    expect(bar.width).toBeLessThan(60);
  });

  test("selecting the open menu again closes its panel and gives the preview the room", async ({ page }) => {
    await importFixture(page);
    const canvas = page.getByTestId("preview-canvas");
    const before = (await canvas.boundingBox())!;
    await menu(page).getByRole("button", { name: "Presets", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Presets panel" })).toHaveCount(0);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThanOrEqual(before.width);
  });

  test("presets and backgrounds still apply from their panels", async ({ page }) => {
    await importFixture(page);
    await page.getByRole("button", { name: "Apply preset Paper" }).click();
    await expect.poll(() => pixel(page, 0.01, 0.01)).toEqual([245, 241, 232, 255]);
    await openLeftPanel(page, "Backgrounds");
    await page.getByRole("button", { name: "Ink", exact: true }).click();
    await expect.poll(() => pixel(page, 0.01, 0.01)).toEqual([10, 10, 10, 255]);
  });
});

test.describe("exact values", () => {
  test("layout values are in px, and the typed value applies to the preview", async ({ page }) => {
    await importFixture(page);
    const padding = page.getByRole("textbox", { name: "Padding" });
    // The default 8% of the 1080 px canvas side is 86 px.
    await expect(padding).toHaveValue("86");
    await expect(page.getByRole("textbox", { name: "Corner radius" })).toHaveValue("24");
    await expect(page.getByRole("textbox", { name: "Blur", exact: true })).toHaveValue("60");
    await expect(page.getByRole("textbox", { name: "Offset" })).toHaveValue("24");

    const cornerBefore = await pixel(page, 0.02, 0.02);
    await padding.fill("0");
    await padding.press("Enter");
    await expect(page.getByRole("slider", { name: "Padding" })).toHaveAttribute("aria-valuenow", "0");
    // With no padding the recording reaches the canvas corner.
    await expect.poll(() => pixel(page, 0.02, 0.02)).not.toEqual(cornerBefore);
  });

  test("typed values clamp, Escape restores, arrows step, and junk is ignored", async ({ page }) => {
    await importFixture(page);
    const radius = page.getByRole("textbox", { name: "Corner radius" });
    const slider = page.getByRole("slider", { name: "Corner radius" });

    await radius.fill("5000");
    await radius.press("Enter");
    await expect(radius).toHaveValue("1000"); // the input's own maximum, past the slider's 120
    await expect(slider).toHaveAttribute("aria-valuenow", "120"); // the slider just pins to its end

    await radius.fill("40");
    await radius.press("Escape");
    await expect(radius).toHaveValue("1000");

    await radius.fill("abc");
    await radius.press("Enter");
    await expect(radius).toHaveValue("1000");

    await radius.fill("50");
    await radius.press("Enter");
    await radius.press("ArrowUp");
    await expect(radius).toHaveValue("51");
    await radius.press("Shift+ArrowDown");
    await expect(radius).toHaveValue("41");

    // Leaving the field applies what was typed.
    await radius.fill("12");
    await page.getByRole("textbox", { name: "Offset" }).focus();
    await expect(radius).toHaveValue("12");

    // Typing a value is undoable like any other edit.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(radius).not.toHaveValue("12");
  });

  test("colors take hex values", async ({ page }) => {
    await importFixture(page);
    const color = page.getByRole("textbox", { name: "Color 1", exact: true });
    await color.fill("#f00");
    await color.press("Enter");
    await expect(color).toHaveValue("#FF0000");
    await color.fill("nope");
    await color.press("Enter");
    await expect(color).toHaveValue("#FF0000");
  });

  test("zoom, effect, text and clip values are exact inputs in px and seconds", async ({ page }) => {
    await importFixture(page);
    await page.locator("body").press("z");
    // The fixture is 1280x720: a centered zoom focuses on pixel 640, 360.
    await expect(page.getByRole("textbox", { name: "Focus horizontal" })).toHaveValue("640");
    await expect(page.getByRole("textbox", { name: "Focus vertical" })).toHaveValue("360");
    const scale = page.getByRole("textbox", { name: "Zoom scale" });
    await scale.fill("3.25");
    await scale.press("Enter");
    await expect(page.getByRole("slider", { name: "Zoom scale" })).toHaveAttribute("aria-valuenow", "3.25");
    await page.getByRole("textbox", { name: "End" }).fill("1.5");
    await page.getByRole("textbox", { name: "End" }).press("Enter");
    await expect(page.getByTestId("timeline-zoom")).toHaveAttribute("aria-label", /to 0:01\.50/);

    await page.locator("body").press("Escape");
    await page.getByRole("toolbar", { name: "Add" }).getByRole("button", { name: "Blur" }).click();
    await expect(page.getByRole("textbox", { name: "Blur radius" })).toHaveValue("20"); // 60% strength: 4 + 26 x 0.6 = 19.6 px
    await page.getByRole("textbox", { name: "Area width" }).fill("400");
    await page.getByRole("textbox", { name: "Area width" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Area width" })).toHaveValue("400");
    await page.getByRole("textbox", { name: "Blur radius" }).fill("10");
    await page.getByRole("textbox", { name: "Blur radius" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Blur radius" })).toHaveValue("10");

    await page.locator("body").press("Escape");
    await page.getByRole("toolbar", { name: "Add" }).getByRole("button", { name: "Text" }).click();
    await expect(page.getByRole("textbox", { name: "Size" })).toHaveValue("64");
    await expect(page.getByRole("textbox", { name: "Line height" })).toHaveValue("74"); // 64 px x 1.15
    await expect(page.getByRole("textbox", { name: "Box width" })).toHaveValue("1536"); // 80% of 1920
    await page.getByRole("textbox", { name: "Box width" }).fill("900");
    await page.getByRole("textbox", { name: "Box width" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Box width" })).toHaveValue("900");

    await page.getByTestId("timeline-clip").click();
    await expect(page.getByRole("textbox", { name: "Speed" })).toHaveValue("1.00");
    await page.getByRole("textbox", { name: "Trim end" }).fill("2");
    await page.getByRole("textbox", { name: "Trim end" }).press("Enter");
    await expect(page.getByTestId("time-display")).toContainText("/ 0:02.00");
  });

  test("export can be set to an exact size that keeps the aspect ratio", async ({ page }) => {
    await importFixture(page);
    await page.getByRole("tab", { name: "export" }).click();
    await page.getByRole("textbox", { name: "Width" }).fill("1000");
    await page.getByRole("textbox", { name: "Width" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Height" })).toHaveValue("562");
    await expect(page.getByRole("radio", { name: /1080p/ })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("textbox", { name: "Height" }).fill("720");
    await page.getByRole("textbox", { name: "Height" }).press("Enter");
    await expect(page.getByRole("textbox", { name: "Width" })).toHaveValue("1280");
  });

  test("the playhead time can be typed", async ({ page }) => {
    await importFixture(page);
    await page.getByRole("button", { name: "Playhead time" }).click();
    await page.getByRole("textbox", { name: "Playhead time" }).fill("0:02.50");
    await page.getByRole("textbox", { name: "Playhead time" }).press("Enter");
    await expect(page.getByTestId("time-display")).toContainText("0:02.50");
  });
});

test.describe("timeline playhead and scrollbar", () => {
  test("the handle in the ruler drags the playhead, keeping the grab point", async ({ page }) => {
    await importFixture(page);
    const handle = page.getByTestId("playhead-handle");
    const clip = (await page.getByTestId("timeline-clip").boundingBox())!;
    const h = (await handle.boundingBox())!;
    expect(h.width).toBeGreaterThanOrEqual(20); // a target that is easy to hit
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(clip.x + clip.width * 0.5, h.y + h.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("time-display")).toContainText(/0:01\.[3-7]/);
    await expect(handle).toHaveAttribute("aria-valuenow", /^1\.[3-7]/);
  });

  test("the line can be dragged too, and the handle works from the keyboard", async ({ page }) => {
    await importFixture(page);
    const clip = (await page.getByTestId("timeline-clip").boundingBox())!;
    await page.getByRole("slider", { name: "Playhead" }).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("time-display")).toContainText("0:01.00");

    const grab = (await page.getByTestId("playhead-grab").boundingBox())!;
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
    await page.mouse.down();
    await page.mouse.move(clip.x + clip.width * 0.9, grab.y + grab.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("time-display")).toContainText(/0:02\.[5-9]/);
  });

  test("clicking a block under the playhead still selects the block", async ({ page }) => {
    await importFixture(page);
    await page.locator("body").press("z"); // a zoom from 0 to 2 s
    await page.locator("body").press("Escape");
    await page.getByRole("slider", { name: "Playhead" }).focus();
    await page.keyboard.press("Shift+ArrowRight"); // playhead at 1 s, the middle of the zoom
    await page.getByTestId("timeline-zoom").click();
    await expect(page.getByRole("tab", { name: "zoom" })).toHaveAttribute("aria-selected", "true");
  });

  test("the timeline has no scrollbar but still scrolls", async ({ page }) => {
    await importFixture(page);
    const scroller = page.getByTestId("timeline").locator(".no-scrollbar");
    const style = await scroller.evaluate((el) => {
      const s = getComputedStyle(el);
      const after = getComputedStyle(el, "::-webkit-scrollbar");
      return { width: s.scrollbarWidth, display: after.display, canScroll: el.scrollWidth > el.clientWidth };
    });
    expect(style.width).toBe("none");
    await page.getByRole("button", { name: "Zoom timeline in" }).click();
    await page.getByRole("button", { name: "Zoom timeline in" }).click();
    await page.getByRole("button", { name: "Zoom timeline in" }).click();
    await scroller.evaluate((el) => (el.scrollLeft = 200));
    expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    // No layout space is reserved for a scrollbar.
    expect(await scroller.evaluate((el) => (el as HTMLElement).offsetHeight - el.clientHeight)).toBe(0);
  });
});

test.describe("no instruction text", () => {
  const phrases = [
    /drag to/i,
    /drag the/i,
    /drag edges/i,
    /click the preview/i,
    /click to/i,
    /select .* in the timeline/i,
    /select something/i,
    /press [a-z] /i,
    /turn on the/i,
    /ctrl or/i,
    /draw or drag/i,
    /use the bar/i,
    /shortcuts/i,
    /the file stays/i,
    /pitch changes/i,
  ];

  async function expectNoInstructions(page: Page) {
    const text = await page.locator("body").innerText();
    for (const phrase of phrases) expect(text, String(phrase)).not.toMatch(phrase);
  }

  test("the import screen and the editor show none", async ({ page }) => {
    await page.goto("/editor");
    await expectNoInstructions(page);
    await page.getByRole("button", { name: "Record screen" }).click();
    await expectNoInstructions(page);
    await importFixture(page);
    await expectNoInstructions(page);
  });

  test("every panel is free of them, and nothing selected shows no contextual tab", async ({ page }) => {
    await importFixture(page);
    await expect(page.getByRole("tab")).toHaveCount(2); // Style and Export only
    await expectNoInstructions(page);

    await page.locator("body").press("z");
    await expectNoInstructions(page);
    await page.getByRole("toolbar", { name: "Add" }).getByRole("button", { name: "Spotlight" }).click();
    await expectNoInstructions(page);
    await page.getByRole("toolbar", { name: "Add" }).getByRole("button", { name: "Text" }).click();
    await expectNoInstructions(page);
    await page.getByTestId("timeline-clip").click();
    await expectNoInstructions(page);
    await page.locator("body").press("g");
    await expectNoInstructions(page);
    await page.getByRole("tab", { name: "export" }).click();
    await expectNoInstructions(page);

    // Escape turns the tap tool off, and the contextual tab goes with it.
    await page.locator("body").press("Escape");
    await expect(page.getByRole("tab")).toHaveCount(2);
  });
});
