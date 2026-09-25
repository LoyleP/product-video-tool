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

/** Decodes frames of one video file on demand and keeps recent ones in an LRU cache. */
export class VideoFrameSource {
  private readonly cache: FrameCache<CachedFrame>;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  private constructor(
    private readonly input: Input,
    private readonly sink: VideoSampleSink,
    private readonly firstTimestamp: Micros,
    cacheSize: number,
  ) {
    this.cache = new FrameCache(cacheSize);
  }

  static async open(blob: Blob, cacheSize = 60): Promise<VideoFrameSource> {
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

  /** The decoded frame showing at `sourceTime`, or null if it hasn't been decoded yet. */
  getFrame(sourceTime: Micros): DrawableFrame | null {
    if (this.disposed) return null;
    return this.cache.lookup(Math.max(sourceTime, this.firstTimestamp));
  }

  /** Decodes the frame at `sourceTime` into the cache. Requests run one at a time. */
  request(sourceTime: Micros): Promise<void> {
    const t = Math.max(sourceTime, this.firstTimestamp);
    const run = async () => {
      if (this.disposed || this.cache.lookup(t)) return;
      const sample = await this.sink.getSample(microsToSeconds(t));
      if (!sample) return;
      if (this.disposed) {
        sample.close();
        return;
      }
      const start = sample.microsecondTimestamp;
      this.cache.insert(start, start + sample.microsecondDuration, new CachedFrame(sample));
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.clear();
    this.input.dispose();
  }
}
