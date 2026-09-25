import type { Project } from "@/schema/project";
import type { FrameProvider, RenderTarget } from "./frame-provider";
import { mediaRect } from "./geometry";
import { drawBackground } from "./layers/background";
import { drawMedia } from "./layers/media";
import type { Micros } from "./time";
import { activeClips } from "./timeline";

/**
 * The single render entry point for preview and export (BUILD.md 2.4).
 * Pure with respect to `project` and `t`: no clocks, no randomness, no DOM.
 */
export function renderFrame(target: RenderTarget, project: Project, t: Micros, frames: FrameProvider): void {
  const { ctx } = target;
  const scale = target.width / project.canvas.width;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  drawBackground(ctx, project.style.background, project.canvas);

  for (const { clip, sourceTime } of activeClips(project, t)) {
    const asset = project.assets[clip.assetId];
    if (!asset?.width || !asset.height) continue;
    const frame = frames.getFrame(asset.id, sourceTime);
    const rect = mediaRect(project.canvas, { width: asset.width, height: asset.height }, project.style.padding);
    drawMedia(ctx, frame, rect, project.style, scale);
  }

  ctx.restore();
}
