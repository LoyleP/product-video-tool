import { produce, type Draft } from "immer";
import { describe, expect, it } from "vitest";
import { effectBox, effectOpacity, EFFECT_FADE } from "@/engine/layers/effects";
import type { DrawableFrame, FrameProvider, RenderContext } from "@/engine/frame-provider";
import { renderFrame } from "@/engine/render-frame";
import { createProjectFromVideo } from "@/schema/defaults";
import { projectSchema, type Effect, type Project } from "@/schema/project";
import { addEffect, addZoom, addZoomRange, deleteEffect, moveEffect, splitZoom, updateEffect } from "@/store/edits";
import { migrateProject } from "@/storage/migrations";

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

const spotlight: Effect = {
  id: "e",
  type: "spotlight",
  start: 1_000_000,
  end: 3_000_000,
  rect: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
  intensity: 0.5,
};

describe("effects layer", () => {
  it("fades in and out", () => {
    expect(effectOpacity(spotlight, 999_999)).toBeNull();
    expect(effectOpacity(spotlight, 1_000_000)).toBe(0);
    expect(effectOpacity(spotlight, 1_000_000 + EFFECT_FADE / 2)).toBeCloseTo(0.5);
    expect(effectOpacity(spotlight, 2_000_000)).toBe(1);
    expect(effectOpacity(spotlight, 3_000_000)).toBeNull();
  });

  it("maps its rect onto the recording", () => {
    expect(effectBox(spotlight, { x: 100, y: 50, w: 800, h: 400 })).toEqual({ x: 300, y: 150, w: 400, h: 200 });
  });

  it("draws over the media and under the device frame", () => {
    const events: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_, prop: string) => (...args: unknown[]) => {
          if (prop === "createLinearGradient") return { addColorStop: () => {} };
          if (prop === "fill" && args[0] === "evenodd") events.push("effect-or-frame");
          if (prop === "clip") events.push("clip");
        },
        set: () => true,
      },
    ) as RenderContext;
    const frame: DrawableFrame = { width: 1, height: 1, draw: () => events.push("media") };
    const frames: FrameProvider = { getFrame: () => frame };
    const p = { ...project(), effects: [spotlight] };
    p.style = { ...p.style, device: { frameId: "browser", color: "light" } };
    renderFrame({ ctx, width: 1920, height: 1080 }, p, 2_000_000, frames);
    const media = events.indexOf("media");
    // After the media: the spotlight dims (evenodd), then the device frame cuts its screen hole (evenodd).
    expect(events.slice(media).filter((e) => e === "effect-or-frame").length).toBeGreaterThanOrEqual(2);
  });
});

describe("effect edits", () => {
  it("adds a 3 s centered effect and keeps its box inside the recording", () => {
    const [ok, p] = edit(project(), (d) => addEffect(d, "blur", 1_000_000, "e", 10_000_000));
    expect(ok).toBeTruthy();
    expect(p.effects[0]).toMatchObject({ type: "blur", start: 1_000_000, end: 4_000_000, rect: { x: 0.3, w: 0.4 } });
    const [, moved] = edit(p, (d) => updateEffect(d, "e", { rect: { x: 0.9, y: -1, w: 0.5, h: 0.001 } }));
    expect(moved.effects[0]!.rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.03 });
  });

  it("moves, rejects too-short ranges, and deletes", () => {
    const [, p] = edit(project(), (d) => addEffect(d, "spotlight", 0, "e", 10_000_000));
    expect(edit(p, (d) => moveEffect(d, "e", 5_000_000))[1].effects[0]).toMatchObject({ start: 5_000_000, end: 8_000_000 });
    expect(edit(p, (d) => updateEffect(d, "e", { end: 100_000 }))[0]).toBe(false);
    expect(edit(p, (d) => deleteEffect(d, "e"))[1].effects).toHaveLength(0);
  });

  it("old projects without effects load with none", () => {
    const { effects: _, ...old } = project();
    void _;
    expect(migrateProject(JSON.parse(JSON.stringify(old))).effects).toEqual([]);
    expect(projectSchema.safeParse(project()).success).toBe(true);
  });
});

describe("zoom creation helpers", () => {
  it("snaps a new zoom onto one that just ended so the camera pans", () => {
    let [, p] = edit(project(), (d) => addZoom(d, 0, "a", 10_000_000));
    [, p] = edit(p, (d) => addZoom(d, 2_200_000, "b", 10_000_000));
    expect(p.zooms[1]).toMatchObject({ id: "b", start: 2_000_000 });
  });

  it("creates a zoom from a dragged range, trimmed to free space", () => {
    let [, p] = edit(project(), (d) => addZoom(d, 5_000_000, "a", 10_000_000));
    const [, ranged] = edit(p, (d) => addZoomRange(d, 3_000_000, 1_000_000, "r", 10_000_000));
    expect(ranged.zooms[0]).toMatchObject({ id: "r", start: 1_000_000, end: 3_000_000, transition: 600_000 });
    [, p] = edit(p, (d) => addZoomRange(d, 4_000_000, 6_000_000, "r2", 10_000_000));
    expect(p.zooms.find((z) => z.id === "r2")).toMatchObject({ start: 4_000_000, end: 5_000_000 });
    expect(edit(p, (d) => addZoomRange(d, 5_500_000, 6_500_000, "x", 10_000_000))[0]).toBeNull();
  });

  it("splits a zoom into two back-to-back zooms", () => {
    const [, p] = edit(project(), (d) => addZoom(d, 0, "a", 10_000_000));
    const [ok, split] = edit(p, (d) => splitZoom(d, "a", 1_000_000, "b"));
    expect(ok).toBe(true);
    expect(split.zooms.map((z) => [z.id, z.start, z.end])).toEqual([
      ["a", 0, 1_000_000],
      ["b", 1_000_000, 2_000_000],
    ]);
    expect(edit(p, (d) => splitZoom(d, "a", 100_000, "c"))[0]).toBe(false);
  });
});
