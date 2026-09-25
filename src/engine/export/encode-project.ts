import { CanvasSource, EncodedAudioPacketSource, Mp4OutputFormat, Output, type Target } from "mediabunny";
import type { Project } from "@/schema/project";
import { MediaFrameProvider } from "../decode/media-frame-provider";
import type { Size } from "../geometry";
import { renderFrame } from "../render-frame";
import { frameCount, frameTime, microsToSeconds, type Micros } from "../time";
import { activeClips } from "../timeline";
import { AacTrackEncoder, measureAacDelay, type AacConfig } from "./aac-encoder";
import type { MixedAudio } from "./audio-mix";
import { AUDIO_BITRATE } from "./settings";

export interface EncodeRequest {
  project: Project;
  files: Record<string, Blob>;
  audio: MixedAudio | null;
  size: Size;
  fps: number;
  bitrate: number;
  range: { start: Micros; end: Micros };
}

export interface EncodeProgress {
  frame: number;
  totalFrames: number;
}

export class ExportCanceledError extends Error {
  constructor() {
    super("Export canceled.");
    this.name = "AbortError";
  }
}

/** Encode audio in one-second chunks, staying about this far ahead of the video. */
const AUDIO_LEAD: Micros = 1_000_000;

/**
 * Renders every frame of `range` with renderFrame on an OffscreenCanvas and encodes MP4 (H.264 + AAC)
 * into `target` (BUILD.md 7.4). Runs in a worker.
 */
export async function encodeProject(
  req: EncodeRequest,
  target: Target,
  onProgress: (p: EncodeProgress) => void,
  isCanceled: () => boolean,
): Promise<void> {
  const { project, size, fps, range, audio } = req;
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Couldn't create a 2D canvas for export.");

  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: "avc", bitrate: req.bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  const aacConfig: AacConfig | null = audio
    ? { sampleRate: audio.sampleRate, numberOfChannels: audio.channels.length, bitrate: AUDIO_BITRATE }
    : null;
  const audioSource = aacConfig ? new EncodedAudioPacketSource("aac") : null;
  if (audioSource) output.addAudioTrack(audioSource);

  const frames = new MediaFrameProvider();
  let aac: AacTrackEncoder | null = null;
  try {
    if (aacConfig && audioSource) aac = new AacTrackEncoder(aacConfig, audioSource, await measureAacDelay(aacConfig));
    for (const asset of Object.values(project.assets)) {
      const file = req.files[asset.id];
      if (asset.kind === "video" && file) await frames.open(asset.id, file);
    }
    await output.start();

    let audioFrames = 0;
    const audioLength = audio?.channels[0]?.length ?? 0;
    const pushAudioUntil = async (t: Micros) => {
      if (!audio || !aac) return;
      const until = Math.min(audioLength, Math.ceil(microsToSeconds(t) * audio.sampleRate));
      while (audioFrames < until) {
        const n = Math.min(audio.sampleRate, until - audioFrames);
        const planar = new Float32Array(n * audio.channels.length);
        audio.channels.forEach((channel, c) => planar.set(channel.subarray(audioFrames, audioFrames + n), c * n));
        await aac.encode(planar, n, audioFrames / audio.sampleRate);
        audioFrames += n;
      }
    };

    const totalFrames = frameCount(range.end - range.start, fps);
    const target = { ctx, width: size.width, height: size.height };
    for (let i = 0; i < totalFrames; i++) {
      if (isCanceled()) throw new ExportCanceledError();
      const local = frameTime(i, fps);
      const t = range.start + local;
      await pushAudioUntil(local + AUDIO_LEAD);
      for (const { clip, sourceTime } of activeClips(project, t)) await frames.advance(clip.assetId, sourceTime);
      renderFrame(target, project, t, frames);
      await video.add(microsToSeconds(local), microsToSeconds(frameTime(i + 1, fps) - local));
      onProgress({ frame: i + 1, totalFrames });
    }
    await pushAudioUntil(Number.MAX_SAFE_INTEGER);
    video.close();
    await aac?.finish();
    await output.finalize();
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
    throw error;
  } finally {
    aac?.close();
    frames.dispose();
  }
}
