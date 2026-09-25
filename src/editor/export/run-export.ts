import { canEncodeAudio, canEncodeVideo } from "mediabunny";
import { mixProjectAudio } from "@/engine/export/audio-mix";
import type { EncodeProgress } from "@/engine/export/encode-project";
import { exportInWorker } from "@/engine/export/export-client";
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE, exportSize, videoBitrate } from "@/engine/export/settings";
import { microsToSeconds } from "@/engine/time";
import { exportRange } from "@/engine/timeline";
import type { Project } from "@/schema/project";
import { getAssetFile } from "@/storage/asset-files";
import { StorageError } from "@/storage/errors";
import { ensureSpaceFor } from "@/storage/opfs";

/** An export failure whose message can be shown to the user as is. */
export class ExportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExportError";
  }
}

export type ExportPhase = { kind: "mixing-audio" } | ({ kind: "encoding" } & EncodeProgress);

const PRESET_LABEL = { "1080p": "1080p", "1440p": "1440p", "4k": "4K", custom: "this size" } as const;

/** Checks that this browser can encode the project's export settings. Returns a message if not. */
export async function checkExportSupport(project: Project): Promise<string | null> {
  const size = exportSize(project.export.preset, project.canvas, project.export);
  const bitrate = videoBitrate(size, project.export.fps, project.export.quality);
  const ok = await canEncodeVideo("avc", { ...size, bitrate, frameRate: project.export.fps }).catch(() => false);
  if (ok) return null;
  const label = PRESET_LABEL[project.export.preset];
  return project.export.preset === "4k"
    ? `This browser can't encode ${label} H.264 video on this computer. Choose 1440p instead.`
    : `This browser can't encode ${label} H.264 video. Try a lower resolution, or use Chrome or Edge.`;
}

/** Exports the project to an MP4 file (BUILD.md 7.4). */
export async function runExport(
  project: Project,
  onPhase: (phase: ExportPhase) => void,
  signal: AbortSignal,
): Promise<File> {
  const range = exportRange(project);
  if (range.end <= range.start) throw new ExportError("Nothing to export: the trimmed video is empty.");

  const unsupported = await checkExportSupport(project);
  if (unsupported) throw new ExportError(unsupported);

  const size = exportSize(project.export.preset, project.canvas, project.export);
  const fps = project.export.fps;
  const bitrate = videoBitrate(size, fps, project.export.quality);

  const hasAudio = project.videoTracks.some((t) =>
    t.clips.some((c) => !c.muted && project.assets[c.assetId]?.hasAudio),
  );
  if (
    hasAudio &&
    !(await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: AUDIO_SAMPLE_RATE, bitrate: AUDIO_BITRATE }))
  ) {
    throw new ExportError("This browser can't encode AAC audio for MP4. Use Chrome, Edge or Safari to export with sound.");
  }

  try {
    await ensureSpaceFor(((bitrate + AUDIO_BITRATE) / 8) * microsToSeconds(range.end - range.start) * 1.2);

    const files: Record<string, Blob> = {};
    for (const asset of Object.values(project.assets)) files[asset.id] = await getAssetFile(asset);

    onPhase({ kind: "mixing-audio" });
    const audio = await mixProjectAudio(project, files, range, AUDIO_SAMPLE_RATE, signal);
    signal.throwIfAborted();

    return await exportInWorker(
      { project, files, audio, size, fps, bitrate, range },
      (p) => onPhase({ kind: "encoding", ...p }),
      signal,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof StorageError) throw new ExportError(error.message, { cause: error });
    const detail = error instanceof Error ? error.message : String(error);
    throw new ExportError(`Export failed: ${detail} Try again, or choose a lower resolution.`, { cause: error });
  }
}

/** Saves a file through the browser's download flow. */
export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function exportFileName(project: Project): string {
  const base = project.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "export";
  return `${base} ${project.export.preset}.mp4`;
}
