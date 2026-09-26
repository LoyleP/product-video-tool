import { describe, expect, it } from "vitest";
import { blurRadiusPx, dimAmount, intensityFromBlurPx, intensityFromDim } from "@/engine/layers/effects";
import { normalizeHex, roundToStep } from "@/editor/inspector/fields";
import { fromSeconds, maxPaddingPx, paddingToPx, pxToPadding, toSeconds } from "@/editor/inspector/units";

const canvas = { width: 1920, height: 1080, fps: 30 as const };

describe("unit conversions", () => {
  it("shows padding in pixels of the shorter side and takes it back", () => {
    expect(paddingToPx(0.08, canvas)).toBe(86);
    expect(pxToPadding(108, canvas)).toBeCloseTo(0.1);
    expect(paddingToPx(pxToPadding(200, canvas), canvas)).toBe(200);
    expect(maxPaddingPx(canvas)).toBe(486);
  });

  it("converts seconds to integer microseconds", () => {
    expect(fromSeconds(1.23)).toBe(1_230_000);
    expect(Number.isInteger(fromSeconds(0.1 + 0.2))).toBe(true);
    expect(toSeconds(2_500_000)).toBe(2.5);
  });

  it("maps blur radius and spotlight dimming to the stored strength and back", () => {
    expect(blurRadiusPx(0)).toBe(4);
    expect(blurRadiusPx(1)).toBe(30);
    expect(intensityFromBlurPx(17)).toBeCloseTo(0.5);
    expect(blurRadiusPx(intensityFromBlurPx(12))).toBeCloseTo(12);
    expect(intensityFromBlurPx(500)).toBe(1);
    expect(dimAmount(0.5)).toBeCloseTo(0.5);
    expect(intensityFromDim(dimAmount(0.3))).toBeCloseTo(0.3);
    expect(intensityFromDim(0)).toBe(0);
  });
});

describe("field helpers", () => {
  it("rounds to a step's precision", () => {
    expect(roundToStep(0.1 + 0.2, 0.01)).toBe(0.3);
    expect(roundToStep(12.6, 1)).toBe(13);
    expect(roundToStep(2.345, 0.1)).toBe(2.3);
  });

  it("normalizes hex colors", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("1d4ed8")).toBe("#1d4ed8");
    expect(normalizeHex(" #FFFFFF ")).toBe("#ffffff");
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
  });
});
