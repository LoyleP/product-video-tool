import { describe, expect, it } from "vitest";
import {
  clampTime,
  frameCount,
  frameIndexAt,
  frameTime,
  isMicros,
  microsToSeconds,
  secondsToMicros,
  secondsToMicrosCeil,
} from "@/engine/time";

describe("time conversions", () => {
  it("converts seconds to integer micros", () => {
    expect(secondsToMicros(1)).toBe(1_000_000);
    expect(secondsToMicros(0.1 + 0.2)).toBe(300_000);
    expect(isMicros(secondsToMicros(1 / 3))).toBe(true);
  });

  it("rounds up to a time that is never before the input", () => {
    // A recording whose video starts at 1/30 s: rounding down would ask for a time before the first frame.
    const first = 1 / 30;
    expect(secondsToMicrosCeil(first)).toBe(33_334);
    expect(microsToSeconds(secondsToMicrosCeil(first))).toBeGreaterThanOrEqual(first);
    expect(secondsToMicrosCeil(0.3)).toBe(300_000);
    expect(secondsToMicrosCeil(0)).toBe(0);
  });

  it("converts micros back to seconds", () => {
    expect(microsToSeconds(2_500_000)).toBe(2.5);
  });

  it("rejects non-integer micros", () => {
    expect(isMicros(1.5)).toBe(false);
    expect(isMicros(Number.NaN)).toBe(false);
    expect(isMicros(42)).toBe(true);
  });
});

describe("frame math", () => {
  it("computes integer frame start times", () => {
    expect(frameTime(0, 30)).toBe(0);
    expect(frameTime(1, 30)).toBe(33_333);
    expect(frameTime(2, 30)).toBe(66_667);
    expect(frameTime(30, 30)).toBe(1_000_000);
    expect(frameTime(60, 60)).toBe(1_000_000);
  });

  it.each([24, 25, 30, 60])("frameIndexAt inverts frameTime at %i fps", (fps) => {
    for (let i = 0; i < fps * 120; i++) {
      const t = frameTime(i, fps);
      expect(frameIndexAt(t, fps)).toBe(i);
      expect(frameIndexAt(t - 1, fps)).toBe(i - 1);
    }
  });

  it("finds the frame showing between frame boundaries", () => {
    expect(frameIndexAt(33_332, 30)).toBe(0);
    expect(frameIndexAt(33_333, 30)).toBe(1);
    expect(frameIndexAt(50_000, 30)).toBe(1);
  });

  it("counts frames covering a duration", () => {
    expect(frameCount(0, 30)).toBe(0);
    expect(frameCount(1, 30)).toBe(1);
    expect(frameCount(1_000_000, 30)).toBe(30);
    expect(frameCount(1_000_001, 30)).toBe(31);
    expect(frameCount(30_000_000, 60)).toBe(1800);
  });
});

describe("clampTime", () => {
  it("clamps into range", () => {
    expect(clampTime(-5, 0, 10)).toBe(0);
    expect(clampTime(15, 0, 10)).toBe(10);
    expect(clampTime(5, 0, 10)).toBe(5);
  });
});
