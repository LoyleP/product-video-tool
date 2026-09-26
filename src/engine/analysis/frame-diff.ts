import type { Micros } from "../time";

/** A normalized rectangle (0..1) in the analyzed frame. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What changed between two consecutive analysis frames (BUILD.md 7.6 step 2). */
export interface MotionStep {
  /** Time of the later frame, in source time. */
  time: Micros;
  /** Changed pixels as a fraction of the frame. */
  changed: number;
  /** Bounding box of changed pixels, or null when nothing changed. */
  bbox: NormRect | null;
  /** Centroid of changed pixels, or null when nothing changed. */
  centroid: { x: number; y: number } | null;
}

export const DIFF_THRESHOLD = 24;

/** Converts RGBA pixels to 8-bit luma. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
  }
  return gray;
}

/** Diffs two grayscale frames and summarizes where they differ by more than `threshold`. */
export function diffFrames(
  prev: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
  time: Micros,
  threshold = DIFF_THRESHOLD,
): MotionStep {
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (Math.abs(prev[row + x]! - next[row + x]!) <= threshold) continue;
      count++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (count === 0) return { time, changed: 0, bbox: null, centroid: null };
  return {
    time,
    changed: count / (width * height),
    bbox: { x: minX / width, y: minY / height, w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height },
    centroid: { x: (sumX / count + 0.5) / width, y: (sumY / count + 0.5) / height },
  };
}
