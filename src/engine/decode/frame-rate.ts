import { MICROS_PER_SECOND, type Micros } from "../time";

export interface FrameRateStats {
  averageFps: number;
  isVariableFrameRate: boolean;
}

/**
 * Estimates frame rate from presentation timestamps (any order). A stream counts as variable frame rate
 * when more than 2% of frame intervals differ from the median by over 25%, which catches screen
 * recordings that drop frames while the screen is static.
 */
export function analyzeFrameTimestamps(timestamps: Micros[]): FrameRateStats {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]! - sorted[i - 1]!;
    if (d > 0) deltas.push(d);
  }
  if (deltas.length === 0) return { averageFps: 0, isVariableFrameRate: false };

  const span = sorted[sorted.length - 1]! - sorted[0]!;
  const averageFps = (deltas.length * MICROS_PER_SECOND) / span;
  const median = [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)]!;
  const outliers = deltas.filter((d) => Math.abs(d - median) > median * 0.25).length;
  return { averageFps, isVariableFrameRate: outliers > deltas.length * 0.02 };
}
