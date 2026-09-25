import type { Draft } from "immer";
import { EASING_PRESETS } from "@/engine/easing";
import type { Micros } from "@/engine/time";
import { clipDuration, clipEnd, sourceTimeAt } from "@/engine/timeline";
import { DEFAULT_FONT_FAMILY } from "@/engine/text/fonts";
import type { StylePreset } from "@/schema/presets";
import type {
  Clip,
  Gesture,
  MediaAsset,
  Overlay,
  Project,
  TextLayer,
  TextTrack,
  VideoTrack,
  ZoomSegment,
} from "@/schema/project";

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

// Text layers

export const DEFAULT_TEXT_DURATION: Micros = 3_000_000;
export const MIN_TEXT_DURATION: Micros = 200_000;
export const MAX_TEXT_TRACKS = 5;

export function findText(project: P | Project, id: string): { track: TextTrack; layer: TextLayer } | null {
  for (const track of project.textTracks) {
    const layer = track.layers.find((l) => l.id === id);
    if (layer) return { track, layer };
  }
  return null;
}

/** A new text layer: a centered lower third, or a copy of `template`'s look. */
export function newTextLayer(id: string, start: Micros, end: Micros, template?: TextLayer): TextLayer {
  return {
    id,
    start,
    end,
    text: "Your text here",
    box: template ? { ...template.box } : { x: 0.1, y: 0.78, w: 0.8, h: 0.14 },
    font: template
      ? { ...template.font }
      : { family: DEFAULT_FONT_FAMILY, size: 64, weight: 650, lineHeight: 1.15, letterSpacing: -1 },
    color: template?.color ?? "#ffffff",
    align: template?.align ?? "center",
    animIn: template ? { ...template.animIn } : { type: "fade", duration: 400_000 },
    animOut: template ? { ...template.animOut } : { type: "fade", duration: 300_000 },
  };
}

const overlapsIn = (layers: readonly TextLayer[], start: Micros, end: Micros, exceptId?: string) =>
  layers.some((l) => l.id !== exceptId && start < l.end && end > l.start);

/**
 * Adds a 3 s text layer at `t` on the first text track with room, creating a track if needed (max 5).
 * The new layer copies the look of the most recent text layer.
 */
export function addText(project: P, t: Micros, id: string, trackId: string, projectEnd: Micros): boolean {
  const start = Math.max(0, Math.round(t));
  const end = Math.min(start + DEFAULT_TEXT_DURATION, Math.max(projectEnd, start + MIN_TEXT_DURATION));
  if (end - start < MIN_TEXT_DURATION) return false;
  const all = project.textTracks.flatMap((track) => track.layers);
  const template = all[all.length - 1];
  let track = project.textTracks.find((tr) => !overlapsIn(tr.layers, start, end));
  if (!track) {
    if (project.textTracks.length >= MAX_TEXT_TRACKS) return false;
    project.textTracks.push({ id: trackId, layers: [] });
    track = project.textTracks[project.textTracks.length - 1]!;
  }
  track.layers.push(newTextLayer(id, start, end, template as TextLayer | undefined));
  track.layers.sort((a, b) => a.start - b.start);
  return true;
}

export type TextPatch = Partial<Omit<TextLayer, "id" | "box" | "font">> & {
  box?: Partial<TextLayer["box"]>;
  font?: Partial<TextLayer["font"]>;
};

/** Updates a text layer. Timing changes that overlap another layer on the same track are rejected. */
export function updateText(project: P, id: string, patch: TextPatch): boolean {
  const found = findText(project, id);
  if (!found) return false;
  const { track, layer } = found;
  const next: TextLayer = {
    ...layer,
    ...patch,
    box: { ...layer.box, ...patch.box },
    font: { ...layer.font, ...patch.font },
  };
  next.start = Math.max(0, Math.round(next.start));
  next.end = Math.round(next.end);
  next.box.w = Math.min(1.5, Math.max(0.05, next.box.w));
  next.box.h = Math.min(1.5, Math.max(0.03, next.box.h));
  next.box.x = Math.min(1 - 0.02, Math.max(-next.box.w + 0.02, next.box.x));
  next.box.y = Math.min(1 - 0.02, Math.max(-next.box.h + 0.02, next.box.y));
  next.font.size = Math.min(400, Math.max(8, next.font.size));
  if (next.end - next.start < MIN_TEXT_DURATION) return false;
  if (overlapsIn(track.layers, next.start, next.end, id)) return false;
  if (JSON.stringify(next) === JSON.stringify(layer)) return false;
  Object.assign(layer, next);
  track.layers.sort((a, b) => a.start - b.start);
  return true;
}

/** Moves a text layer in time, clamped between its neighbors on the track. */
export function moveText(project: P, id: string, start: Micros): boolean {
  const found = findText(project, id);
  if (!found) return false;
  const { track, layer } = found;
  const length = layer.end - layer.start;
  const others = track.layers.filter((l) => l.id !== id);
  const prevEnd = others.filter((l) => l.start < layer.start).reduce((m, l) => Math.max(m, l.end), 0);
  const nextStart = others.filter((l) => l.start >= layer.start).reduce((m, l) => Math.min(m, l.start), Number.MAX_SAFE_INTEGER);
  const clamped = Math.min(Math.max(Math.round(start), prevEnd), nextStart - length);
  if (clamped < prevEnd) return false;
  return updateText(project, id, { start: clamped, end: clamped + length });
}

export function deleteText(project: P, id: string): boolean {
  for (const track of project.textTracks) {
    const index = track.layers.findIndex((l) => l.id === id);
    if (index === -1) continue;
    track.layers.splice(index, 1);
    return true;
  }
  return false;
}

// Gestures

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function addGesture(project: P, gesture: Gesture): boolean {
  project.gestures.push({
    ...gesture,
    time: Math.max(0, Math.round(gesture.time)),
    from: { x: clamp01(gesture.from.x), y: clamp01(gesture.from.y) },
    to: gesture.to && { x: clamp01(gesture.to.x), y: clamp01(gesture.to.y) },
  });
  project.gestures.sort((a, b) => a.time - b.time);
  return true;
}

export function updateGesture(project: P, id: string, patch: Partial<Omit<Gesture, "id">>): boolean {
  const gesture = project.gestures.find((g) => g.id === id);
  if (!gesture) return false;
  const next = { ...gesture, ...patch };
  next.time = Math.max(0, Math.round(next.time));
  if (next.type === "swipe" && !next.to) next.to = { x: clamp01(next.from.x + 0.2), y: next.from.y };
  if (JSON.stringify(next) === JSON.stringify(gesture)) return false;
  Object.assign(gesture, next);
  project.gestures.sort((a, b) => a.time - b.time);
  return true;
}

export function deleteGesture(project: P, id: string): boolean {
  const index = project.gestures.findIndex((g) => g.id === id);
  if (index === -1) return false;
  project.gestures.splice(index, 1);
  return true;
}

// Presets

/** Applies a preset's style, and its text style to every text layer. */
export function applyPreset(project: P, preset: StylePreset): boolean {
  Object.assign(project.style, structuredClone(preset.style));
  if (preset.text) {
    for (const track of project.textTracks) {
      for (const layer of track.layers) {
        layer.font.family = preset.text.family;
        layer.font.weight = preset.text.weight;
        layer.color = preset.text.color;
      }
    }
  }
  return true;
}

// Overlay tracks (webcam)

/** Updates the picture-in-picture settings of an overlay track. */
export function updateOverlay(project: P, trackId: string, patch: Partial<Overlay>): boolean {
  const track = project.videoTracks.find((t) => t.id === trackId);
  if (!track?.overlay) return false;
  const next = { ...track.overlay, ...patch };
  next.size = Math.min(0.6, Math.max(0.05, next.size));
  if (JSON.stringify(next) === JSON.stringify(track.overlay)) return false;
  track.overlay = next;
  return true;
}

/** Shows or hides a video track (for example the webcam). */
export function setTrackHidden(project: P, trackId: string, hidden: boolean): boolean {
  const track = project.videoTracks.find((t) => t.id === trackId);
  if (!track || track.hidden === hidden) return false;
  track.hidden = hidden;
  return true;
}
