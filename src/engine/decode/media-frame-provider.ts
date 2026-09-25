import type { DrawableFrame, FrameProvider } from "../frame-provider";
import type { Micros } from "../time";
import { VideoFrameSource } from "./video-frame-source";

/** FrameProvider backed by one VideoFrameSource per video asset. */
export class MediaFrameProvider implements FrameProvider {
  private readonly sources = new Map<string, VideoFrameSource>();

  async open(assetId: string, blob: Blob): Promise<void> {
    if (this.sources.has(assetId)) return;
    const source = await VideoFrameSource.open(blob);
    if (this.sources.has(assetId)) source.dispose();
    else this.sources.set(assetId, source);
  }

  getFrame(assetId: string, sourceTime: Micros): DrawableFrame | null {
    return this.sources.get(assetId)?.getFrame(sourceTime) ?? null;
  }

  request(assetId: string, sourceTime: Micros): Promise<void> {
    return this.sources.get(assetId)?.request(sourceTime) ?? Promise.resolve();
  }

  dispose(): void {
    for (const source of this.sources.values()) source.dispose();
    this.sources.clear();
  }
}
