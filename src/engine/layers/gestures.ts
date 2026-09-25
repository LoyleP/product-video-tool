import type { Gesture } from "@/schema/project";
import { cubicBezier } from "../easing";
import type { RenderContext } from "../frame-provider";
import type { Rect } from "../geometry";
import type { Micros } from "../time";

/** How long a tap or swipe indicator stays on screen. */
export const GESTURE_DURATION: Micros = 350_000;

const easeOut = cubicBezier(0.22, 1, 0.36, 1);

/** Progress 0..1 of a gesture at time `t`, or null when not visible. */
export function gestureProgress(gesture: Gesture, t: Micros): number | null {
  if (t < gesture.time || t >= gesture.time + GESTURE_DURATION) return null;
  return (t - gesture.time) / GESTURE_DURATION;
}

/**
 * Draws tap and swipe indicators in media space (inside the camera transform), so they follow zooms.
 * `media` is the rect the recording occupies; positions are normalized to it. `pixelScale` converts
 * canvas units to output pixels for the shadow, which ignores the transform.
 */
export function drawGestures(
  ctx: RenderContext,
  gestures: readonly Gesture[],
  t: Micros,
  media: Rect,
  pixelScale: number,
): void {
  const size = Math.min(media.w, media.h) * 0.045;
  for (const gesture of gestures) {
    const p = gestureProgress(gesture, t);
    if (p === null) continue;
    const at = (pt: { x: number; y: number }) => ({ x: media.x + pt.x * media.w, y: media.y + pt.y * media.h });
    const from = at(gesture.from);
    const to = gesture.type === "swipe" && gesture.to ? at(gesture.to) : from;
    const e = easeOut(p);
    const pos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
    const fade = 1 - Math.max(0, (p - 0.6) / 0.4);

    ctx.save();
    if (gesture.type === "swipe") {
      // Trail from the start point to the current position.
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.lineCap = "round";
      ctx.lineWidth = size * 0.9;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * fade})`;
      ctx.stroke();
    }
    if (gesture.style === "ripple") {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * (0.6 + 1.2 * e), 0, Math.PI * 2);
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size * (gesture.style === "dot" ? 0.5 + 0.2 * Math.sin(Math.PI * Math.min(1, p * 2)) : 0.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.85 * fade})`;
    ctx.shadowColor = `rgba(0,0,0,${0.35 * fade})`;
    ctx.shadowBlur = size * 0.4 * pixelScale;
    ctx.fill();
    ctx.restore();
  }
}
