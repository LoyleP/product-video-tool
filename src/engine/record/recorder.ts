import {
  canEncodeAudio,
  canEncodeVideo,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  type AudioCodec,
  type StreamTargetChunk,
  type VideoCodec,
} from "mediabunny";
import { videoBitrate } from "../export/settings";

/**
 * Screen, webcam and microphone recording (BUILD.md 7.5). Encodes live with Mediabunny's media stream
 * sources into one file, not MediaRecorder, so duration metadata and seeking are right. The screen is
 * video track 0 and the webcam (if any) video track 1; both share one timeline, so they stay in sync.
 */

export interface RecordingOptions {
  resolution: "1080p" | "1440p" | "native";
  fps: 30 | 60;
  /** Microphone deviceId, or null for no microphone. */
  microphoneId: string | null;
  /** Webcam deviceId, or null for no webcam. */
  webcamId: string | null;
  /** Ask the browser to include tab or system audio (Chromium; tabs everywhere, whole screen on Windows). */
  systemAudio: boolean;
}

export interface RecordingFormat {
  container: "mp4" | "webm";
  video: VideoCodec;
  audio: AudioCodec;
}

export interface RecordingResult {
  format: RecordingFormat;
  hasWebcam: boolean;
  hasAudio: boolean;
  /** Read back from the track, since browsers don't all honor the cursor constraint. */
  capture: { cursor: string | null; displaySurface: string | null };
  durationMs: number;
}

/** A recording failure whose message can be shown to the user as is. */
export class RecordingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RecordingError";
  }
}

/** Picks MP4 (H.264 + AAC) when possible, otherwise WebM (VP9 or VP8 + Opus). */
export async function chooseRecordingFormat(): Promise<RecordingFormat | null> {
  const size = { width: 1920, height: 1080 };
  if ((await canEncodeVideo("avc", size)) && (await canEncodeAudio("aac"))) {
    return { container: "mp4", video: "avc", audio: "aac" };
  }
  if (await canEncodeAudio("opus")) {
    if (await canEncodeVideo("vp9", size)) return { container: "webm", video: "vp9", audio: "opus" };
    if (await canEncodeVideo("vp8", size)) return { container: "webm", video: "vp8", audio: "opus" };
  }
  return null;
}

const RESOLUTION_LIMITS = {
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  native: null,
} as const;

function describeMediaError(error: unknown, what: string): RecordingError {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return new RecordingError(`${what} was blocked or canceled. Allow access and try again.`, { cause: error });
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new RecordingError(`${what} isn't available. Check that the device is connected.`, { cause: error });
  }
  if (name === "NotReadableError") {
    return new RecordingError(`${what} is in use by another app or can't be read. Close other apps using it and try again.`, { cause: error });
  }
  return new RecordingError(`${what} failed to start.`, { cause: error });
}

export class Recorder {
  private stopping: Promise<RecordingResult> | null = null;
  private readonly startedAt = performance.now();
  private endedListener: (() => void) | null = null;
  private errorListener: ((error: RecordingError) => void) | null = null;

  private constructor(
    private readonly output: Output,
    private readonly format: RecordingFormat,
    private readonly streams: MediaStream[],
    private readonly screenTrack: MediaStreamVideoTrack,
    readonly webcamStream: MediaStream | null,
    private readonly hasAudio: boolean,
    private readonly audioContext: AudioContext | null,
    errors: Promise<void>[],
  ) {
    // The browser's own "Stop sharing" button ends the screen track.
    screenTrack.addEventListener("ended", () => this.endedListener?.());
    Promise.race(errors).catch((e: unknown) => {
      this.errorListener?.(new RecordingError("Recording stopped because encoding failed.", { cause: e }));
    });
  }

  /** Asks for the screen (browser picker), microphone and webcam, then starts encoding into `target`. */
  static async start(
    options: RecordingOptions,
    target: WritableStream<StreamTargetChunk>,
    format: RecordingFormat,
  ): Promise<Recorder> {
    const streams: MediaStream[] = [];
    const stopAll = () => streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    try {
      // Microphone and webcam first, so their permission prompts don't appear after the screen picker.
      let mic: MediaStream | null = null;
      if (options.microphoneId) {
        mic = await navigator.mediaDevices
          .getUserMedia({
            audio: { deviceId: { exact: options.microphoneId }, echoCancellation: true, noiseSuppression: true },
          })
          .catch((e: unknown) => {
            throw describeMediaError(e, "The microphone");
          });
        streams.push(mic);
      }
      let cam: MediaStream | null = null;
      if (options.webcamId) {
        cam = await navigator.mediaDevices
          .getUserMedia({
            video: { deviceId: { exact: options.webcamId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          })
          .catch((e: unknown) => {
            throw describeMediaError(e, "The camera");
          });
        streams.push(cam);
      }

      const limit = RESOLUTION_LIMITS[options.resolution];
      const displayOptions = {
        video: {
          frameRate: { ideal: options.fps, max: options.fps },
          ...(limit ? { width: { max: limit.width }, height: { max: limit.height } } : {}),
          cursor: "always",
        },
        audio: options.systemAudio,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: options.systemAudio ? "include" : "exclude",
      } as DisplayMediaStreamOptions;
      const display = await navigator.mediaDevices.getDisplayMedia(displayOptions).catch((e: unknown) => {
        throw describeMediaError(e, "Screen recording");
      });
      streams.push(display);

      const screenTrack = display.getVideoTracks()[0] as MediaStreamVideoTrack | undefined;
      if (!screenTrack) throw new RecordingError("The browser didn't provide a screen to record.");
      const settings = screenTrack.getSettings() as MediaTrackSettings & { cursor?: string; displaySurface?: string };
      const size = { width: settings.width ?? 1920, height: settings.height ?? 1080 };

      // One audio track: system audio and microphone mixed together when both are present.
      const audioInputs = [...display.getAudioTracks(), ...(mic?.getAudioTracks() ?? [])];
      let audioContext: AudioContext | null = null;
      let audioTrack: MediaStreamAudioTrack | null = (audioInputs[0] as MediaStreamAudioTrack | undefined) ?? null;
      if (audioInputs.length > 1) {
        audioContext = new AudioContext({ sampleRate: 48_000 });
        const destination = audioContext.createMediaStreamDestination();
        for (const input of audioInputs) audioContext.createMediaStreamSource(new MediaStream([input])).connect(destination);
        audioTrack = destination.stream.getAudioTracks()[0] as MediaStreamAudioTrack;
      }

      const output = new Output({
        format: format.container === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
        target: new StreamTarget(target, { chunked: true }),
      });
      const screenSource = new MediaStreamVideoTrackSource(screenTrack, {
        codec: format.video,
        bitrate: videoBitrate(size, options.fps, "high"),
        sizeChangeBehavior: "contain",
      });
      output.addVideoTrack(screenSource, { frameRate: options.fps });
      const errors = [screenSource.errorPromise];

      const camTrack = cam?.getVideoTracks()[0] as MediaStreamVideoTrack | undefined;
      if (camTrack) {
        const camSettings = camTrack.getSettings();
        const camSource = new MediaStreamVideoTrackSource(camTrack, {
          codec: format.video,
          bitrate: videoBitrate({ width: camSettings.width ?? 1280, height: camSettings.height ?? 720 }, 30, "high"),
          sizeChangeBehavior: "contain",
        });
        output.addVideoTrack(camSource, { frameRate: 30 });
        errors.push(camSource.errorPromise);
      }
      if (audioTrack) {
        const audioSource = new MediaStreamAudioTrackSource(audioTrack, { codec: format.audio, bitrate: 160_000 });
        output.addAudioTrack(audioSource);
        errors.push(audioSource.errorPromise);
      }

      await output.start();
      const recorder = new Recorder(output, format, streams, screenTrack, cam, audioTrack !== null, audioContext, errors);
      recorder.capture = { cursor: settings.cursor ?? null, displaySurface: settings.displaySurface ?? null };
      return recorder;
    } catch (error) {
      stopAll();
      if (error instanceof RecordingError) throw error;
      throw new RecordingError("Recording couldn't start.", { cause: error });
    }
  }

  private capture: RecordingResult["capture"] = { cursor: null, displaySurface: null };

  get elapsedMs(): number {
    return performance.now() - this.startedAt;
  }

  /** Called when the user ends sharing from the browser's own UI. */
  onEnded(listener: () => void): void {
    this.endedListener = listener;
  }

  onError(listener: (error: RecordingError) => void): void {
    this.errorListener = listener;
  }

  /** Finishes the file and releases the camera, microphone and screen. */
  stop(): Promise<RecordingResult> {
    this.stopping ??= (async () => {
      const durationMs = this.elapsedMs;
      try {
        await this.output.finalize();
      } finally {
        this.release();
      }
      return {
        format: this.format,
        hasWebcam: this.webcamStream !== null,
        hasAudio: this.hasAudio,
        capture: this.capture,
        durationMs,
      };
    })();
    return this.stopping;
  }

  /** Abandons the recording. */
  async cancel(): Promise<void> {
    try {
      if (this.output.state !== "finalized" && this.output.state !== "canceled") await this.output.cancel();
    } finally {
      this.release();
    }
  }

  private release(): void {
    this.endedListener = null;
    for (const stream of this.streams) for (const track of stream.getTracks()) track.stop();
    void this.audioContext?.close();
  }
}
