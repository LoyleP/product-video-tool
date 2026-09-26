import type { Effect } from "@/schema/project";
import type { DrawableFrame, RenderContext } from "../frame-provider";
import type { Rect } from "../geometry";
import type { Micros } from "../time";
import type { MediaPlacement } from "./media";

/** Blur radius in canvas px for the stored 0..1 strength: 4 px at 0 up to 30 px at 1. */
export const BLUR_MIN_PX = 4;
export const BLUR_MAX_PX = 30;
export const blurRadiusPx = (intensity: number) => BLUR_MIN_PX + (BLUR_MAX_PX - BLUR_MIN_PX) * intensity;
export const intensityFromBlurPx = (px: number) =>
  Math.min(1, Math.max(0, (px - BLUR_MIN_PX) / (BLUR_MAX_PX - BLUR_MIN_PX)));

/** How dark a spotlight dims the recording outside its box: 20% at strength 0 up to 80% at 1. */
export const DIM_MIN = 0.2;
export const DIM_MAX = 0.8;
export const dimAmount = (intensity: number) => DIM_MIN + (DIM_MAX - DIM_MIN) * intensity;
export const intensityFromDim = (dim: number) => Math.min(1, Math.max(0, (dim - DIM_MIN) / (DIM_MAX - DIM_MIN)));

/** Effects fade in and out over this long. */
export const EFFECT_FADE: Micros = 250_000;
/** Corner radius of effect boxes, in canvas units. */
const BOX_RADIUS = 14;

/** Opacity 0..1 of an effect at `t`, or null when not active. */
export function effectOpacity(effect: Effect, t: Micros): number | null {
  if (t < effect.start || t >= effect.end) return null;
  const fade = Math.min(EFFECT_FADE, (effect.end - effect.start) / 2);
  return Math.min(1, (t - effect.start) / fade, (effect.end - t) / fade);
}

/** An effect's box in canvas units, from its rect normalized to the recording's screen area. */
export function effectBox(effect: Effect, screen: Rect): Rect {
  return {
    x: screen.x + effect.rect.x * screen.w,
    y: screen.y + effect.rect.y * screen.h,
    w: effect.rect.w * screen.w,
    h: effect.rect.h * screen.h,
  };
}

/**
 * Draws spotlight and blur effects over the recording, in media space so they follow zooms.
 * `pixelScale` converts canvas units to output pixels for the blur, which ignores the transform.
 */
export function drawEffects(
  ctx: RenderContext,
  effects: readonly Effect[],
  t: Micros,
  placement: MediaPlacement,
  frame: DrawableFrame | null,
  pixelScale: number,
): void {
  const { screen, radii } = placement;
  for (const effect of effects) {
    const opacity = effectOpacity(effect, t);
    if (opacity === null || opacity <= 0) continue;
    const box = effectBox(effect, screen);
    const r = Math.min(BOX_RADIUS, box.w / 2, box.h / 2);
    ctx.save();
    ctx.globalAlpha *= opacity;
    if (effect.type === "spotlight") {
      // Dim the recording everywhere except the box.
      ctx.beginPath();
      ctx.roundRect(screen.x, screen.y, screen.w, screen.h, radii);
      ctx.roundRect(box.x, box.y, box.w, box.h, r);
      ctx.fillStyle = `rgba(0, 0, 0, ${dimAmount(effect.intensity)})`;
      ctx.fill("evenodd");
    } else if (frame) {
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, r);
      ctx.clip();
      ctx.filter = `blur(${blurRadiusPx(effect.intensity) * pixelScale}px)`;
      frame.draw(ctx, placement.draw.x, placement.draw.y, placement.draw.w, placement.draw.h);
    }
    ctx.restore();
  }
}
