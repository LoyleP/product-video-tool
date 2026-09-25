import type { ZoomSegment } from "@/schema/project";
import { easingFunction } from "./easing";
import type { Rect, Size } from "./geometry";
import type { Micros } from "./time";

/** Camera state at a time: zoom scale, focus in normalized media space, and how zoomed-in it is (0..1). */
export interface Camera {
  scale: number;
  cx: number;
  cy: number;
  /** 0 at rest, 1 fully at a segment's target; drives the zoom background blur. */
  amount: number;
}

export const REST_CAMERA: Camera = { scale: 1, cx: 0.5, cy: 0.5, amount: 0 };

/** Default zoom in and out transition length (BUILD.md 7.3). */
export const ZOOM_TRANSITION: Micros = 600_000;
/** Segments closer than this move directly from one target to the next. */
export const ZOOM_MERGE_GAP: Micros = 300_000;

const targetOf = (z: ZoomSegment): Camera => ({ scale: z.scale, cx: z.focus.x, cy: z.focus.y, amount: 1 });

const lerp = (a: number, b: number, e: number) => a + (b - a) * e;
const mix = (a: Camera, b: Camera, e: number): Camera => ({
  scale: lerp(a.scale, b.scale, e),
  cx: lerp(a.cx, b.cx, e),
  cy: lerp(a.cy, b.cy, e),
  amount: Math.min(1, Math.max(0, lerp(a.amount, b.amount, e))),
});

/**
 * Resolves the camera at time `t`. Between segments the camera rests at scale 1, centered. Each segment
 * eases in from rest (or from the previous segment when the gap is under 300 ms) and eases back out
 * unless the next segment follows within 300 ms. Segments must not overlap (enforced by the store).
 */
export function resolveCamera(zooms: readonly ZoomSegment[], t: Micros): Camera {
  const sorted = [...zooms].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i]!;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const chainedFromPrev = !!prev && seg.start - prev.end < ZOOM_MERGE_GAP;
    const chainedToNext = !!next && next.start - seg.end < ZOOM_MERGE_GAP;

    if (t >= seg.start && t < seg.end) {
      const length = seg.end - seg.start;
      const inDuration = Math.min(ZOOM_TRANSITION, chainedToNext ? length : length / 2);
      const outDuration = chainedToNext ? 0 : Math.min(ZOOM_TRANSITION, length / 2);
      const target = targetOf(seg);
      const from = chainedFromPrev ? targetOf(prev!) : REST_CAMERA;
      if (t < seg.start + inDuration) {
        return mix(from, target, easingFunction(seg.easeIn)((t - seg.start) / inDuration));
      }
      if (outDuration > 0 && t >= seg.end - outDuration) {
        return mix(target, REST_CAMERA, easingFunction(seg.easeOut)((t - (seg.end - outDuration)) / outDuration));
      }
      return target;
    }
    if (chainedToNext && t >= seg.end && t < next!.start) return targetOf(seg);
  }
  return REST_CAMERA;
}

/** A uniform scale and translation: screen = scale * point + (tx, ty), in canvas units. */
export interface CameraTransform {
  scale: number;
  tx: number;
  ty: number;
}

export const IDENTITY_TRANSFORM: CameraTransform = { scale: 1, tx: 0, ty: 0 };

/**
 * Canvas transform for a camera: the focus point of the media moves to the canvas center, scaled by the
 * camera scale. The focus is clamped so that, once the scaled media is larger than the canvas, the view
 * never pans past the media edges; while it is smaller, the media stays fully on the canvas.
 */
export function cameraTransform(canvas: Size, media: Rect, camera: Camera): CameraTransform {
  const s = camera.scale;
  const clampAxis = (start: number, length: number, focus: number, viewport: number) => {
    const p = start + focus * length;
    const a = start + viewport / (2 * s);
    const b = start + length - viewport / (2 * s);
    return Math.min(Math.max(p, Math.min(a, b)), Math.max(a, b));
  };
  const px = clampAxis(media.x, media.w, camera.cx, canvas.width);
  const py = clampAxis(media.y, media.h, camera.cy, canvas.height);
  return { scale: s, tx: canvas.width / 2 - s * px, ty: canvas.height / 2 - s * py };
}

/** Maps a canvas point back through the camera to normalized media coordinates (for picking focus). */
export function canvasToMedia(point: { x: number; y: number }, media: Rect, transform: CameraTransform) {
  const x = (point.x - transform.tx) / transform.scale;
  const y = (point.y - transform.ty) / transform.scale;
  return { x: (x - media.x) / media.w, y: (y - media.y) / media.h };
}
