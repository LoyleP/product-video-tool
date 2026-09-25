import type { Draft } from "immer";
import { EASING_PRESETS } from "@/engine/easing";
import type { Micros } from "@/engine/time";
import { clipDuration, clipEnd, sourceTimeAt } from "@/engine/timeline";
import type { Clip, MediaAsset, Project, VideoTrack, ZoomSegment } from "@/schema/project";

/**
 * Pure edit operations on an Immer draft of the project. Each returns false when the edit is rejected
 * (and leaves the draft untouched), so the store can skip creating an undo step.
 */

/** Shortest clip or zoom an edit can produce. */
export const MIN_CLIP_DURATION: Micros = 100_000;
export const MIN_ZOOM_DURATION: Micros = 200_000;
export const DEFAULT_ZOOM_DURATION: Micros = 2_000_000;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 8;

type P = Draft<Project>;

export function findClip(project: P | Project, clipId: string): { track: VideoTrack; clip: Clip } | null {
  for (const track of project.videoTracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

const byStart = (a: Clip, b: Clip) => a.timelineStart - b.timelineStart;

/** Room around a clip on its track: previous clip end and next clip start. */
function neighbors(track: VideoTrack, clip: Clip): { prevEnd: Micros; nextStart: Micros } {
  let prevEnd = 0;
  let nextStart = Number.MAX_SAFE_INTEGER;
  for (const other of track.clips) {
    if (other.id === clip.id) continue;
    if (other.timelineStart < clip.timelineStart) prevEnd = Math.max(prevEnd, clipEnd(other));
    else nextStart = Math.min(nextStart, other.timelineStart);
  }
  return { prevEnd, nextStart };
}

/** Splits the clip under timeline time `t` into two clips that play back identically. */
export function splitClip(project: P, t: Micros, newId: string, clipId?: string): boolean {
  for (const track of project.videoTracks) {
    const clip = track.clips.find(
      (c) => (clipId === undefined || c.id === clipId) && t > c.timelineStart && t < clipEnd(c),
    );
    if (!clip) continue;
    const cut = sourceTimeAt(clip, t);
    if (cut - clip.sourceIn < MIN_CLIP_DURATION * clip.speed || clip.sourceOut - cut < MIN_CLIP_DURATION * clip.speed) {
      return false;
    }
    track.clips.push({ ...clip, id: newId, timelineStart: t, sourceIn: cut });
    clip.sourceOut = cut;
    track.clips.sort(byStart);
    return true;
  }
  return false;
}

/** Changes a clip's speed, keeping its start. Later clips on the track shift by the length change. */
export function setClipSpeed(project: P, clipId: string, speed: number): boolean {
  const found = findClip(project, clipId);
  const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
  if (!found || found.clip.speed === next) return false;
  const { track, clip } = found;
  const oldEnd = clipEnd(clip);
  clip.speed = next;
  const delta = clipEnd(clip) - oldEnd;
  for (const other of track.clips) if (other.id !== clip.id && other.timelineStart >= oldEnd) other.timelineStart += delta;
  return true;
}

/** Moves a clip on its track, clamped so it can't overlap its neighbors or go before zero. */
export function moveClip(project: P, clipId: string, timelineStart: Micros): boolean {
  const found = findClip(project, clipId);
  if (!found) return false;
  const { track, clip } = found;
  const { prevEnd, nextStart } = neighbors(track, clip);
  const length = clipDuration(clip);
  const start = Math.round(Math.min(Math.max(timelineStart, prevEnd), nextStart - length));
  if (start < prevEnd || start === clip.timelineStart) return false;
  clip.timelineStart = start;
  track.clips.sort(byStart);
  return true;
}

/**
 * Trims a clip edge to a timeline time. The start edge moves the clip start and its source in point
 * together (the right edge stays put); the end edge moves the source out point. Clamped to the source
 * media, neighbors and a minimum length.
 */
export function trimClipEdge(project: P, clipId: string, edge: "start" | "end", t: Micros): boolean {
  const found = findClip(project, clipId);
  if (!found) return false;
  const { track, clip } = found;
  const asset = project.assets[clip.assetId];
  const sourceDuration = asset?.duration ?? clip.sourceOut;
  const { prevEnd, nextStart } = neighbors(track, clip);
  const minLength = MIN_CLIP_DURATION;

  if (edge === "start") {
    const end = clipEnd(clip);
    // Earliest start: previous clip end, or where the source would begin.
    const earliest = Math.max(prevEnd, Math.ceil(clip.timelineStart - clip.sourceIn / clip.speed));
    const start = Math.round(Math.min(Math.max(t, earliest), end - minLength));
    if (start === clip.timelineStart) return false;
    clip.sourceIn = Math.max(0, Math.round(clip.sourceIn + (start - clip.timelineStart) * clip.speed));
    clip.timelineStart = start;
    clip.sourceOut = Math.max(clip.sourceOut, clip.sourceIn + 1);
    return true;
  }
  const latest = Math.min(nextStart, Math.floor(clip.timelineStart + (sourceDuration - clip.sourceIn) / clip.speed));
  const end = Math.round(Math.min(Math.max(t, clip.timelineStart + minLength), latest));
  const sourceOut = Math.min(sourceDuration, Math.round(clip.sourceIn + (end - clip.timelineStart) * clip.speed));
  if (sourceOut === clip.sourceOut) return false;
  clip.sourceOut = sourceOut;
  return true;
}

/** Sets a clip's source in and out points directly (inspector trim), keeping its timeline start. */
export function setClipSource(project: P, clipId: string, sourceIn: Micros, sourceOut: Micros): boolean {
  const found = findClip(project, clipId);
  if (!found) return false;
  const { track, clip } = found;
  const duration = project.assets[clip.assetId]?.duration ?? sourceOut;
  const minSource = MIN_CLIP_DURATION * clip.speed;
  let inPoint = Math.round(Math.min(Math.max(0, sourceIn), duration - minSource));
  let outPoint = Math.round(Math.min(duration, Math.max(sourceOut, inPoint + minSource)));
  // Don't grow into the next clip.
  const { nextStart } = neighbors(track, clip);
  const maxOut = Math.floor(inPoint + (nextStart - clip.timelineStart) * clip.speed);
  outPoint = Math.min(outPoint, maxOut);
  inPoint = Math.max(0, Math.min(inPoint, outPoint - minSource));
  if (inPoint === clip.sourceIn && outPoint === clip.sourceOut) return false;
  clip.sourceIn = inPoint;
  clip.sourceOut = outPoint;
  return true;
}

export function setClipMuted(project: P, clipId: string, muted: boolean): boolean {
  const found = findClip(project, clipId);
  if (!found || found.clip.muted === muted) return false;
  found.clip.muted = muted;
  return true;
}

export function deleteClip(project: P, clipId: string): boolean {
  for (const track of project.videoTracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index === -1) continue;
    if (project.videoTracks.reduce((n, t) => n + t.clips.length, 0) === 1) return false; // keep one clip
    track.clips.splice(index, 1);
    return true;
  }
  return false;
}

/** Adds an asset and appends a full-length clip for it at the end of the first video track. */
export function appendVideo(project: P, asset: MediaAsset, clipId: string): boolean {
  const track = project.videoTracks[0];
  if (!track) return false;
  project.assets[asset.id] = asset;
  const start = track.clips.reduce((end, c) => Math.max(end, clipEnd(c)), 0);
  track.clips.push({
    id: clipId,
    assetId: asset.id,
    timelineStart: start,
    sourceIn: 0,
    sourceOut: asset.duration,
    speed: 1,
    muted: false,
  });
  return true;
}

export function zoomsOverlap(zooms: readonly Pick<ZoomSegment, "id" | "start" | "end">[]): boolean {
  const sorted = [...zooms].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.start < sorted[i - 1]!.end) return true;
  return false;
}

/**
 * Adds a zoom starting at `t` (default 2 s, scale 2, centered). It is shortened to fit before the next
 * zoom and the project end; rejected if less than the minimum length fits.
 */
export function addZoom(project: P, t: Micros, id: string, projectEnd: Micros): ZoomSegment | null {
  const start = Math.max(0, Math.round(t));
  if (project.zooms.some((z) => start >= z.start && start < z.end)) return null;
  const nextStart = project.zooms.filter((z) => z.start > start).reduce((m, z) => Math.min(m, z.start), projectEnd);
  const end = Math.min(start + DEFAULT_ZOOM_DURATION, nextStart);
  if (end - start < MIN_ZOOM_DURATION) return null;
  const zoom: ZoomSegment = {
    id,
    start,
    end,
    scale: 2,
    focus: { x: 0.5, y: 0.5 },
    easeIn: EASING_PRESETS.spring,
    easeOut: EASING_PRESETS.spring,
    origin: "manual",
  };
  project.zooms.push(zoom);
  project.zooms.sort((a, b) => a.start - b.start);
  return zoom;
}

/** Updates a zoom. Rejected when the result would overlap another zoom or be too short. */
export function updateZoom(
  project: P,
  id: string,
  patch: Partial<Pick<ZoomSegment, "start" | "end" | "scale" | "focus" | "easeIn" | "easeOut">>,
): boolean {
  const zoom = project.zooms.find((z) => z.id === id);
  if (!zoom) return false;
  const next = { ...zoom, ...patch };
  next.start = Math.max(0, Math.round(next.start));
  next.end = Math.round(next.end);
  next.scale = Math.min(4, Math.max(1, next.scale));
  next.focus = { x: Math.min(1, Math.max(0, next.focus.x)), y: Math.min(1, Math.max(0, next.focus.y)) };
  if (next.end - next.start < MIN_ZOOM_DURATION) return false;
  if (zoomsOverlap(project.zooms.map((z) => (z.id === id ? next : z)))) return false;
  if (JSON.stringify(next) === JSON.stringify(zoom)) return false;
  Object.assign(zoom, next);
  project.zooms.sort((a, b) => a.start - b.start);
  return true;
}

/** Moves a zoom to start at `start`, clamped between its neighbors. */
export function moveZoom(project: P, id: string, start: Micros): boolean {
  const zoom = project.zooms.find((z) => z.id === id);
  if (!zoom) return false;
  const length = zoom.end - zoom.start;
  const others = project.zooms.filter((z) => z.id !== id);
  const prevEnd = others.filter((z) => z.start < zoom.start).reduce((m, z) => Math.max(m, z.end), 0);
  const nextStart = others.filter((z) => z.start >= zoom.start).reduce((m, z) => Math.min(m, z.start), Number.MAX_SAFE_INTEGER);
  const clamped = Math.min(Math.max(Math.round(start), prevEnd), nextStart - length);
  if (clamped < prevEnd) return false;
  return updateZoom(project, id, { start: clamped, end: clamped + length });
}

export function deleteZoom(project: P, id: string): boolean {
  const index = project.zooms.findIndex((z) => z.id === id);
  if (index === -1) return false;
  project.zooms.splice(index, 1);
  return true;
}
