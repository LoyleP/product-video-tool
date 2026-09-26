import { cameraTransform } from "./camera";
import type { Rect, Size } from "./geometry";

/**
 * Converting between a zoom and the box it frames, in canvas units at rest (no camera). Drawing a box
 * on the preview sets both where the zoom looks and how far it zooms.
 */

export const MIN_ZOOM_SCALE = 1;
export const MAX_ZOOM_SCALE = 4;

/** The part of the canvas a zoom shows, as a box in rest coordinates (includes focus clamping). */
export function zoomBox(canvas: Size, media: Rect, zoom: { scale: number; focus: { x: number; y: number } }): Rect {
  const t = cameraTransform(canvas, media, { scale: zoom.scale, cx: zoom.focus.x, cy: zoom.focus.y, amount: 1 });
  return { x: -t.tx / t.scale, y: -t.ty / t.scale, w: canvas.width / t.scale, h: canvas.height / t.scale };
}

/** The zoom that frames `box`: scale from its size, focus at its center (normalized to the media). */
export function zoomFromBox(canvas: Size, media: Rect, box: Rect): { scale: number; focus: { x: number; y: number } } {
  const scale = Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, Math.min(canvas.width / box.w, canvas.height / box.h)));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return {
    scale: Math.round(scale * 100) / 100,
    focus: { x: clamp01((cx - media.x) / media.w), y: clamp01((cy - media.y) / media.h) },
  };
}

/**
 * A box dragged from `start` to `current`, locked to `aspect` (width / height) so what you draw is exactly
 * what the zoom shows. It grows from `start` toward the pointer.
 */
export function aspectBox(start: { x: number; y: number }, current: { x: number; y: number }, aspect: number): Rect {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const w = Math.max(Math.abs(dx), Math.abs(dy) * aspect);
  const h = w / aspect;
  return { x: dx < 0 ? start.x - w : start.x, y: dy < 0 ? start.y - h : start.y, w, h };
}

/** A box from two corners, in any direction. */
export function freeBox(start: { x: number; y: number }, current: { x: number; y: number }): Rect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x),
    h: Math.abs(current.y - start.y),
  };
}
