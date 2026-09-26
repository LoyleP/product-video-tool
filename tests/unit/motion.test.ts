import { describe, expect, it } from "vitest";
import { diffFrames, toGray, type MotionStep } from "@/engine/analysis/frame-diff";
import { activityWindows, classifyStep, DEFAULT_ANALYSIS, proposeZooms } from "@/engine/analysis/proposals";

const W = 160;
const H = 90;
const INTERVAL = 100_000; // 10 fps

type Rect = { x: number; y: number; w: number; h: number };

/** A dark frame with bright rectangles (pixel units). */
function frame(rects: Rect[] = [], shift = 0): Uint8Array {
  const f = new Uint8Array(W * H).fill(40);
  // A textured background so a scroll (shift) changes most pixels.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y + shift) % 7 === 0) f[y * W + x] = 90;
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) f[y * W + x] = 230;
  }
  return f;
}

/** Diffs a sequence of frames into motion steps at 10 fps. */
function steps(frames: Uint8Array[]): MotionStep[] {
  const out: MotionStep[] = [];
  for (let i = 1; i < frames.length; i++) out.push(diffFrames(frames[i - 1]!, frames[i]!, W, H, i * INTERVAL));
  return out;
}

/** Simulated typing: text grows one character per frame inside a field at (x, y). */
function typing(x: number, y: number, count: number, pauseEvery = 0): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let chars = 0;
  for (let i = 0; i < count; i++) {
    if (!(pauseEvery && i % pauseEvery === 0)) chars++;
    frames.push(frame([{ x, y, w: Math.min(chars * 2, 40), h: 5 }]));
  }
  return frames;
}

const idle = (n: number) => Array.from({ length: n }, () => frame());
const range = { start: 0, end: 60_000_000 };

describe("diffFrames", () => {
  it("finds the box and centroid of what changed", () => {
    const step = diffFrames(frame(), frame([{ x: 16, y: 9, w: 16, h: 9 }]), W, H, 0);
    expect(step.bbox).toEqual({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 });
    expect(step.centroid!.x).toBeCloseTo(0.15);
    expect(step.changed).toBeCloseTo(0.01);
  });

  it("reports nothing for identical frames or changes under the threshold", () => {
    expect(diffFrames(frame(), frame(), W, H, 0).bbox).toBeNull();
    const a = frame();
    const b = a.map((v) => v + 10);
    expect(diffFrames(a, b, W, H, 0).changed).toBe(0);
  });

  it("converts RGBA to luma", () => {
    const gray = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(gray[0]).toBeGreaterThan(250);
    expect(gray[1]).toBe(0);
  });
});

describe("classifyStep", () => {
  it("separates noise, local activity, mixed and full-frame changes", () => {
    const at = (bbox: Rect | null, changed: number): MotionStep => ({
      time: 0,
      changed,
      bbox: bbox && { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
      centroid: bbox && { x: 0.5, y: 0.5 },
    });
    expect(classifyStep(at(null, 0))).toBe("idle");
    expect(classifyStep(at({ x: 0, y: 0, w: 0.01, h: 0.01 }, 0.0001))).toBe("idle");
    expect(classifyStep(at({ x: 0, y: 0, w: 0.3, h: 0.3 }, 0.05))).toBe("local");
    expect(classifyStep(at({ x: 0, y: 0, w: 0.7, h: 0.7 }, 0.2))).toBe("mixed");
    expect(classifyStep(at({ x: 0, y: 0, w: 1, h: 1 }, 0.5))).toBe("full");
  });
});

describe("proposeZooms", () => {
  it("proposes a zoom on typing, focused on the field", () => {
    const frames = [...idle(10), ...typing(20, 60, 20), ...idle(20)];
    const proposals = proposeZooms(steps(frames), INTERVAL, range);
    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    // The field spans x 20..60 px, y 60..65 px: center near (0.25, 0.69).
    expect(p.focus.x).toBeGreaterThan(0.12);
    expect(p.focus.x).toBeLessThan(0.4);
    expect(p.focus.y).toBeCloseTo(62.5 / H, 1);
    expect(p.scale).toBe(2.5); // a small area zooms in the most
    // Starts before the typing (lead-in) and holds after it.
    expect(p.start).toBeLessThan(10 * INTERVAL);
    expect(p.end).toBeGreaterThan(30 * INTERVAL);
  });

  it("ignores scrolls and page transitions", () => {
    const scroll = Array.from({ length: 30 }, (_, i) => frame([], i * 3));
    expect(proposeZooms(steps(scroll), INTERVAL, range)).toEqual([]);
  });

  it("ignores tiny noise such as a blinking caret", () => {
    const blink = Array.from({ length: 40 }, (_, i) => frame(i % 2 ? [{ x: 80, y: 40, w: 1, h: 3 }] : []));
    expect(proposeZooms(steps(blink), INTERVAL, range)).toEqual([]);
  });

  it("ignores bursts shorter than 400 ms", () => {
    // Three keystrokes, then the typed text stays on screen.
    const typed = typing(20, 20, 3);
    const burst = [...idle(5), ...typed, ...Array.from({ length: 20 }, () => typed[typed.length - 1]!)];
    expect(proposeZooms(steps(burst), INTERVAL, range)).toEqual([]);
  });

  it("keeps one window through short pauses between keystrokes", () => {
    const frames = [...idle(5), ...typing(20, 20, 30, 3), ...idle(20)];
    expect(activityWindows(steps(frames), INTERVAL)).toHaveLength(1);
  });

  it("merges nearby bursts in the same place, and keeps distant ones apart", () => {
    const near = [...idle(5), ...typing(20, 20, 8), ...idle(4), ...typing(20, 20, 8), ...idle(20)];
    expect(proposeZooms(steps(near), INTERVAL, range)).toHaveLength(1);
    const far = [...idle(5), ...typing(10, 10, 8), ...idle(4), ...typing(110, 70, 8), ...idle(20)];
    expect(proposeZooms(steps(far), INTERVAL, range)).toHaveLength(2);
  });

  it("scales between 1.4x and 2.5x from the activity size", () => {
    const wide = [...idle(3), ...Array.from({ length: 10 }, (_, i) => frame([{ x: 0, y: 30, w: 80, h: 10 + (i % 2) }])), ...idle(10)];
    const p = proposeZooms(steps(wide), INTERVAL, range)[0]!;
    expect(p.scale).toBe(1.4); // bbox width 0.5 -> 0.7 / 0.5 = 1.4
  });

  it("keeps proposals inside the range and non-overlapping", () => {
    const frames = [...typing(10, 10, 10), ...idle(2), ...typing(120, 70, 10), ...idle(3)];
    const proposals = proposeZooms(steps(frames), INTERVAL, { start: 0, end: 2_400_000 });
    for (const p of proposals) {
      expect(p.start).toBeGreaterThanOrEqual(0);
      expect(p.end).toBeLessThanOrEqual(2_400_000);
    }
    for (let i = 1; i < proposals.length; i++) expect(proposals[i]!.start).toBeGreaterThanOrEqual(proposals[i - 1]!.end);
  });

  it("uses the documented defaults", () => {
    expect(DEFAULT_ANALYSIS).toMatchObject({ fullArea: 0.6, localArea: 0.35, minWindow: 400_000, mergeGap: 700_000 });
  });
});
