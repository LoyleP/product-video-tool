import type { Clip, VideoTrack } from "@/schema/project";
import type { Micros } from "./time";

/** Timeline length of a clip after speed is applied. */
export function clipDuration(clip: Clip): Micros {
  return Math.round((clip.sourceOut - clip.sourceIn) / clip.speed);
}

export function clipEnd(clip: Clip): Micros {
  return clip.timelineStart + clipDuration(clip);
}

/** The clip covering timeline time `t` (start inclusive, end exclusive), if any. */
export function clipAt(track: VideoTrack, t: Micros): Clip | null {
  for (const clip of track.clips) {
    if (t >= clip.timelineStart && t < clipEnd(clip)) return clip;
  }
  return null;
}

/** Maps timeline time to source time for a clip (BUILD.md 7.1). */
export function sourceTimeAt(clip: Clip, t: Micros): Micros {
  return clip.sourceIn + Math.round((t - clip.timelineStart) * clip.speed);
}
