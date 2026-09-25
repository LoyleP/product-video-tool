import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function importFixture(page: Page, name: string) {
  await page.goto("/editor");
  await page.getByTestId("import-input").setInputFiles(fixture(name));
  await expect(page.getByTestId("preview-canvas")).toHaveAttribute("data-first-frame", "ready", { timeout: 10_000 });
}

async function timeDisplaySeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId("time-display").textContent()) ?? "";
  const [m, s] = text.split("/")[0]!.trim().split(":");
  return Number(m) * 60 + Number(s);
}

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Seconds of the first bright frame and the first loud audio in a file, measured by ffmpeg. */
function flashAndBeep(file: string): { flash: number; beep: number } {
  // ffmpeg reports filter output on stderr.
  const run = (args: string[]) =>
    spawnSync("ffmpeg", ["-hide_banner", "-i", file, ...args, "-f", "null", "-"], { encoding: "utf8" }).stderr;

  let pts = 0;
  let flash = Number.NaN;
  for (const line of run(["-an", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG"]).split("\n")) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) pts = Number(t[1]);
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y && Number(y[1]) > 100) {
      flash = pts;
      break;
    }
  }
  const beep = Number(/silence_end: ([\d.]+)/.exec(run(["-vn", "-af", "silencedetect=n=-30dB:d=0.02"]))?.[1]);
  return { flash, beep };
}

async function exportAndRead(page: Page) {
  await page.getByRole("tab", { name: "export" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export MP4" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
  const file = await download.path();
  const bytes = await readFile(file);
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const video = (await input.getPrimaryVideoTrack())!;
  const audio = await input.getPrimaryAudioTrack();
  return {
    file,
    duration: await input.computeDuration(),
    width: await video.getDisplayWidth(),
    height: await video.getDisplayHeight(),
    codec: await video.getCodec(),
    videoStart: await video.getFirstTimestamp(),
    videoDuration: await input.computeDuration([video]),
    frames: (await video.computePacketStats()).packetCount,
    audioCodec: audio ? await audio.getCodec() : null,
    audioStart: audio ? await audio.getFirstTimestamp() : null,
    audioDuration: audio ? await input.computeDuration([audio]) : null,
  };
}

test("plays and pauses with the button and Space", async ({ page }) => {
  await importFixture(page, "landscape-h264-aac.mp4");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => timeDisplaySeconds(page), { timeout: 5_000 }).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await timeDisplaySeconds(page);
  await page.waitForTimeout(400);
  expect(await timeDisplaySeconds(page)).toBe(paused);

  await page.getByTestId("preview-canvas").click();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("stops at the end of the video", async ({ page }) => {
  await importFixture(page, "landscape-h264-aac.mp4");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible({ timeout: 8_000 });
  expect(await timeDisplaySeconds(page)).toBeGreaterThan(2.9);
});

test("exports an MP4 with the right duration, size and synced audio", async ({ page }) => {
  await importFixture(page, "landscape-h264-aac.mp4");
  const out = await exportAndRead(page);
  expect(out.codec).toBe("avc");
  expect(out.width).toBe(1920);
  expect(out.height).toBe(1080);
  expect(out.frames).toBe(90);
  expect(out.videoDuration).toBeCloseTo(3, 1);
  expect(out.audioCodec).toBe("aac");
  expect(out.audioDuration).toBeCloseTo(3, 1);
  // Audio starts before zero by the encoder priming, which an edit list hides (sync is measured below).
  expect(out.videoStart).toBe(0);
  expect(out.audioStart).toBeLessThanOrEqual(0);
  expect(out.audioStart).toBeGreaterThan(-0.1);
  await expect(page.getByTestId("export-done")).toBeVisible();
});

test("exported audio is in sync with video within one frame", async ({ page }) => {
  test.skip(!hasFfmpeg, "needs ffmpeg to measure the exported file");
  await importFixture(page, "av-sync.mp4");
  const out = await exportAndRead(page);
  const source = flashAndBeep(fixture("av-sync.mp4"));
  const exported = flashAndBeep(out.file);
  expect(exported.flash).toBeCloseTo(1, 1);
  const sourceOffset = source.beep - source.flash;
  const exportedOffset = exported.beep - exported.flash;
  expect(Math.abs(exportedOffset - sourceOffset)).toBeLessThan(1 / 30);
});

test("trim changes the exported duration", async ({ page }) => {
  await importFixture(page, "landscape-h264-aac.mp4");
  await page.getByTestId("timeline-clip").click();
  const trimStart = page.getByRole("slider", { name: "Trim start" });
  await trimStart.focus();
  // Radix moves 10 steps (100 ms) per PageUp.
  for (let i = 0; i < 10; i++) await page.keyboard.press("PageUp");
  await expect(trimStart).toHaveAttribute("aria-valuenow", "1000");
  await expect(page.getByTestId("time-display")).toContainText("/ 0:02.00");

  const out = await exportAndRead(page);
  expect(out.frames).toBe(60);
  expect(out.videoDuration).toBeCloseTo(2, 1);
  expect(out.audioDuration).toBeCloseTo(2, 1);
});

test("exports video without audio when the source is silent", async ({ page }) => {
  await importFixture(page, "portrait-h264.mp4");
  const out = await exportAndRead(page);
  expect(out.audioCodec).toBeNull();
  expect(out.frames).toBe(180); // 3 s at 60 fps
});

test("export can be canceled", async ({ page }) => {
  await importFixture(page, "portrait-h264.mp4");
  await page.getByRole("tab", { name: "export" }).click();
  await page.getByRole("radio", { name: /4K/ }).click();
  await page.getByRole("button", { name: "Export MP4" }).click();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(page.getByText("Export canceled.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Export MP4" })).toBeEnabled();
});
