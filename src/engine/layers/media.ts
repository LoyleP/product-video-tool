import type { CompositionStyle } from "@/schema/project";
import type { DeviceColor, DeviceDefinition, DeviceGeometry } from "../devices";
import type { DrawableFrame, RenderContext } from "../frame-provider";
import type { Rect } from "../geometry";

const PLACEHOLDER = "#1a1a1a";

export type Radii = [number, number, number, number];

export interface DevicePlacement {
  def: DeviceDefinition;
  geometry: DeviceGeometry;
  color: DeviceColor;
  /** Device outline position on the canvas. */
  rect: Rect;
  /** Canvas units per device unit. */
  k: number;
}

export interface MediaPlacement {
  assetId: string;
  sourceTime: number;
  /** Visible screen area, where the recording is clipped. */
  screen: Rect;
  radii: Radii;
  /** Where the full frame is drawn: equal to `screen`, or larger when cropped to fill a device screen. */
  draw: Rect;
  device: DevicePlacement | null;
}

function setShadow(ctx: RenderContext, style: CompositionStyle, pixelScale: number): boolean {
  if (style.shadow.opacity <= 0 || (style.shadow.blur <= 0 && style.shadow.offsetY === 0)) return false;
  ctx.shadowColor = `rgba(0, 0, 0, ${style.shadow.opacity})`;
  ctx.shadowBlur = style.shadow.blur * pixelScale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = style.shadow.offsetY * pixelScale;
  return true;
}

function withDevice(ctx: RenderContext, device: DevicePlacement, fn: () => void) {
  ctx.save();
  ctx.translate(device.rect.x, device.rect.y);
  ctx.scale(device.k, device.k);
  fn();
  ctx.restore();
}

/**
 * Draws one recording: drop shadow, the video clipped to its screen, then the device frame on top
 * (BUILD.md 7.2 steps 3 to 5). `pixelScale` converts canvas units to output pixels, because canvas
 * shadows ignore the transform.
 */
export function drawMedia(
  ctx: RenderContext,
  frame: DrawableFrame | null,
  placement: MediaPlacement,
  style: CompositionStyle,
  pixelScale: number,
): void {
  const { screen, radii, device } = placement;
  if (screen.w <= 0 || screen.h <= 0) return;

  // Shadow, cast by the device outline or the rounded media.
  ctx.save();
  const shadowed = setShadow(ctx, style, pixelScale);
  if (device) {
    if (shadowed) {
      withDevice(ctx, device, () => {
        device.def.silhouette(ctx, device.geometry);
        ctx.fillStyle = device.color.body;
        ctx.fill();
      });
    }
  } else {
    ctx.beginPath();
    ctx.roundRect(screen.x, screen.y, screen.w, screen.h, radii);
    ctx.fillStyle = PLACEHOLDER;
    ctx.fill();
  }
  ctx.restore();

  // Media. Under a device, bleed one output pixel past the screen so the bezel covers the seam.
  const bleed = device ? 1 / pixelScale : 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(screen.x - bleed, screen.y - bleed, screen.w + 2 * bleed, screen.h + 2 * bleed, radii);
  ctx.clip();
  if (frame) {
    frame.draw(ctx, placement.draw.x, placement.draw.y, placement.draw.w, placement.draw.h);
  } else if (device) {
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  ctx.restore();

  if (device) withDevice(ctx, device, () => device.def.draw(ctx, device.geometry, device.color));
}
