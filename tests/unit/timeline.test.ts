import { describe, expect, it } from "vitest";
import { activeClips, clipAt, clipDuration, clipEnd, exportRange, projectDuration, sourceTimeAt } from "@/engine/timeline";
import type { Clip, Project, VideoTrack } from "@/schema/project";

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

describe("project-level timing", () => {
  const project = (clips: Clip[], range: Project["export"]["range"] = null) =>
    ({ videoTracks: [{ id: "t", hidden: false, clips }], export: { range } }) as unknown as Project;

  it("measures duration from the last clip end", () => {
    expect(projectDuration(project([]))).toBe(0);
    expect(projectDuration(project([clip({ sourceIn: 1_000_000, sourceOut: 4_000_000 })]))).toBe(3_000_000);
  });

  it("exports the whole project by default and clamps explicit ranges", () => {
    const p = project([clip({ sourceOut: 5_000_000 })]);
    expect(exportRange(p)).toEqual({ start: 0, end: 5_000_000 });
    const ranged = project([clip({ sourceOut: 5_000_000 })], { start: 1_000_000, end: 9_000_000 });
    expect(exportRange(ranged)).toEqual({ start: 1_000_000, end: 5_000_000 });
  });

  it("lists active clips with their source time", () => {
    const p = project([clip({ sourceIn: 2_000_000, sourceOut: 5_000_000 })]);
    expect(activeClips(p, 1_000_000)).toEqual([
      { clip: p.videoTracks[0]!.clips[0], track: p.videoTracks[0], sourceTime: 3_000_000 },
    ]);
    expect(activeClips(p, 3_000_000)).toEqual([]);
  });
});
