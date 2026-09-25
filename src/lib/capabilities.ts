/**
 * Browser capability detection. Everything is feature-detected, never inferred
 * from the user agent (BUILD.md section 4).
 */

export interface Capabilities {
  videoDecoder: boolean;
  videoEncoder: boolean;
  audioDecoder: boolean;
  audioEncoder: boolean;
  offscreenCanvas: boolean;
  workers: boolean;
  getDisplayMedia: boolean;
  getUserMedia: boolean;
  webgpu: boolean;
  opfs: boolean;
  indexedDB: boolean;
  storageEstimate: boolean;
  clipboardItem: boolean;
  /** True when the device has a precise pointer (mouse or trackpad). */
  finePointer: boolean;
}

export interface CodecSupport {
  h264_1080p: boolean;
  h264_1440p: boolean;
  h264_2160p: boolean;
  vp9_1080p: boolean;
  aac: boolean;
  opus: boolean;
  webgpuAdapter: boolean;
}

/** The subset of the global scope that detection reads, so tests can pass a fake. */
export type CapabilityEnv = Partial<{
  VideoDecoder: unknown;
  VideoEncoder: unknown;
  AudioDecoder: unknown;
  AudioEncoder: unknown;
  OffscreenCanvas: unknown;
  Worker: unknown;
  indexedDB: unknown;
  ClipboardItem: unknown;
  navigator: Partial<{
    mediaDevices: Partial<{ getDisplayMedia: unknown; getUserMedia: unknown }>;
    storage: Partial<{ getDirectory: unknown; estimate: unknown }>;
    gpu: unknown;
  }>;
  matchMedia: (query: string) => { matches: boolean };
}>;

const isFn = (value: unknown) => typeof value === "function";

export function detectCapabilities(env: CapabilityEnv = globalThis as CapabilityEnv): Capabilities {
  const nav = env.navigator;
  return {
    videoDecoder: isFn(env.VideoDecoder),
    videoEncoder: isFn(env.VideoEncoder),
    audioDecoder: isFn(env.AudioDecoder),
    audioEncoder: isFn(env.AudioEncoder),
    offscreenCanvas: isFn(env.OffscreenCanvas),
    workers: isFn(env.Worker),
    getDisplayMedia: isFn(nav?.mediaDevices?.getDisplayMedia),
    getUserMedia: isFn(nav?.mediaDevices?.getUserMedia),
    webgpu: nav?.gpu != null,
    opfs: isFn(nav?.storage?.getDirectory),
    indexedDB: env.indexedDB != null,
    storageEstimate: isFn(nav?.storage?.estimate),
    clipboardItem: isFn(env.ClipboardItem),
    finePointer: env.matchMedia ? env.matchMedia("(any-pointer: fine)").matches : false,
  };
}

/** The editor needs a desktop-class device with a precise pointer; codec gaps are handled per feature. */
export function isEditorSupported(caps: Capabilities): boolean {
  return caps.finePointer;
}

// H.264 High profile at the lowest level that fits each resolution at 60 fps.
const H264_PROBES = {
  h264_1080p: { codec: "avc1.64002a", width: 1920, height: 1080 },
  h264_1440p: { codec: "avc1.640032", width: 2560, height: 1440 },
  h264_2160p: { codec: "avc1.640034", width: 3840, height: 2160 },
} as const;

async function probeVideo(codec: string, width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate: 12_000_000,
      framerate: 60,
    });
    return supported === true;
  } catch {
    return false;
  }
}

async function probeAudio(codec: string): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const { supported } = await AudioEncoder.isConfigSupported({
      codec,
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
    return supported === true;
  } catch {
    return false;
  }
}

async function probeWebGpuAdapter(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

/** Asks the browser which encoders it can actually configure. Browser only. */
export async function probeCodecSupport(): Promise<CodecSupport> {
  const [h264_1080p, h264_1440p, h264_2160p, vp9_1080p, aac, opus, webgpuAdapter] = await Promise.all([
    probeVideo(H264_PROBES.h264_1080p.codec, H264_PROBES.h264_1080p.width, H264_PROBES.h264_1080p.height),
    probeVideo(H264_PROBES.h264_1440p.codec, H264_PROBES.h264_1440p.width, H264_PROBES.h264_1440p.height),
    probeVideo(H264_PROBES.h264_2160p.codec, H264_PROBES.h264_2160p.width, H264_PROBES.h264_2160p.height),
    probeVideo("vp09.00.40.08", 1920, 1080),
    probeAudio("mp4a.40.2"),
    probeAudio("opus"),
    probeWebGpuAdapter(),
  ]);
  return { h264_1080p, h264_1440p, h264_2160p, vp9_1080p, aac, opus, webgpuAdapter };
}
