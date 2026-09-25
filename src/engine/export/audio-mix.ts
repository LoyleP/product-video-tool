import type { Clip, Project } from "@/schema/project";
import { AudioTrackReader } from "../audio/audio-track-reader";
import { placeBuffer } from "../audio/schedule";
import { microsToSeconds, secondsToMicros, type Micros } from "../time";

export interface MixedAudio {
  sampleRate: number;
  /** One Float32Array per channel, starting at the export range start. */
  channels: Float32Array[];
}

/** Clips whose audio is audible: the embedded audio of video clips, unless muted. */
function audibleClips(project: Project): Clip[] {
  const clips: Clip[] = [];
  for (const track of project.videoTracks) {
    for (const clip of track.clips) if (!clip.muted && project.assets[clip.assetId]?.hasAudio) clips.push(clip);
  }
  return clips;
}

/**
 * Mixes every audible clip over `range` into a stereo PCM buffer with OfflineAudioContext (BUILD.md 7.4).
 * Main thread only: Web Audio isn't available in workers. Returns null when nothing is audible.
 */
export async function mixProjectAudio(
  project: Project,
  files: Record<string, Blob>,
  range: { start: Micros; end: Micros },
  sampleRate: number,
  signal?: AbortSignal,
): Promise<MixedAudio | null> {
  const clips = audibleClips(project);
  if (clips.length === 0 || range.end <= range.start) return null;

  const length = Math.ceil(microsToSeconds(range.end - range.start) * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  let scheduled = 0;

  for (const clip of clips) {
    const file = files[clip.assetId];
    if (!file) continue;
    const reader = await AudioTrackReader.open(file);
    if (!reader) continue;
    try {
      for await (const wrapped of reader.buffers(clip.sourceIn, clip.sourceOut)) {
        signal?.throwIfAborted();
        const placed = placeBuffer(
          clip,
          { start: secondsToMicros(wrapped.timestamp), duration: secondsToMicros(wrapped.duration) },
          range,
        );
        if (!placed) continue;
        const node = ctx.createBufferSource();
        node.buffer = wrapped.buffer;
        node.playbackRate.value = clip.speed;
        node.connect(ctx.destination);
        node.start(
          microsToSeconds(placed.at - range.start),
          microsToSeconds(placed.offset),
          microsToSeconds(placed.sourceDuration),
        );
        scheduled++;
      }
    } finally {
      reader.dispose();
    }
  }
  if (scheduled === 0) return null;

  const rendered = await ctx.startRendering();
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c).slice());
  return { sampleRate, channels };
}
