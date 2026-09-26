import { describe, expect, it } from "vitest";
import { resolveCamera } from "@/engine/camera";
import { EASING_PRESETS, MOTION_PRESETS, motionPresetOf } from "@/engine/easing";
import { mediaRect } from "@/engine/geometry";
import { aspectBox, freeBox, zoomBox, zoomFromBox } from "@/engine/zoom-box";
import type { ZoomSegment } from "@/schema/project";

const canvas = { width: 1920, height: 1080 };
const media = mediaRect(canvas, { width: 1920, height: 1080 }, 0.08);

describe("zoom boxes", () => {
  it("round-trips a box drawn inside the media", () => {
    const box = { x: 400, y: 300, w: 960, h: 540 };
    const zoom = zoomFromBox(canvas, media, box);
    expect(zoom.scale).toBe(2);
    const back = zoomBox(canvas, media, zoom);
    expect(back.x).toBeCloseTo(box.x, 0);
    expect(back.y).toBeCloseTo(box.y, 0);
    expect(back.w).toBeCloseTo(box.w, 0);
  });

  it("clamps the scale between 1x and 4x", () => {
    expect(zoomFromBox(canvas, media, { x: 900, y: 500, w: 100, h: 56 }).scale).toBe(4);
    expect(zoomFromBox(canvas, media, { x: 0, y: 0, w: 3000, h: 1700 }).scale).toBe(1);
  });

  it("shows the clamped region when the focus is near an edge", () => {
    const box = zoomBox(canvas, media, { scale: 2, focus: { x: 0, y: 0 } });
    // At 2x the view can't pan past the media's top-left corner.
    expect(box.x).toBeCloseTo(media.x, 0);
    expect(box.y).toBeCloseTo(media.y, 0);
  });

  it("locks drawn boxes to the canvas aspect ratio in any direction", () => {
    const aspect = 16 / 9;
    expect(aspectBox({ x: 100, y: 100 }, { x: 260, y: 120 }, aspect)).toEqual({ x: 100, y: 100, w: 160, h: 90 });
    const up = aspectBox({ x: 500, y: 500 }, { x: 400, y: 300 }, aspect);
    expect(up.h).toBeCloseTo(200);
    expect(up.x + up.w).toBe(500);
    expect(up.y + up.h).toBeCloseTo(500);
    expect(freeBox({ x: 10, y: 50 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, w: 10, h: 50 });
  });
});

describe("zoom motion", () => {
  const zoom = (over: Partial<ZoomSegment>): ZoomSegment => ({
    id: "z",
    start: 0,
    end: 4_000_000,
    scale: 2,
    focus: { x: 0.5, y: 0.5 },
    easeIn: EASING_PRESETS.linear,
    easeOut: EASING_PRESETS.linear,
    origin: "manual",
    ...over,
  });

  it("uses a zoom's own transition length", () => {
    expect(resolveCamera([zoom({ transition: 1_000_000 })], 500_000).scale).toBeCloseTo(1.5);
    expect(resolveCamera([zoom({ transition: 200_000 })], 500_000).scale).toBe(2);
    expect(resolveCamera([zoom({})], 300_000).scale).toBeCloseTo(1.5); // default 600 ms
  });

  it("names motion presets and recognizes custom ones", () => {
    for (const [name, preset] of Object.entries(MOTION_PRESETS)) {
      expect(motionPresetOf({ easeIn: preset.easing, transition: preset.transition })).toBe(name);
    }
    // Zooms saved before transitions existed are "gentle" if they use the spring.
    expect(motionPresetOf({ easeIn: EASING_PRESETS.spring })).toBe("gentle");
    expect(motionPresetOf({ easeIn: EASING_PRESETS.linear })).toBeNull();
  });
});
