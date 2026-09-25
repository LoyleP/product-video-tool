import { produce, type Draft } from "immer";
import { describe, expect, it } from "vitest";
import { createProjectFromVideo } from "@/schema/defaults";
import { BUILT_IN_PRESETS, presetFromProject } from "@/schema/presets";
import type { Project } from "@/schema/project";
import {
  addGesture,
  addText,
  applyPreset,
  deleteGesture,
  deleteText,
  MAX_TEXT_TRACKS,
  moveText,
  updateGesture,
  updateText,
} from "@/store/edits";

function project(): Project {
  let n = 0;
  return createProjectFromVideo({
    id: "p",
    now: "2026-01-01T00:00:00.000Z",
    sourceFps: 30,
    newId: () => `id-${++n}`,
    asset: {
      id: "a",
      kind: "video",
      name: "a.mp4",
      storage: { type: "opfs", path: "assets/a.mp4" },
      width: 1920,
      height: 1080,
      duration: 10_000_000,
      hasAudio: false,
      codec: "avc",
      isVariableFrameRate: false,
    },
  });
}

function edit(p: Project, fn: (d: Draft<Project>) => unknown) {
  let result: unknown;
  const next = produce(p, (d) => {
    result = fn(d);
  });
  return [result, next] as const;
}

const layers = (p: Project) => p.textTracks.flatMap((t) => t.layers);

describe("text layers", () => {
  it("adds a 3 s layer on a new track, clipped to the project end", () => {
    const [ok, p] = edit(project(), (d) => addText(d, 1_000_000, "t1", "tr1", 10_000_000));
    expect(ok).toBe(true);
    expect(p.textTracks).toHaveLength(1);
    expect(layers(p)[0]).toMatchObject({ start: 1_000_000, end: 4_000_000 });
    const [, late] = edit(project(), (d) => addText(d, 9_000_000, "t", "tr", 10_000_000));
    expect(layers(late)[0]!.end).toBe(10_000_000);
  });

  it("stacks overlapping layers on new tracks, up to five", () => {
    let p = project();
    for (let i = 0; i < MAX_TEXT_TRACKS; i++) [, p] = edit(p, (d) => addText(d, 0, `t${i}`, `tr${i}`, 10_000_000));
    expect(p.textTracks).toHaveLength(MAX_TEXT_TRACKS);
    expect(edit(p, (d) => addText(d, 0, "x", "trx", 10_000_000))[0]).toBe(false);
    // A non-overlapping layer reuses the first track.
    const [, later] = edit(p, (d) => addText(d, 5_000_000, "t9", "tr9", 10_000_000));
    expect(later.textTracks[0]!.layers).toHaveLength(2);
  });

  it("copies the look of the latest layer", () => {
    let [, p] = edit(project(), (d) => addText(d, 0, "a", "tr", 10_000_000));
    [, p] = edit(p, (d) => updateText(d, "a", { color: "#ff0000", font: { size: 90 } }));
    [, p] = edit(p, (d) => addText(d, 5_000_000, "b", "tr2", 10_000_000));
    expect(layers(p)[1]).toMatchObject({ color: "#ff0000", font: { size: 90 } });
  });

  it("merges nested patches, clamps the box, and rejects overlaps on a track", () => {
    let [, p] = edit(project(), (d) => addText(d, 0, "a", "tr", 10_000_000));
    [, p] = edit(p, (d) => addText(d, 5_000_000, "b", "tr2", 10_000_000));
    const [, moved] = edit(p, (d) => updateText(d, "a", { box: { x: 0.3, w: 0.01 } }));
    expect(layers(moved)[0]!.box).toMatchObject({ x: 0.3, w: 0.05, y: 0.78 });
    expect(edit(p, (d) => updateText(d, "a", { end: 6_000_000 }))[0]).toBe(false);
    expect(edit(p, (d) => moveText(d, "b", 1_000_000))[1].textTracks[0]!.layers[1]!.start).toBe(3_000_000);
  });

  it("deletes", () => {
    const [, p] = edit(project(), (d) => addText(d, 0, "a", "tr", 10_000_000));
    expect(layers(edit(p, (d) => deleteText(d, "a"))[1])).toHaveLength(0);
  });
});

describe("gestures", () => {
  it("adds, clamps to the media, converts to swipes and deletes", () => {
    let [, p] = edit(project(), (d) =>
      addGesture(d, { id: "g", time: 1_000_000, type: "tap", from: { x: 1.5, y: -1 }, style: "ripple" }),
    );
    expect(p.gestures[0]!.from).toEqual({ x: 1, y: 0 });
    [, p] = edit(p, (d) => updateGesture(d, "g", { type: "swipe", from: { x: 0.2, y: 0.5 } }));
    expect(p.gestures[0]!.to).toEqual({ x: expect.closeTo(0.4), y: 0.5 });
    expect(edit(p, (d) => deleteGesture(d, "g"))[1].gestures).toHaveLength(0);
  });
});

describe("presets", () => {
  it("ships eight original presets with distinct ids", () => {
    expect(BUILT_IN_PRESETS).toHaveLength(8);
    expect(new Set(BUILT_IN_PRESETS.map((p) => p.id)).size).toBe(8);
  });

  it("applies style and text style, and round-trips a saved preset", () => {
    let [, p] = edit(project(), (d) => addText(d, 0, "a", "tr", 10_000_000));
    const paper = BUILT_IN_PRESETS.find((x) => x.id === "paper")!;
    [, p] = edit(p, (d) => applyPreset(d, paper));
    expect(p.style.background).toEqual(paper.style.background);
    expect(layers(p)[0]).toMatchObject({ color: paper.text!.color, font: { family: paper.text!.family } });

    const saved = presetFromProject("mine", "Mine", p.style, layers(p)[0]);
    const [, other] = edit(project(), (d) => applyPreset(d, BUILT_IN_PRESETS[0]!));
    const [, restored] = edit(other, (d) => applyPreset(d, saved));
    expect(restored.style).toEqual(p.style);
  });
});
