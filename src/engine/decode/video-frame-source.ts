import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from "mediabunny";
import type { DrawableFrame, RenderContext } from "../frame-provider";
import { microsToSeconds, secondsToMicros, type Micros } from "../time";
import { FrameCache } from "./frame-cache";

class CachedFrame implements DrawableFrame {
  constructor(private readonly sample: VideoSample) {}

  get width(): number {
    return this.sample.displayWidth;
  }

  get height(): number {
    return this.sample.displayHeight;
  }

  draw(ctx: RenderContext, x: number, y: number, w: number, h: number): void {
    this.sample.draw(ctx, x, y, w, h);
  }

  close(): void {
    this.sample.close();
  }
}

interface Stream {
  iterator: AsyncGenerator<VideoSample, void, unknown>;
  /** End of the latest decoded frame; everything before it up to the stream start is cached or evicted. */
  decodedUntil: Micros;
  startedAt: Micros;
  done: boolean;
}

/** Restart the sequential decoder instead of decoding through gaps longer than this. */
const MAX_STREAM_GAP: Micros = 1_000_000;

/**
 * Decodes frames of one video file and keeps recent ones in an LRU cache.
 * Random access (`request`) serves seeking; sequential access (`advance`) serves playback and export.
 */
export class VideoFrameSource {
  private readonly cache: FrameCache<CachedFrame>;
  private queue: Promise<void> = Promise.resolve();
  private stream: Stream | null = null;
  private disposed = false;

  private constructor(
    private readonly input: Input,
    private readonly sink: VideoSampleSink,
    private readonly firstTimestamp: Micros,
    cacheSize: number,
  ) {
    this.cache = new FrameCache(cacheSize);
  }

  static async open(blob: Blob, cacheSize = 30): Promise<VideoFrameSource> {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("The video has no video track.");
      const first = secondsToMicros(await track.getFirstTimestamp());
      return new VideoFrameSource(input, new VideoSampleSink(track), first, cacheSize);
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  private clamp(sourceTime: Micros): Micros {
    return Math.max(sourceTime, this.firstTimestamp);
  }

  /** The decoded frame showing at `sourceTime`, or null if it hasn't been decoded yet. */
  getFrame(sourceTime: Micros): DrawableFrame | null {
    if (this.disposed) return null;
    return this.cache.lookup(this.clamp(sourceTime));
  }

  /** The frame at `sourceTime`, or the closest earlier decoded frame while decoding catches up. */
  getFrameOrPrevious(sourceTime: Micros): DrawableFrame | null {
    if (this.disposed) return null;
    const t = this.clamp(sourceTime);
    return this.cache.lookup(t) ?? this.cache.lookupAtOrBefore(t);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  private insert(sample: VideoSample): Micros {
    const start = sample.microsecondTimestamp;
    const end = start + Math.max(sample.microsecondDuration, 1);
    this.cache.insert(start, end, new CachedFrame(sample));
    return end;
  }

  /** Decodes the single frame at `sourceTime` into the cache (seeking). */
  request(sourceTime: Micros): Promise<void> {
    const t = this.clamp(sourceTime);
    return this.enqueue(async () => {
      if (this.disposed || this.cache.lookup(t)) return;
      const sample = await this.sink.getSample(microsToSeconds(t));
      if (!sample) return;
      if (this.disposed) sample.close();
      else this.insert(sample);
    });
  }

  /**
   * Decodes sequentially until the frame at `sourceTime` plus `lookahead` is cached (playback and export).
   * Much faster than `request` for consecutive times because each packet is decoded once.
   */
  advance(sourceTime: Micros, lookahead: Micros = 0): Promise<void> {
    const t = this.clamp(sourceTime);
    return this.enqueue(async () => {
      if (this.disposed) return;
      let stream = this.stream;
      if (!stream || t < stream.startedAt || t > stream.decodedUntil + MAX_STREAM_GAP) {
        await this.stopStream();
        stream = this.stream = {
          iterator: this.sink.samples(microsToSeconds(t)),
          decodedUntil: t,
          startedAt: t,
          done: false,
        };
      }
      while (!stream.done && stream.decodedUntil <= t + lookahead) {
        const next = await stream.iterator.next();
        if (next.done) {
          stream.done = true;
          break;
        }
        if (this.disposed) {
          next.value.close();
          return;
        }
        stream.decodedUntil = this.insert(next.value);
      }
    });
  }

  private async stopStream(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (stream) await stream.iterator.return(undefined);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.stopStream();
    this.cache.clear();
    this.input.dispose();
  }
}
