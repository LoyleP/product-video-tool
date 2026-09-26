import { analyzeMotion } from "@/engine/analysis/motion-client";
import { proposeZooms } from "@/engine/analysis/proposals";
import { ANALYSIS_INTERVAL } from "@/engine/analysis/settings";
import { EASING_PRESETS } from "@/engine/easing";
import type { Micros } from "@/engine/time";
import { clipEnd } from "@/engine/timeline";
import type { Clip, Project, ZoomSegment } from "@/schema/project";
import { getAssetFile } from "@/storage/asset-files";
import type { ZoomSuggestion } from "@/store/suggestions-store";

/** Maps a source time inside a clip to timeline time. */
const toTimeline = (clip: Clip, s: Micros) => Math.round(clip.timelineStart + (s - clip.sourceIn) / clip.speed);

/**
 * Analyzes every clip on the main video track and returns zoom suggestions in timeline time, skipping any
 * that would overlap an existing zoom (BUILD.md 7.6 Mode A).
 */
export async function suggestZooms(
  project: Project,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<ZoomSuggestion[]> {
  const track = project.videoTracks.find((t) => !t.overlay && !t.hidden);
  if (!track) return [];
  const clips = track.clips.filter((c) => project.assets[c.assetId]?.kind === "video");
  const jobs = await Promise.all(
    clips.map(async (clip) => {
      const asset = project.assets[clip.assetId]!;
      return { file: await getAssetFile(asset), trackIndex: asset.videoTrack, range: { start: clip.sourceIn, end: clip.sourceOut } };
    }),
  );
  const results = await analyzeMotion(jobs, onProgress, signal);

  const suggestions: ZoomSuggestion[] = [];
  results.forEach((steps, i) => {
    const clip = clips[i]!;
    for (const p of proposeZooms(steps, ANALYSIS_INTERVAL, { start: clip.sourceIn, end: clip.sourceOut })) {
      const start = Math.max(clip.timelineStart, toTimeline(clip, p.start));
      const end = Math.min(clipEnd(clip), toTimeline(clip, p.end));
      const overlapsExisting = project.zooms.some((z) => start < z.end && end > z.start);
      if (end > start && !overlapsExisting) suggestions.push({ id: crypto.randomUUID(), start, end, scale: p.scale, focus: p.focus });
    }
  });
  return suggestions;
}

/** The zoom an accepted suggestion becomes. */
export function suggestionToZoom(s: ZoomSuggestion, id: string = s.id): ZoomSegment {
  return {
    id,
    start: s.start,
    end: s.end,
    scale: s.scale,
    focus: s.focus,
    easeIn: EASING_PRESETS.spring,
    easeOut: EASING_PRESETS.spring,
    origin: "auto",
  };
}
