import { EncodedPacket, type EncodedAudioPacketSource } from "mediabunny";

export interface AacConfig {
  sampleRate: number;
  numberOfChannels: number;
  bitrate: number;
}

const AAC_LC = "mp4a.40.2";

function encoderConfig(cfg: AacConfig): AudioEncoderConfig {
  return { codec: AAC_LC, sampleRate: cfg.sampleRate, numberOfChannels: cfg.numberOfChannels, bitrate: cfg.bitrate };
}

function planarAudioData(planar: Float32Array<ArrayBuffer>, frames: number, cfg: AacConfig, timestamp: number): AudioData {
  return new AudioData({
    format: "f32-planar",
    sampleRate: cfg.sampleRate,
    numberOfFrames: frames,
    numberOfChannels: cfg.numberOfChannels,
    timestamp,
    data: planar,
  });
}

/**
 * Measures the AAC encoder's delay (priming samples) on this browser and platform by encoding a tone burst
 * and decoding it back. AAC encoders prepend ~1024 to 2112 samples of priming; without compensation the
 * sound in the exported file is late by that much (44 ms at 48 kHz on macOS, more than a frame at 30 fps).
 */
export async function measureAacDelay(cfg: AacConfig): Promise<number> {
  const frames = Math.round(cfg.sampleRate / 2);
  const onset = Math.round(cfg.sampleRate / 10);
  const planar = new Float32Array(frames * cfg.numberOfChannels);
  for (let c = 0; c < cfg.numberOfChannels; c++) {
    for (let i = onset; i < onset + 2048; i++) {
      planar[c * frames + i] = 0.8 * Math.sin((2 * Math.PI * 1000 * i) / cfg.sampleRate);
    }
  }

  const chunks: EncodedAudioChunk[] = [];
  let decoderConfig: AudioDecoderConfig | undefined;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      chunks.push(chunk);
      decoderConfig ??= meta?.decoderConfig;
    },
    error: (e) => (failure = e),
  });
  encoder.configure(encoderConfig(cfg));
  const data = planarAudioData(planar, frames, cfg, 0);
  encoder.encode(data);
  data.close();
  await encoder.flush();
  encoder.close();

  const decoded: Float32Array[] = [];
  const decoder = new AudioDecoder({
    output: (audio) => {
      const channel = new Float32Array(audio.numberOfFrames);
      audio.copyTo(channel, { planeIndex: 0, format: "f32-planar" });
      decoded.push(channel);
      audio.close();
    },
    error: (e) => (failure = e),
  });
  decoder.configure(decoderConfig ?? { codec: AAC_LC, sampleRate: cfg.sampleRate, numberOfChannels: cfg.numberOfChannels });
  for (const chunk of chunks) decoder.decode(chunk);
  await decoder.flush();
  decoder.close();
  if (failure) throw failure;

  const signal = new Float32Array(decoded.reduce((n, d) => n + d.length, 0));
  let offset = 0;
  for (const d of decoded) {
    signal.set(d, offset);
    offset += d.length;
  }
  return detectDelay(signal, onset);
}

/** Samples between the known onset of a tone burst and where it appears in `signal`. */
export function detectDelay(signal: Float32Array, onset: number): number {
  let peak = 0;
  for (const v of signal) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return 0;
  // Half the peak skips the low-level pre-echo AAC smears before transients.
  const threshold = peak / 2;
  const index = signal.findIndex((v) => Math.abs(v) >= threshold);
  return Math.max(0, index - onset);
}

/**
 * Encodes planar PCM to AAC with WebCodecs and feeds the packets to Mediabunny, shifted back by the
 * encoder delay. The negative start makes the muxer write an MP4 edit list, so players skip the priming.
 */
export class AacTrackEncoder {
  private readonly encoder: AudioEncoder;
  private chain: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private sentConfig = false;

  constructor(
    private readonly cfg: AacConfig,
    private readonly source: EncodedAudioPacketSource,
    delaySamples: number,
  ) {
    const shift = delaySamples / cfg.sampleRate;
    this.encoder = new AudioEncoder({
      output: (chunk, meta) => {
        const packet = EncodedPacket.fromEncodedChunk(chunk);
        const shifted = packet.clone({ timestamp: packet.timestamp - shift });
        const first = !this.sentConfig;
        this.sentConfig = true;
        this.chain = this.chain.then(() => this.source.add(shifted, first ? meta : undefined));
        this.chain.catch((e: unknown) => (this.failure ??= e));
      },
      error: (e) => (this.failure ??= e),
    });
    this.encoder.configure(encoderConfig(cfg));
  }

  /** Encodes `frames` samples per channel of planar PCM starting at `timestamp` seconds. */
  async encode(planar: Float32Array<ArrayBuffer>, frames: number, timestamp: number): Promise<void> {
    if (this.failure) throw this.failure;
    const data = planarAudioData(planar, frames, this.cfg, Math.round(timestamp * 1e6));
    this.encoder.encode(data);
    data.close();
    // Respect encoder and muxer backpressure.
    if (this.encoder.encodeQueueSize > 4) await this.chain;
  }

  async finish(): Promise<void> {
    await this.encoder.flush();
    this.encoder.close();
    await this.chain;
    this.source.close();
    if (this.failure) throw this.failure;
  }

  close(): void {
    if (this.encoder.state !== "closed") this.encoder.close();
  }
}
