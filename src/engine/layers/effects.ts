import type { Effect } from "@/schema/project";
import type { DrawableFrame, RenderContext } from "../frame-provider";
import type { Rect } from "../geometry";
import type { Micros } from "../time";
import type { MediaPlacement } from "./media";

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
      ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + 0.6 * effect.intensity})`;
      ctx.fill("evenodd");
    } else if (frame) {
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, r);
      ctx.clip();
      ctx.filter = `blur(${(4 + 26 * effect.intensity) * pixelScale}px)`;
      frame.draw(ctx, placement.draw.x, placement.draw.y, placement.draw.w, placement.draw.h);
    }
    ctx.restore();
  }
}
