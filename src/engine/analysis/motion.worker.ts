/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import { pickVideoTrack } from "../decode/probe";
import { microsToSeconds, type Micros } from "../time";
import { diffFrames, toGray, type MotionStep } from "./frame-diff";
import { ANALYSIS_INTERVAL, ANALYSIS_WIDTH } from "./settings";

let canceled = false;

const api = {
  /**
   * Decodes `range` of a video at 10 fps, downscaled to 160 px wide in grayscale, and diffs consecutive
   * frames (BUILD.md 7.6 steps 1 and 2).
   */
  async analyze(
    file: Blob,
    trackIndex: number | undefined,
    range: { start: Micros; end: Micros },
    onProgress: (fraction: number) => void,
  ): Promise<MotionStep[]> {
    canceled = false;
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await pickVideoTrack(input, trackIndex);
      if (!track) throw new Error("The video has no video track.");
      const [dw, dh] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
      const width = ANALYSIS_WIDTH;
      const height = Math.max(1, Math.round((ANALYSIS_WIDTH * dh) / dw));
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Couldn't create a canvas for analysis.");

      const times: Micros[] = [];
      for (let t = range.start; t < range.end; t += ANALYSIS_INTERVAL) times.push(t);
      const sink = new VideoSampleSink(track);
      const steps: MotionStep[] = [];
      let previous: Uint8Array | null = null;
      let index = 0;
      for await (const sample of sink.samplesAtTimestamps(times.map(microsToSeconds))) {
        const t = times[index++]!;
        if (canceled) {
          sample?.close();
          throw new DOMException("Analysis canceled.", "AbortError");
        }
        if (!sample) continue;
        sample.draw(ctx, 0, 0, width, height);
        sample.close();
        const gray = toGray(ctx.getImageData(0, 0, width, height).data, width, height);
        if (previous) steps.push(diffFrames(previous, gray, width, height, t));
        previous = gray;
        if (index % 10 === 0) onProgress(index / times.length);
      }
      onProgress(1);
      return steps;
    } finally {
      input.dispose();
    }
  },

  cancel(): void {
    canceled = true;
  },
};

export type MotionWorkerApi = typeof api;

Comlink.expose(api);
