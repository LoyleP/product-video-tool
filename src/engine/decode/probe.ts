import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";
import { secondsToMicros, type Micros } from "../time";
import { analyzeFrameTimestamps } from "./frame-rate";

export interface VideoProbe {
  width: number;
  height: number;
  duration: Micros;
  codec: string;
  hasAudio: boolean;
  averageFps: number;
  isVariableFrameRate: boolean;
}

export type MediaProbeErrorCode = "unreadable" | "no-video" | "undecodable" | "empty";

export class MediaProbeError extends Error {
  constructor(
    readonly code: MediaProbeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaProbeError";
  }
}

const FRAME_RATE_SAMPLE = 240;

/** Reads the metadata the editor needs from a video file, without decoding frames. */
export async function probeVideo(blob: Blob): Promise<VideoProbe> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) {
      throw new MediaProbeError("unreadable", "This file isn't a video format we can read. Use MP4, MOV or WebM.");
    }
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new MediaProbeError("no-video", "This file has no video track.");

    const codec = (await track.getCodec()) ?? "unknown";
    if (!(await track.canDecode())) {
      throw new MediaProbeError(
        "undecodable",
        codec === "hevc"
          ? "This browser can't decode HEVC (H.265) video. Re-export the recording as H.264, or try Chrome or Safari on a Mac."
          : `This browser can't decode ${codec.toUpperCase()} video. Re-export the recording as H.264.`,
      );
    }

    const [width, height, durationSeconds, audioTrack] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration([track]),
      input.getPrimaryAudioTrack(),
    ]);
    const duration = secondsToMicros(durationSeconds);
    if (duration <= 0 || width <= 0 || height <= 0) {
      throw new MediaProbeError("empty", "This video is empty or its size can't be read.");
    }

    const timestamps: Micros[] = [];
    const packets = new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true });
    for await (const packet of packets) {
      timestamps.push(secondsToMicros(packet.timestamp));
      if (timestamps.length >= FRAME_RATE_SAMPLE) break;
    }
    const { averageFps, isVariableFrameRate } = analyzeFrameTimestamps(timestamps);

    return { width, height, duration, codec, hasAudio: audioTrack !== null, averageFps, isVariableFrameRate };
  } finally {
    input.dispose();
  }
}
