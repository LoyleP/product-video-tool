import { describe, expect, it } from "vitest";
import { clipAt, clipDuration, clipEnd, sourceTimeAt } from "@/engine/timeline";
import type { Clip, VideoTrack } from "@/schema/project";

const clip = (over: Partial<Clip>): Clip => ({
  id: "c",
  assetId: "a",
  timelineStart: 0,
  sourceIn: 0,
  sourceOut: 10_000_000,
  speed: 1,
  muted: false,
  ...over,
});

describe("clip time mapping", () => {
  it("applies speed to duration", () => {
    expect(clipDuration(clip({ speed: 2 }))).toBe(5_000_000);
    expect(clipDuration(clip({ speed: 0.5 }))).toBe(20_000_000);
    expect(clipEnd(clip({ timelineStart: 1_000_000, speed: 2 }))).toBe(6_000_000);
  });

  it("maps timeline time to source time", () => {
    const c = clip({ timelineStart: 2_000_000, sourceIn: 500_000, speed: 2 });
    expect(sourceTimeAt(c, 2_000_000)).toBe(500_000);
    expect(sourceTimeAt(c, 3_000_000)).toBe(2_500_000);
  });

  it("keeps source times integer for fractional speeds", () => {
    expect(Number.isInteger(sourceTimeAt(clip({ speed: 1 / 3 }), 1_000_001))).toBe(true);
  });

  it("finds the clip at a time, end exclusive", () => {
    const a = clip({ id: "a", timelineStart: 0, sourceOut: 1_000_000 });
    const b = clip({ id: "b", timelineStart: 1_000_000, sourceOut: 1_000_000 });
    const track: VideoTrack = { id: "t", hidden: false, clips: [a, b] };
    expect(clipAt(track, 0)?.id).toBe("a");
    expect(clipAt(track, 999_999)?.id).toBe("a");
    expect(clipAt(track, 1_000_000)?.id).toBe("b");
    expect(clipAt(track, 2_000_000)).toBeNull();
    expect(clipAt(track, -1)).toBeNull();
  });
});
