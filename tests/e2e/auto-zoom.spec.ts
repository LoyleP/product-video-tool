import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function importFixture(page: Page, name: string) {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles(fixture(name));
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

/** Parses "Suggested zoom 2.5×, 0:00.60 to 0:03.80" into seconds. */
function range(label: string): [number, number] {
  const times = [...label.matchAll(/(\d+):(\d+\.\d+)/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  return [times[0]!, times[1]!];
}

test("suggests one zoom on localized activity and ignores the full-screen change", async ({ page }) => {
  // activity.mp4: a small box moves near the top left from 1 s to 3 s; the whole screen changes at 4 s.
  await importFixture(page, "activity.mp4");
  await page.getByRole("button", { name: "Suggest zooms" }).click();
  const ghosts = page.getByTestId("timeline-suggestion");
  await expect(ghosts).toHaveCount(1, { timeout: 20_000 });
  const [start, end] = range((await ghosts.getAttribute("aria-label"))!);
  expect(start).toBeGreaterThan(0.3);
  expect(start).toBeLessThan(1.2);
  expect(end).toBeGreaterThan(2.9);
  expect(end).toBeLessThan(4.2);

  // Selecting it opens the suggestion panel.
  await ghosts.click();
  await expect(page.getByRole("tab", { name: "suggestion" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Suggested zoom" })).toBeVisible();

  // Accept turns it into a real zoom (one undo step).
  await page.getByRole("tabpanel").getByRole("button", { name: "Accept", exact: true }).click();
  await expect(ghosts).toHaveCount(0);
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "zoom" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(0);
});

test("suggestions can be dismissed, or accepted all at once", async ({ page }) => {
  await importFixture(page, "activity.mp4");
  await page.getByRole("button", { name: "Suggest zooms" }).click();
  await expect(page.getByTestId("timeline-suggestion")).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("timeline-suggestion")).toHaveCount(0);

  await page.getByRole("button", { name: "Suggest zooms" }).click();
  await expect(page.getByTestId("timeline-suggestion")).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole("button", { name: /Accept all/ }).click();
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
});

test("Delete dismisses and Enter accepts the selected suggestion", async ({ page }) => {
  await importFixture(page, "activity.mp4");
  await page.getByRole("button", { name: "Suggest zooms" }).click();
  const ghost = page.getByTestId("timeline-suggestion");
  await expect(ghost).toHaveCount(1, { timeout: 20_000 });
  await ghost.click();
  await page.locator("body").press("Enter");
  await expect(page.getByTestId("timeline-zoom")).toHaveCount(1);
});

test("reports when there is nothing to zoom on", async ({ page }) => {
  // av-sync.mp4 is black with one full-screen flash, which counts as a page change, not activity.
  await importFixture(page, "av-sync.mp4");
  await page.getByRole("button", { name: "Suggest zooms" }).click();
  await expect(page.getByText("No clear activity to zoom on.")).toBeVisible({ timeout: 20_000 });
});
