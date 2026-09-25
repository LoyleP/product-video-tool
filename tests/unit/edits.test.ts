import { produce, type Draft } from "immer";
import { describe, expect, it } from "vitest";
import { clipEnd, projectDuration, sourceTimeAt } from "@/engine/timeline";
import { createProjectFromVideo } from "@/schema/defaults";
import type { MediaAsset, Project } from "@/schema/project";
import {
  addZoom,
  appendVideo,
  deleteClip,
  deleteZoom,
  MIN_CLIP_DURATION,
  moveClip,
  moveZoom,
  setClipSource,
  setClipSpeed,
  splitClip,
  trimClipEdge,
  updateZoom,
  zoomsOverlap,
} from "@/store/edits";

const asset = (id: string, duration = 10_000_000): MediaAsset => ({
  id,
  kind: "video",
  name: `${id}.mp4`,
  storage: { type: "opfs", path: `assets/${id}.mp4` },
  width: 1920,
  height: 1080,
  duration,
  hasAudio: true,
  codec: "avc",
  isVariableFrameRate: false,
});

function project(): Project {
  let n = 0;
  return createProjectFromVideo({
    id: "p",
    now: "2026-01-01T00:00:00.000Z",
    sourceFps: 30,
    newId: () => `id-${++n}`,
    asset: asset("a"),
  });
}

/** Applies an edit and returns [accepted, result]. */
function edit(p: Project, fn: (draft: Draft<Project>) => unknown) {
  let accepted: unknown;
  const next = produce(p, (d) => {
    accepted = fn(d);
  });
  return [accepted, next] as const;
}

const clips = (p: Project) => p.videoTracks[0]!.clips;

describe("splitClip", () => {
  it("splits into two clips that play back identically", () => {
    const p = project();
    const [ok, next] = edit(p, (d) => splitClip(d, 4_000_000, "new"));
    expect(ok).toBe(true);
    const [a, b] = clips(next);
    expect(a).toMatchObject({ sourceIn: 0, sourceOut: 4_000_000, timelineStart: 0 });
    expect(b).toMatchObject({ id: "new", sourceIn: 4_000_000, sourceOut: 10_000_000, timelineStart: 4_000_000 });
    expect(projectDuration(next)).toBe(projectDuration(p));
    for (const t of [0, 3_999_999, 4_000_000, 9_999_999]) {
      const clip = clips(next).find((c) => t >= c.timelineStart && t < clipEnd(c))!;
      expect(sourceTimeAt(clip, t)).toBe(t);
    }
  });

  it("respects speed when splitting", () => {
    const [, sped] = edit(project(), (d) => setClipSpeed(d, clips(project())[0]!.id, 2));
    const [, next] = edit(sped, (d) => splitClip(d, 1_000_000, "new"));
    expect(clips(next)[0]!.sourceOut).toBe(2_000_000);
    expect(clips(next)[1]).toMatchObject({ timelineStart: 1_000_000, sourceIn: 2_000_000 });
  });

  it("rejects splits at edges or too close to them", () => {
    const p = project();
    expect(edit(p, (d) => splitClip(d, 0, "x"))[0]).toBe(false);
    expect(edit(p, (d) => splitClip(d, 10_000_000, "x"))[0]).toBe(false);
    expect(edit(p, (d) => splitClip(d, MIN_CLIP_DURATION - 1, "x"))[0]).toBe(false);
  });
});

describe("setClipSpeed", () => {
  it("changes length and ripples later clips", () => {
    const [, two] = edit(project(), (d) => appendVideo(d, asset("b", 5_000_000), "c2"));
    const first = clips(two)[0]!.id;
    const [, fast] = edit(two, (d) => setClipSpeed(d, first, 2));
    expect(clipEnd(clips(fast)[0]!)).toBe(5_000_000);
    expect(clips(fast)[1]!.timelineStart).toBe(5_000_000);
    const [, slow] = edit(two, (d) => setClipSpeed(d, first, 0.5));
    expect(clips(slow)[1]!.timelineStart).toBe(20_000_000);
  });

  it("clamps to 0.25x..8x", () => {
    const p = project();
    const id = clips(p)[0]!.id;
    expect(clips(edit(p, (d) => setClipSpeed(d, id, 100))[1])[0]!.speed).toBe(8);
    expect(clips(edit(p, (d) => setClipSpeed(d, id, 0))[1])[0]!.speed).toBe(0.25);
  });
});

describe("moveClip and trimClipEdge", () => {
  function twoClips() {
    const [, p] = edit(project(), (d) => appendVideo(d, asset("b", 5_000_000), "c2"));
    const [, split] = edit(p, (d) => splitClip(d, 5_000_000, "c1b"));
    return split; // clips at 0-5s, 5-10s (same asset), 10-15s (b)
  }

  it("clamps moves between neighbors and zero", () => {
    const p = twoClips();
    const [, left] = edit(p, (d) => deleteClip(d, clips(p)[0]!.id));
    expect(edit(left, (d) => moveClip(d, "c1b", -5))[1].videoTracks[0]!.clips[0]!.timelineStart).toBe(0);
    expect(edit(p, (d) => moveClip(d, "c1b", 7_000_000))[0]).toBe(false); // no room
    const [, gap] = edit(p, (d) => deleteClip(d, clips(p)[0]!.id));
    const [, moved] = edit(gap, (d) => moveClip(d, "c1b", 2_000_000));
    expect(clips(moved)[0]!.timelineStart).toBe(2_000_000);
  });

  it("trims the start edge, keeping the end fixed", () => {
    const p = project();
    const id = clips(p)[0]!.id;
    const [, next] = edit(p, (d) => trimClipEdge(d, id, "start", 2_000_000));
    expect(clips(next)[0]).toMatchObject({ timelineStart: 2_000_000, sourceIn: 2_000_000, sourceOut: 10_000_000 });
  });

  it("does not extend a start edge before the source begins or into the previous clip", () => {
    const p = twoClips();
    expect(edit(p, (d) => trimClipEdge(d, "c1b", "start", 3_000_000))[0]).toBe(false);
    const [, trimmed] = edit(p, (d) => trimClipEdge(d, "c1b", "start", 6_000_000));
    expect(clips(trimmed)[1]).toMatchObject({ timelineStart: 6_000_000, sourceIn: 6_000_000 });
    const [, back] = edit(trimmed, (d) => trimClipEdge(d, "c1b", "start", 0));
    expect(clips(back)[1]).toMatchObject({ timelineStart: 5_000_000, sourceIn: 5_000_000 });
  });

  it("trims the end edge within the source and before the next clip", () => {
    const p = twoClips();
    const first = clips(p)[0]!.id;
    const [, shorter] = edit(p, (d) => trimClipEdge(d, first, "end", 3_000_000));
    expect(clips(shorter)[0]!.sourceOut).toBe(3_000_000);
    expect(edit(p, (d) => trimClipEdge(d, first, "end", 8_000_000))[0]).toBe(false);
    const [, min] = edit(p, (d) => trimClipEdge(d, first, "end", 0));
    expect(clips(min)[0]!.sourceOut).toBe(MIN_CLIP_DURATION);
  });

  it("sets source in and out directly without overlapping the next clip", () => {
    const p = twoClips();
    const first = clips(p)[0]!.id;
    const [, next] = edit(p, (d) => setClipSource(d, first, 1_000_000, 9_000_000));
    expect(clips(next)[0]).toMatchObject({ sourceIn: 1_000_000, sourceOut: 6_000_000 });
  });

  it("keeps at least one clip", () => {
    const p = project();
    expect(edit(p, (d) => deleteClip(d, clips(p)[0]!.id))[0]).toBe(false);
  });

  it("appends a new video at the end", () => {
    const [, next] = edit(project(), (d) => appendVideo(d, asset("b", 3_000_000), "c2"));
    expect(clips(next)[1]).toMatchObject({ assetId: "b", timelineStart: 10_000_000, sourceOut: 3_000_000 });
    expect(next.assets.b).toBeDefined();
  });
});

describe("zooms", () => {
  it("adds a 2 s zoom at the playhead, shortened to fit", () => {
    const p = project();
    const [, one] = edit(p, (d) => addZoom(d, 1_000_000, "z1", 10_000_000));
    expect(one.zooms[0]).toMatchObject({ start: 1_000_000, end: 3_000_000, scale: 2, origin: "manual" });
    const [, two] = edit(one, (d) => addZoom(d, 0, "z0", 10_000_000));
    expect(two.zooms[0]).toMatchObject({ id: "z0", start: 0, end: 1_000_000 });
    const [, atEnd] = edit(p, (d) => addZoom(d, 9_500_000, "z", 10_000_000));
    expect(atEnd.zooms[0]!.end).toBe(10_000_000);
  });

  it("rejects zooms inside another zoom or too short to fit", () => {
    const [, one] = edit(project(), (d) => addZoom(d, 1_000_000, "z1", 10_000_000));
    expect(edit(one, (d) => addZoom(d, 2_000_000, "z2", 10_000_000))[0]).toBeNull();
    expect(edit(one, (d) => addZoom(d, 900_000, "z2", 10_000_000))[0]).toBeNull();
    expect(edit(project(), (d) => addZoom(d, 9_900_000, "z", 10_000_000))[0]).toBeNull();
  });

  it("rejects updates that overlap, and clamps scale and focus", () => {
    let [, p] = edit(project(), (d) => addZoom(d, 0, "a", 10_000_000));
    [, p] = edit(p, (d) => addZoom(d, 5_000_000, "b", 10_000_000));
    expect(edit(p, (d) => updateZoom(d, "a", { end: 6_000_000 }))[0]).toBe(false);
    const [, next] = edit(p, (d) => updateZoom(d, "a", { scale: 10, focus: { x: -1, y: 2 } }));
    expect(next.zooms[0]).toMatchObject({ scale: 4, focus: { x: 0, y: 1 } });
    expect(zoomsOverlap(next.zooms)).toBe(false);
  });

  it("moves between neighbors and deletes", () => {
    let [, p] = edit(project(), (d) => addZoom(d, 0, "a", 10_000_000));
    [, p] = edit(p, (d) => addZoom(d, 5_000_000, "b", 10_000_000));
    const [, moved] = edit(p, (d) => moveZoom(d, "b", 1_000_000));
    expect(moved.zooms[1]).toMatchObject({ id: "b", start: 2_000_000, end: 4_000_000 });
    const [, gone] = edit(p, (d) => deleteZoom(d, "a"));
    expect(gone.zooms.map((z) => z.id)).toEqual(["b"]);
  });
});
