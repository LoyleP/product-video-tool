import type { CompositionStyle } from "@/schema/project";
import type { DrawableFrame, RenderContext } from "../frame-provider";
import type { Rect } from "../geometry";

const PLACEHOLDER = "#1a1a1a";

/**
 * Draws the recording into `rect` with rounded corners and a drop shadow.
 * `pixelScale` converts canvas units to output pixels, because canvas shadows ignore the transform.
 */
export function drawMedia(
  ctx: RenderContext,
  frame: DrawableFrame | null,
  rect: Rect,
  style: CompositionStyle,
  pixelScale: number,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;
  const radius = Math.min(style.cornerRadius, rect.w / 2, rect.h / 2);

  ctx.save();
  if (style.shadow.opacity > 0 && (style.shadow.blur > 0 || style.shadow.offsetY !== 0)) {
    ctx.shadowColor = `rgba(0, 0, 0, ${style.shadow.opacity})`;
    ctx.shadowBlur = style.shadow.blur * pixelScale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = style.shadow.offsetY * pixelScale;
  }
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = PLACEHOLDER;
  ctx.fill();
  ctx.restore();

  if (!frame) return;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  frame.draw(ctx, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}
