import { describe, expect, it } from "vitest";
import { analyzeFrameTimestamps } from "@/engine/decode/frame-rate";
import { frameTime } from "@/engine/time";

const cfr = (fps: number, n: number) => Array.from({ length: n }, (_, i) => frameTime(i, fps));

describe("analyzeFrameTimestamps", () => {
  it("measures constant frame rates", () => {
    const r = analyzeFrameTimestamps(cfr(30, 120));
    expect(r.averageFps).toBeCloseTo(30, 1);
    expect(r.isVariableFrameRate).toBe(false);
  });

  it("treats NTSC rounding jitter as constant", () => {
    const ts = Array.from({ length: 200 }, (_, i) => Math.round((i * 1_001_000) / 30));
    const r = analyzeFrameTimestamps(ts);
    expect(r.averageFps).toBeCloseTo(29.97, 1);
    expect(r.isVariableFrameRate).toBe(false);
  });

  it("detects dropped frames in screen recordings", () => {
    const ts = cfr(60, 240).filter((_, i) => i < 20 || i % 4 === 0);
    expect(analyzeFrameTimestamps(ts).isVariableFrameRate).toBe(true);
  });

  it("accepts presentation timestamps in decode order", () => {
    const ts = cfr(30, 60);
    [ts[3], ts[4]] = [ts[4]!, ts[3]!];
    expect(analyzeFrameTimestamps(ts).isVariableFrameRate).toBe(false);
  });

  it("handles too few frames", () => {
    expect(analyzeFrameTimestamps([]).averageFps).toBe(0);
    expect(analyzeFrameTimestamps([0]).isVariableFrameRate).toBe(false);
  });
});
