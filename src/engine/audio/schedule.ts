import type { Clip } from "@/schema/project";
import type { Micros } from "../time";

export interface BufferPlacement {
  /** Timeline time at which playback of this piece starts. */
  at: Micros;
  /** Offset into the buffer, in source time. */
  offset: Micros;
  /** Length of buffer to play, in source time. */
  sourceDuration: Micros;
}

/**
 * Where a decoded audio buffer lands on the timeline for a clip, cropped to the clip's trim and to
 * `window` (timeline times). Returns null when nothing of the buffer is audible in the window.
 */
export function placeBuffer(
  clip: Clip,
  buffer: { start: Micros; duration: Micros },
  window: { start: Micros; end: Micros },
): BufferPlacement | null {
  const s0 = Math.max(buffer.start, clip.sourceIn);
  const s1 = Math.min(buffer.start + buffer.duration, clip.sourceOut);
  if (s1 <= s0) return null;

  const toTimeline = (s: Micros) => clip.timelineStart + (s - clip.sourceIn) / clip.speed;
  const a = Math.max(toTimeline(s0), window.start);
  const b = Math.min(toTimeline(s1), window.end);
  if (b <= a) return null;

  const sourceAtA = clip.sourceIn + (a - clip.timelineStart) * clip.speed;
  return {
    at: Math.round(a),
    offset: Math.round(sourceAtA - buffer.start),
    sourceDuration: Math.round((b - a) * clip.speed),
  };
}
