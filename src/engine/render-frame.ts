import type { Project } from "@/schema/project";
import {
  cameraTransform,
  IDENTITY_TRANSFORM,
  resolveCamera,
  type Camera,
  type CameraTransform,
} from "./camera";
import type { FrameProvider, RenderTarget } from "./frame-provider";
import { mediaRect, type Rect } from "./geometry";
import { drawBackground } from "./layers/background";
import { drawMedia } from "./layers/media";
import type { Micros } from "./time";
import { activeClips } from "./timeline";

export interface FrameLayout {
  camera: Camera;
  transform: CameraTransform;
  /** Media rect of the topmost-priority visible clip, which the camera frames. */
  primaryRect: Rect | null;
  media: { assetId: string; sourceTime: Micros; rect: Rect }[];
}

/** Where everything sits at time `t`, in canvas units. Pure; shared by rendering and editor hit-testing. */
export function layoutAt(project: Project, t: Micros): FrameLayout {
  const camera = resolveCamera(project.zooms, t);
  const media: FrameLayout["media"] = [];
  for (const { clip, sourceTime } of activeClips(project, t)) {
    const asset = project.assets[clip.assetId];
    if (!asset?.width || !asset.height) continue;
    const rect = mediaRect(project.canvas, { width: asset.width, height: asset.height }, project.style.padding);
    media.push({ assetId: asset.id, sourceTime, rect });
  }
  const primaryRect = media[0]?.rect ?? null;
  const transform = primaryRect ? cameraTransform(project.canvas, primaryRect, camera) : IDENTITY_TRANSFORM;
  return { camera, transform, primaryRect, media };
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

  const blur = project.style.zoomBackgroundBlur * layout.camera.amount;
  drawBackground(ctx, project.style.background, project.canvas, blur, scale);

  // Camera applies to everything above the background (BUILD.md 7.2).
  ctx.transform(transform.scale, 0, 0, transform.scale, transform.tx, transform.ty);
  for (const { assetId, sourceTime, rect } of layout.media) {
    drawMedia(ctx, frames.getFrame(assetId, sourceTime), rect, project.style, scale * transform.scale);
  }

  ctx.restore();
}
