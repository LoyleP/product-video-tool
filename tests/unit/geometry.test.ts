import { describe, expect, it } from "vitest";
import { gradientLine, mediaRect } from "@/engine/geometry";

const canvas = { width: 1920, height: 1080 };

describe("mediaRect", () => {
  it("fills the canvas with no padding and matching aspect", () => {
    expect(mediaRect(canvas, { width: 1280, height: 720 }, 0)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it("insets by padding times the shorter canvas side", () => {
    const r = mediaRect(canvas, { width: 1920, height: 1080 }, 0.1);
    // inset 108 on each side: available 1704 x 864, height-limited
    expect(r.h).toBeCloseTo(864);
    expect(r.w).toBeCloseTo(1536);
    expect(r.x).toBeCloseTo(192);
    expect(r.y).toBeCloseTo(108);
  });

  it("fits a portrait phone recording by height, centered", () => {
    const r = mediaRect(canvas, { width: 1179, height: 2556 }, 0.08);
    const inset = 0.08 * 1080;
    expect(r.h).toBeCloseTo(1080 - 2 * inset);
    expect(r.w / r.h).toBeCloseTo(1179 / 2556);
    expect(r.x + r.w / 2).toBeCloseTo(960);
    expect(r.y).toBeCloseTo(inset);
  });

  it("collapses to an empty rect for degenerate sizes", () => {
    expect(mediaRect(canvas, { width: 0, height: 100 }, 0).w).toBe(0);
    expect(mediaRect(canvas, { width: 100, height: 100 }, 0.5).w).toBe(0);
  });
});

describe("gradientLine", () => {
  const size = { width: 200, height: 100 };

  it("0deg runs bottom to top through the center", () => {
    const l = gradientLine(size, 0);
    expect(l.x0).toBeCloseTo(100);
    expect(l.x1).toBeCloseTo(100);
    expect(l.y0).toBeCloseTo(100);
    expect(l.y1).toBeCloseTo(0);
  });

  it("90deg runs left to right", () => {
    const l = gradientLine(size, 90);
    expect(l.x0).toBeCloseTo(0);
    expect(l.x1).toBeCloseTo(200);
    expect(l.y0).toBeCloseTo(50);
  });

  it("diagonals reach the corners like CSS", () => {
    // For 45deg on a 200x100 box, CSS gradient length is |200 sin45| + |100 cos45|.
    const l = gradientLine(size, 45);
    const length = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    expect(length).toBeCloseTo(300 * Math.SQRT1_2);
  });
});
