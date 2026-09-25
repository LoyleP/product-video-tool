import type { TextAnimation, TextLayer } from "@/schema/project";
import { cubicBezier } from "../easing";
import type { RenderContext } from "../frame-provider";
import type { Size } from "../geometry";
import { canvasFont } from "../text/fonts";
import { wrapText } from "../text/wrap";
import type { Micros } from "../time";

const ease = cubicBezier(0.22, 1, 0.36, 1);
/** Slide distance for slide-up animations, in canvas units. */
const SLIDE = 40;

export interface TextAppearance {
  opacity: number;
  offsetY: number;
  scale: number;
}

/** Opacity, offset and scale of a text layer at time `t`, or null when it is not visible. */
export function textAppearance(layer: TextLayer, t: Micros): TextAppearance | null {
  if (t < layer.start || t >= layer.end) return null;
  const length = layer.end - layer.start;
  const apply = (anim: TextAnimation, progress: number): TextAppearance => {
    const e = ease(Math.min(1, Math.max(0, progress)));
    switch (anim.type) {
      case "none":
        return { opacity: 1, offsetY: 0, scale: 1 };
      case "fade":
        return { opacity: e, offsetY: 0, scale: 1 };
      case "slide-up":
        return { opacity: e, offsetY: (1 - e) * SLIDE, scale: 1 };
      case "scale":
        return { opacity: e, offsetY: 0, scale: 0.9 + 0.1 * e };
    }
  };
  const inDuration = Math.min(layer.animIn.duration, length / 2);
  const outDuration = Math.min(layer.animOut.duration, length / 2);
  if (inDuration > 0 && t < layer.start + inDuration) return apply(layer.animIn, (t - layer.start) / inDuration);
  if (outDuration > 0 && t >= layer.end - outDuration) return apply(layer.animOut, (layer.end - t) / outDuration);
  return { opacity: 1, offsetY: 0, scale: 1 };
}

/** Lines of a text layer wrapped to its box, measured with the layer's font. */
export function layoutTextLines(ctx: RenderContext, layer: TextLayer, canvas: Size): string[] {
  ctx.font = canvasFont(layer.font.family, layer.font.weight, layer.font.size);
  ctx.letterSpacing = `${layer.font.letterSpacing}px`;
  return wrapText(layer.text, layer.box.w * canvas.width, (s) => ctx.measureText(s).width);
}

/** Draws a text layer in canvas space (unaffected by zoom), vertically centered in its box. */
export function drawText(ctx: RenderContext, layer: TextLayer, t: Micros, canvas: Size): void {
  const look = textAppearance(layer, t);
  if (!look || look.opacity <= 0 || !layer.text) return;
  const box = {
    x: layer.box.x * canvas.width,
    y: layer.box.y * canvas.height,
    w: layer.box.w * canvas.width,
    h: layer.box.h * canvas.height,
  };

  ctx.save();
  const lines = layoutTextLines(ctx, layer, canvas);
  const lineHeight = layer.font.size * layer.font.lineHeight;
  const blockHeight = lines.length * lineHeight;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.globalAlpha *= look.opacity;
  ctx.translate(cx, cy + look.offsetY);
  ctx.scale(look.scale, look.scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = layer.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = layer.align;
  const x = layer.align === "left" ? box.x : layer.align === "right" ? box.x + box.w : cx;
  let y = cy - blockHeight / 2 + lineHeight / 2;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  ctx.restore();
}
