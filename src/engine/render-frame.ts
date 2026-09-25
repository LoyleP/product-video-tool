import type { Project } from "@/schema/project";
import {
  cameraTransform,
  IDENTITY_TRANSFORM,
  resolveCamera,
  type Camera,
  type CameraTransform,
} from "./camera";
import { coverRect, deviceById } from "./devices";
import type { FrameProvider, RenderTarget } from "./frame-provider";
import { mediaRect, type Rect } from "./geometry";
import { drawBackground } from "./layers/background";
import { drawGestures } from "./layers/gestures";
import { drawMedia, type MediaPlacement, type Radii } from "./layers/media";
import { drawOverlay, placeOverlay, type OverlayPlacement } from "./layers/overlay";
import { drawText } from "./layers/text";
import type { Micros } from "./time";
import { activeClips } from "./timeline";

export interface FrameLayout {
  camera: Camera;
  transform: CameraTransform;
  /** Screen rect of the first visible clip: what the camera frames and gestures are placed in. */
  primaryRect: Rect | null;
  media: MediaPlacement[];
  /** Picture-in-picture tracks (webcam), in canvas space. */
  overlays: OverlayPlacement[];
}

function placeMedia(project: Project, assetId: string, sourceTime: Micros, width: number, height: number): MediaPlacement {
  const { style, canvas } = project;
  const aspect = width / height;
  const def = style.device ? deviceById(style.device.frameId) : null;
  if (def && style.device) {
    const geometry = def.geometry(aspect);
    const rect = mediaRect(canvas, { width: geometry.width, height: geometry.height }, style.padding);
    const k = rect.w / geometry.width;
    const screen = {
      x: rect.x + geometry.screen.x * k,
      y: rect.y + geometry.screen.y * k,
      w: geometry.screen.w * k,
      h: geometry.screen.h * k,
    };
    const color = def.colors.find((c) => c.id === style.device!.color) ?? def.colors[0]!;
    return {
      assetId,
      sourceTime,
      screen,
      radii: geometry.screenRadii.map((r) => r * k) as Radii,
      draw: coverRect(screen, aspect),
      device: { def, geometry, color, rect, k },
    };
  }
  const screen = mediaRect(canvas, { width, height }, style.padding);
  const r = Math.min(style.cornerRadius, screen.w / 2, screen.h / 2);
  return { assetId, sourceTime, screen, radii: [r, r, r, r], draw: screen, device: null };
}

/** Where everything sits at time `t`, in canvas units. Pure; shared by rendering and editor hit-testing. */
export function layoutAt(project: Project, t: Micros): FrameLayout {
  const camera = resolveCamera(project.zooms, t);
  const media: MediaPlacement[] = [];
  const overlays: OverlayPlacement[] = [];
  for (const { clip, track, sourceTime } of activeClips(project, t)) {
    const asset = project.assets[clip.assetId];
    if (!asset?.width || !asset.height) continue;
    if (track.overlay) overlays.push(placeOverlay(project, track.overlay, asset.id, sourceTime, asset.width / asset.height));
    else media.push(placeMedia(project, asset.id, sourceTime, asset.width, asset.height));
  }
  const primaryRect = media[0]?.screen ?? null;
  const transform = primaryRect ? cameraTransform(project.canvas, primaryRect, camera) : IDENTITY_TRANSFORM;
  return { camera, transform, primaryRect, media, overlays };
}

/**
 * The single render entry point for preview and export (BUILD.md 2.4).
 * Pure with respect to `project` and `t`: no clocks, no randomness, no DOM.
 */
export function renderFrame(target: RenderTarget, project: Project, t: Micros, frames: FrameProvider): void {
  const { ctx } = target;
  const scale = target.width / project.canvas.width;
  const layout = layoutAt(project, t);
  const { transform } = layout;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // 1. Background.
  const blur = project.style.zoomBackgroundBlur * layout.camera.amount;
  drawBackground(ctx, project.style.background, project.canvas, blur, scale);

  // 2 to 6. Camera over shadow, media, device frame and gestures.
  ctx.save();
  ctx.transform(transform.scale, 0, 0, transform.scale, transform.tx, transform.ty);
  const pixelScale = scale * transform.scale;
  for (const placement of layout.media) {
    drawMedia(ctx, frames.getFrame(placement.assetId, placement.sourceTime), placement, project.style, pixelScale);
  }
  if (layout.primaryRect) drawGestures(ctx, project.gestures, t, layout.primaryRect, pixelScale);
  ctx.restore();

  // Overlays such as the webcam stay in canvas space, above the zoomed content.
  for (const overlay of layout.overlays) {
    drawOverlay(ctx, frames.getFrame(overlay.assetId, overlay.sourceTime), overlay, scale);
  }

  // 7. Text in canvas space, unaffected by zoom.
  for (const track of project.textTracks) {
    for (const layer of track.layers) drawText(ctx, layer, t, project.canvas);
  }

  ctx.restore();
}
