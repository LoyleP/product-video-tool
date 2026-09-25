import type { Micros } from "./time";

/** A decoded frame that knows how to draw itself (including rotation metadata). */
export interface DrawableFrame {
  readonly width: number;
  readonly height: number;
  draw(ctx: RenderContext, x: number, y: number, w: number, h: number): void;
}

/** Synchronous access to already-decoded frames. Returns null when the frame is not ready. */
export interface FrameProvider {
  getFrame(assetId: string, sourceTime: Micros): DrawableFrame | null;
}

export type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RenderTarget {
  ctx: RenderContext;
  /** Output size in pixels. Must have the project canvas aspect ratio. */
  width: number;
  height: number;
}
