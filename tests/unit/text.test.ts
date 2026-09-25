import { describe, expect, it } from "vitest";
import { gestureProgress, GESTURE_DURATION } from "@/engine/layers/gestures";
import { textAppearance } from "@/engine/layers/text";
import { canvasFont, DEFAULT_FONT_FAMILY } from "@/engine/text/fonts";
import { wrapText } from "@/engine/text/wrap";
import type { Gesture, TextLayer } from "@/schema/project";

const measure = (s: string) => s.length * 10;

describe("wrapText", () => {
  it("wraps words to the width", () => {
    expect(wrapText("hello big world", 100, measure)).toEqual(["hello big", "world"]);
    expect(wrapText("hello", 100, measure)).toEqual(["hello"]);
  });

  it("keeps explicit newlines and blank lines", () => {
    expect(wrapText("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
  });

  it("breaks words longer than a line", () => {
    expect(wrapText("abcdefghijkl", 50, measure)).toEqual(["abcde", "fghij", "kl"]);
    expect(wrapText("ab abcdefghijkl", 50, measure)).toEqual(["ab", "abcde", "fghij", "kl"]);
  });

  it("reflows when the box width changes", () => {
    const text = "one two three four";
    expect(wrapText(text, 200, measure)).toHaveLength(1);
    expect(wrapText(text, 90, measure)).toEqual(["one two", "three", "four"]);
  });
});

describe("canvasFont", () => {
  it("clamps weight to the font's range and falls back for unknown families", () => {
    expect(canvasFont("Studio Space Grotesk", 900, 64)).toBe('700 64px "Studio Space Grotesk", sans-serif');
    expect(canvasFont("Nope", 400, 10)).toBe(`400 10px "${DEFAULT_FONT_FAMILY}", sans-serif`);
  });
});

const layer = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: "t",
  start: 1_000_000,
  end: 4_000_000,
  text: "Hi",
  box: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 },
  font: { family: DEFAULT_FONT_FAMILY, size: 72, weight: 600, lineHeight: 1.2, letterSpacing: 0 },
  color: "#fff",
  align: "center",
  animIn: { type: "fade", duration: 400_000 },
  animOut: { type: "slide-up", duration: 400_000 },
  ...over,
});

describe("textAppearance", () => {
  it("is hidden outside its time range", () => {
    expect(textAppearance(layer(), 999_999)).toBeNull();
    expect(textAppearance(layer(), 4_000_000)).toBeNull();
  });

  it("fades in and slides out", () => {
    expect(textAppearance(layer(), 1_000_000)!.opacity).toBe(0);
    expect(textAppearance(layer(), 1_200_000)!.opacity).toBeGreaterThan(0.5);
    expect(textAppearance(layer(), 2_000_000)).toEqual({ opacity: 1, offsetY: 0, scale: 1 });
    const out = textAppearance(layer(), 3_900_000)!;
    expect(out.opacity).toBeLessThan(1);
    expect(out.offsetY).toBeGreaterThan(0);
  });

  it("scales in and shows instantly with no animation", () => {
    const scaled = textAppearance(layer({ animIn: { type: "scale", duration: 400_000 } }), 1_000_000)!;
    expect(scaled.scale).toBeCloseTo(0.9);
    const none = textAppearance(layer({ animIn: { type: "none", duration: 400_000 } }), 1_000_000)!;
    expect(none.opacity).toBe(1);
  });

  it("shortens animations for short layers", () => {
    const short = layer({ start: 0, end: 200_000 });
    expect(textAppearance(short, 100_000)!.opacity).toBeGreaterThan(0.9);
  });
});

describe("gestureProgress", () => {
  const tap: Gesture = { id: "g", time: 1_000_000, type: "tap", from: { x: 0.5, y: 0.5 }, style: "ripple" };
  it("runs for the gesture duration", () => {
    expect(gestureProgress(tap, 999_999)).toBeNull();
    expect(gestureProgress(tap, 1_000_000)).toBe(0);
    expect(gestureProgress(tap, 1_000_000 + GESTURE_DURATION / 2)).toBeCloseTo(0.5);
    expect(gestureProgress(tap, 1_000_000 + GESTURE_DURATION)).toBeNull();
  });
});
