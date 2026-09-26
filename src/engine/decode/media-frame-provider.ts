import type { DrawableFrame, FrameProvider } from "../frame-provider";
import type { Micros } from "../time";
import { VideoFrameSource } from "./video-frame-source";

/**
 * FrameProvider backed by one VideoFrameSource per video asset.
 * `getFrame` returns the latest decoded frame at or before the time: exact once `request` or `advance`
 * has resolved for that time, and the last good frame while a seek is still decoding (BUILD.md 7.1).
 */
export class MediaFrameProvider implements FrameProvider {
  private readonly sources = new Map<string, VideoFrameSource>();

  async open(assetId: string, blob: Blob, trackIndex?: number): Promise<void> {
    if (this.sources.has(assetId)) return;
    const source = await VideoFrameSource.open(blob, trackIndex);
    if (this.sources.has(assetId)) source.dispose();
    else this.sources.set(assetId, source);
  }

  getFrame(assetId: string, sourceTime: Micros): DrawableFrame | null {
    return this.sources.get(assetId)?.getFrameOrPrevious(sourceTime) ?? null;
  }

  /** True when the exact frame for `sourceTime` is decoded. */
  hasExactFrame(assetId: string, sourceTime: Micros): boolean {
    return this.sources.get(assetId)?.getFrame(sourceTime) != null;
  }

  request(assetId: string, sourceTime: Micros): Promise<void> {
    return this.sources.get(assetId)?.request(sourceTime) ?? Promise.resolve();
  }

  advance(assetId: string, sourceTime: Micros, lookahead: Micros = 0): Promise<void> {
    return this.sources.get(assetId)?.advance(sourceTime, lookahead) ?? Promise.resolve();
  }

  dispose(): void {
    for (const source of this.sources.values()) source.dispose();
    this.sources.clear();
  }
}
