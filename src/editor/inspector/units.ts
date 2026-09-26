import type { Micros } from "@/engine/time";
import { MICROS_PER_SECOND } from "@/engine/time";
import type { Project } from "@/schema/project";

/** Seconds <-> integer microseconds, at the input boundary (BUILD.md 2.5). */
export const toSeconds = (t: Micros): number => t / MICROS_PER_SECOND;
export const fromSeconds = (s: number): Micros => Math.round(s * MICROS_PER_SECOND);

/** Padding is stored as a fraction of the canvas's shorter side; the UI shows and takes pixels. */
export const paddingToPx = (fraction: number, canvas: Project["canvas"]): number =>
  Math.round(fraction * Math.min(canvas.width, canvas.height));
export const pxToPadding = (px: number, canvas: Project["canvas"]): number => px / Math.min(canvas.width, canvas.height);
/** Largest padding the model allows (0.45), in px. */
export const maxPaddingPx = (canvas: Project["canvas"]): number => Math.floor(0.45 * Math.min(canvas.width, canvas.height));

/**
 * Size in pixels of the main recording. Zoom focus, effect boxes and taps are stored as fractions of it, and
 * the UI shows them in the recording's own pixels.
 */
export function recordingSize(project: Project): { width: number; height: number } {
  for (const track of project.videoTracks) {
    if (track.overlay) continue;
    const clip = track.clips[0];
    const asset = clip && project.assets[clip.assetId];
    if (asset?.width && asset.height) return { width: asset.width, height: asset.height };
  }
  return { width: project.canvas.width, height: project.canvas.height };
}
