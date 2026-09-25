import type { Overlay, Project } from "@/schema/project";
import { coverRect } from "../devices";
import type { DrawableFrame, RenderContext } from "../frame-provider";
import type { Rect } from "../geometry";

export interface OverlayPlacement {
  assetId: string;
  sourceTime: number;
  /** The visible overlay area on the canvas. */
  rect: Rect;
  /** Where the full frame is drawn (cropped to fill `rect`). */
  draw: Rect;
  shape: Overlay["shape"];
  mirror: boolean;
}

/** Margin between an overlay and the canvas edge, as a fraction of the canvas height. */
const MARGIN = 0.035;

/** Places a picture-in-picture overlay (a webcam) in a canvas corner. */
export function placeOverlay(
  project: Project,
  overlay: Overlay,
  assetId: string,
  sourceTime: number,
  aspect: number,
): OverlayPlacement {
  const { width: W, height: H } = project.canvas;
  const h = overlay.size * H;
  const w = overlay.shape === "circle" ? h : h * Math.min(aspect, 16 / 9);
  const m = MARGIN * H;
  const x = overlay.corner.endsWith("left") ? m : W - m - w;
  const y = overlay.corner.startsWith("top") ? m : H - m - h;
  const rect = { x, y, w, h };
  return { assetId, sourceTime, rect, draw: coverRect(rect, aspect), shape: overlay.shape, mirror: overlay.mirror };
}

function overlayPath(ctx: RenderContext, p: OverlayPlacement) {
  ctx.beginPath();
  if (p.shape === "circle") ctx.arc(p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2, p.rect.h / 2, 0, Math.PI * 2);
  else ctx.roundRect(p.rect.x, p.rect.y, p.rect.w, p.rect.h, p.rect.h * 0.12);
}

/** Draws an overlay with a soft shadow and a thin light ring. `pixelScale` scales the shadow. */
export function drawOverlay(ctx: RenderContext, frame: DrawableFrame | null, p: OverlayPlacement, pixelScale: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30 * pixelScale;
  ctx.shadowOffsetY = 10 * pixelScale;
  overlayPath(ctx, p);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.restore();

  ctx.save();
  overlayPath(ctx, p);
  ctx.clip();
  if (frame) {
    if (p.mirror) {
      ctx.translate(p.draw.x * 2 + p.draw.w, 0);
      ctx.scale(-1, 1);
    }
    frame.draw(ctx, p.draw.x, p.draw.y, p.draw.w, p.draw.h);
  }
  ctx.restore();

  ctx.save();
  overlayPath(ctx, p);
  ctx.lineWidth = Math.max(2, p.rect.h * 0.012);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.stroke();
  ctx.restore();
}
