/** Integer microseconds. Every time in the project model uses this unit. */
export type Micros = number;

export const MICROS_PER_SECOND = 1_000_000;

export function isMicros(value: number): value is Micros {
  return Number.isSafeInteger(value);
}

/** Converts seconds (UI boundary only) to integer microseconds. */
export function secondsToMicros(seconds: number): Micros {
  return Math.round(seconds * MICROS_PER_SECOND);
}

/** Converts microseconds to seconds (UI boundary only). */
export function microsToSeconds(t: Micros): number {
  return t / MICROS_PER_SECOND;
}

/** Start time of frame `index` at `fps`, rounded to the nearest microsecond. */
export function frameTime(index: number, fps: number): Micros {
  return Math.round((index * MICROS_PER_SECOND) / fps);
}

/** Index of the frame showing at time `t`: the largest `i` with `frameTime(i, fps) <= t`. */
export function frameIndexAt(t: Micros, fps: number): number {
  let i = Math.floor((t * fps) / MICROS_PER_SECOND);
  // Correct the float estimate so this is the exact inverse of frameTime.
  while (frameTime(i + 1, fps) <= t) i++;
  while (frameTime(i, fps) > t) i--;
  return i;
}

/** Number of frames needed to cover a range of `duration` microseconds. */
export function frameCount(duration: Micros, fps: number): number {
  if (duration <= 0) return 0;
  return frameIndexAt(duration - 1, fps) + 1;
}

export function clampTime(t: Micros, min: Micros, max: Micros): Micros {
  return Math.min(Math.max(t, min), max);
}
