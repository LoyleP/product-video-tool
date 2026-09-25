import { describe, expect, it } from "vitest";
import {
  cameraTransform,
  canvasToMedia,
  REST_CAMERA,
  resolveCamera,
  ZOOM_MERGE_GAP,
  ZOOM_TRANSITION,
  type Camera,
} from "@/engine/camera";
import { EASING_PRESETS } from "@/engine/easing";
import { mediaRect } from "@/engine/geometry";
import type { ZoomSegment } from "@/schema/project";

const linear = EASING_PRESETS.linear;
const zoom = (start: number, end: number, over: Partial<ZoomSegment> = {}): ZoomSegment => ({
  id: `${start}`,
  start,
  end,
  scale: 2,
  focus: { x: 0.25, y: 0.75 },
  easeIn: linear,
  easeOut: linear,
  origin: "manual",
  ...over,
});

const expectCamera = (actual: Camera, expected: Partial<Camera>) => {
  for (const [key, value] of Object.entries(expected)) expect(actual[key as keyof Camera]).toBeCloseTo(value, 6);
};

describe("resolveCamera", () => {
  it("rests at scale 1, centered, with no zooms", () => {
    expect(resolveCamera([], 5_000_000)).toEqual(REST_CAMERA);
  });

  it("rests before, at the exact start, and at or after the end of a segment", () => {
    const z = [zoom(1_000_000, 4_000_000)];
    expect(resolveCamera(z, 999_999)).toEqual(REST_CAMERA);
    expectCamera(resolveCamera(z, 1_000_000), { scale: 1, cx: 0.5, cy: 0.5, amount: 0 });
    expect(resolveCamera(z, 4_000_000)).toEqual(REST_CAMERA);
    expect(resolveCamera(z, 9_000_000)).toEqual(REST_CAMERA);
  });

  it("eases in over 600 ms, holds, and eases out over the last 600 ms", () => {
    const z = [zoom(1_000_000, 4_000_000)];
    expectCamera(resolveCamera(z, 1_300_000), { scale: 1.5, cx: 0.375, cy: 0.625, amount: 0.5 });
    expectCamera(resolveCamera(z, 1_000_000 + ZOOM_TRANSITION), { scale: 2, cx: 0.25, cy: 0.75, amount: 1 });
    expectCamera(resolveCamera(z, 2_500_000), { scale: 2, cx: 0.25, cy: 0.75, amount: 1 });
    expectCamera(resolveCamera(z, 3_400_000), { scale: 2, amount: 1 });
    expectCamera(resolveCamera(z, 3_700_000), { scale: 1.5, amount: 0.5 });
    expect(resolveCamera(z, 3_999_999).scale).toBeCloseTo(1, 4);
  });

  it("shortens transitions to half of a short segment", () => {
    const z = [zoom(0, 400_000)];
    expectCamera(resolveCamera(z, 100_000), { scale: 1.5 });
    expectCamera(resolveCamera(z, 200_000), { scale: 2 });
    expectCamera(resolveCamera(z, 300_000), { scale: 1.5 });
  });

  it("applies the segment's easing", () => {
    const z = [zoom(0, 4_000_000, { easeIn: EASING_PRESETS.smooth })];
    // smooth is symmetric: halfway in time is halfway in value, earlier is slower than linear.
    expect(resolveCamera(z, 300_000).scale).toBeCloseTo(1.5, 3);
    expect(resolveCamera(z, 100_000).scale).toBeLessThan(1 + 1 / 6);
  });

  it("goes straight from one target to the next when segments are back to back", () => {
    const a = zoom(0, 2_000_000, { scale: 2, focus: { x: 0.2, y: 0.2 } });
    const b = zoom(2_100_000, 4_000_000, { scale: 3, focus: { x: 0.8, y: 0.8 } });
    const z = [b, a]; // order in the project doesn't matter
    // a never zooms out and the gap holds a's target.
    expectCamera(resolveCamera(z, 1_900_000), { scale: 2, cx: 0.2 });
    expectCamera(resolveCamera(z, 2_050_000), { scale: 2, cx: 0.2, amount: 1 });
    // b starts from a's target, not from rest.
    expectCamera(resolveCamera(z, 2_100_000), { scale: 2, cx: 0.2 });
    expectCamera(resolveCamera(z, 2_400_000), { scale: 2.5, cx: 0.5, amount: 1 });
    expectCamera(resolveCamera(z, 2_700_000), { scale: 3, cx: 0.8 });
  });

  it("returns to rest between segments separated by at least 300 ms", () => {
    const z = [zoom(0, 2_000_000), zoom(2_000_000 + ZOOM_MERGE_GAP, 4_000_000)];
    expect(resolveCamera(z, 2_100_000)).toEqual(REST_CAMERA);
    expect(resolveCamera(z, 1_999_999).scale).toBeCloseTo(1, 4);
    expectCamera(resolveCamera(z, 2_300_000), { scale: 1 });
  });

  it("chains three segments", () => {
    const z = [zoom(0, 1_000_000), zoom(1_000_000, 2_000_000, { scale: 3 }), zoom(2_000_000, 3_000_000, { scale: 4 })];
    expectCamera(resolveCamera(z, 1_000_000), { scale: 2 });
    expectCamera(resolveCamera(z, 2_000_000), { scale: 3 });
    expect(resolveCamera(z, 2_999_999).scale).toBeCloseTo(1, 4);
  });
});

describe("cameraTransform", () => {
  const canvas = { width: 1920, height: 1080 };
  const media = mediaRect(canvas, { width: 1920, height: 1080 }, 0.1);

  it("is the identity at rest", () => {
    const t = cameraTransform(canvas, media, REST_CAMERA);
    expect(t.scale).toBe(1);
    expect(t.tx).toBeCloseTo(0, 9);
    expect(t.ty).toBeCloseTo(0, 9);
  });

  it("moves the focus to the canvas center when there is room", () => {
    const t = cameraTransform(canvas, media, { scale: 2, cx: 0.5, cy: 0.5, amount: 1 });
    const center = { x: media.x + media.w / 2, y: media.y + media.h / 2 };
    expect(t.scale * center.x + t.tx).toBeCloseTo(960);
    expect(t.scale * center.y + t.ty).toBeCloseTo(540);
  });

  it("never pans past the media edges once the media covers the canvas", () => {
    const t = cameraTransform(canvas, media, { scale: 3, cx: 0, cy: 0, amount: 1 });
    // Left and top media edges land exactly on the canvas edges.
    expect(t.scale * media.x + t.tx).toBeCloseTo(0);
    expect(t.scale * media.y + t.ty).toBeCloseTo(0);
    const br = cameraTransform(canvas, media, { scale: 3, cx: 1, cy: 1, amount: 1 });
    expect(br.scale * (media.x + media.w) + br.tx).toBeCloseTo(1920);
    expect(br.scale * (media.y + media.h) + br.ty).toBeCloseTo(1080);
  });

  it("keeps small media fully on the canvas", () => {
    const t = cameraTransform(canvas, media, { scale: 1.05, cx: 0, cy: 0, amount: 0.1 });
    expect(t.scale * media.x + t.tx).toBeGreaterThanOrEqual(-1e-9);
    expect(t.scale * (media.x + media.w) + t.tx).toBeLessThanOrEqual(1920 + 1e-9);
  });

  it("maps canvas points back to media coordinates", () => {
    // A focus inside the unclamped range (0.3125..0.6875 at 2x for this media) lands at the canvas center.
    const camera = { scale: 2, cx: 0.4, cy: 0.6, amount: 1 };
    const t = cameraTransform(canvas, media, camera);
    const p = canvasToMedia({ x: 960, y: 540 }, media, t);
    expect(p.x).toBeCloseTo(0.4);
    expect(p.y).toBeCloseTo(0.6);
    expect(canvasToMedia({ x: t.scale * media.x + t.tx, y: t.scale * media.y + t.ty }, media, t)).toEqual({ x: 0, y: 0 });
  });
});
