import { describe, expect, it } from "vitest";
import { placeBuffer } from "@/engine/audio/schedule";
import type { Clip } from "@/schema/project";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c",
  assetId: "a",
  timelineStart: 0,
  sourceIn: 0,
  sourceOut: 10_000_000,
  speed: 1,
  muted: false,
  ...over,
});
const all = { start: 0, end: Number.MAX_SAFE_INTEGER };

describe("placeBuffer", () => {
  it("places an untrimmed buffer at its own time", () => {
    expect(placeBuffer(clip(), { start: 1_000_000, duration: 20_000 }, all)).toEqual({
      at: 1_000_000,
      offset: 0,
      sourceDuration: 20_000,
    });
  });

  it("crops the start of a buffer straddling the trim in point", () => {
    const c = clip({ sourceIn: 2_010_000 });
    expect(placeBuffer(c, { start: 2_000_000, duration: 20_000 }, all)).toEqual({
      at: 0,
      offset: 10_000,
      sourceDuration: 10_000,
    });
  });

  it("crops the end at the trim out point", () => {
    const c = clip({ sourceOut: 5_005_000 });
    expect(placeBuffer(c, { start: 5_000_000, duration: 20_000 }, all)?.sourceDuration).toBe(5_000);
    expect(placeBuffer(c, { start: 5_005_000, duration: 20_000 }, all)).toBeNull();
  });

  it("drops buffers before the clip's source in point", () => {
    expect(placeBuffer(clip({ sourceIn: 3_000_000 }), { start: 0, duration: 20_000 }, all)).toBeNull();
  });

  it("maps through timelineStart and speed", () => {
    const c = clip({ timelineStart: 1_000_000, sourceIn: 500_000, speed: 2 });
    expect(placeBuffer(c, { start: 2_500_000, duration: 40_000 }, all)).toEqual({
      at: 2_000_000,
      offset: 0,
      sourceDuration: 40_000,
    });
  });

  it("crops to the playback window, e.g. when starting playback mid-buffer", () => {
    const placed = placeBuffer(clip(), { start: 1_000_000, duration: 40_000 }, { start: 1_030_000, end: 2_000_000 });
    expect(placed).toEqual({ at: 1_030_000, offset: 30_000, sourceDuration: 10_000 });
    expect(placeBuffer(clip(), { start: 0, duration: 40_000 }, { start: 1_000_000, end: 2_000_000 })).toBeNull();
  });

  it("crops to the window end for export ranges", () => {
    const placed = placeBuffer(clip(), { start: 990_000, duration: 20_000 }, { start: 0, end: 1_000_000 });
    expect(placed).toEqual({ at: 990_000, offset: 0, sourceDuration: 10_000 });
  });
});
