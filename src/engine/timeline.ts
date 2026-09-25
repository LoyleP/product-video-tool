import type { Clip, Project, VideoTrack } from "@/schema/project";
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

/** End of the last video clip: the project's playable length. */
export function projectDuration(project: Project): Micros {
  let end = 0;
  for (const track of project.videoTracks) for (const clip of track.clips) end = Math.max(end, clipEnd(clip));
  return end;
}

/** The time range to export: the explicit range if set, otherwise the whole project. */
export function exportRange(project: Project): { start: Micros; end: Micros } {
  const duration = projectDuration(project);
  const range = project.export.range;
  if (!range) return { start: 0, end: duration };
  const start = Math.max(0, Math.min(range.start, duration));
  return { start, end: Math.max(start, Math.min(range.end, duration)) };
}

/** Every visible clip active at `t`, with the source time to show. */
export function activeClips(project: Project, t: Micros): { clip: Clip; sourceTime: Micros }[] {
  const result: { clip: Clip; sourceTime: Micros }[] = [];
  for (const track of project.videoTracks) {
    if (track.hidden) continue;
    const clip = clipAt(track, t);
    if (clip) result.push({ clip, sourceTime: sourceTimeAt(clip, t) });
  }
  return result;
}
