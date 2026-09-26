import type { Micros } from "../time";
import type { MotionStep, NormRect } from "./frame-diff";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type StepKind = "idle" | "local" | "mixed" | "full";

export interface AnalysisOptions {
  /** Changes covering more of the frame than this are scrolls or page changes, and are ignored. */
  fullArea: number;
  /** Changes covering less than this are localized activity. */
  localArea: number;
  /** Changed pixels below this fraction are noise (cursor blink, compression): about 4 pixels at 160x90. */
  minChanged: number;
  /** Idle steps allowed inside a window, so pauses between keystrokes don't split it. */
  maxIdleGap: number;
  /** Minimum activity window length. */
  minWindow: Micros;
  /** Windows closer than this merge when their centers are near. */
  mergeGap: Micros;
  /** Maximum distance between centers (normalized) for merging. */
  mergeDistance: number;
  /** Zoom starts this long before activity, so it has arrived when activity begins. */
  leadIn: Micros;
  /** Zoom holds this long after activity ends. */
  holdAfter: Micros;
}

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  fullArea: 0.6,
  localArea: 0.35,
  minChanged: 0.0003,
  maxIdleGap: 2,
  minWindow: 400_000,
  mergeGap: 700_000,
  mergeDistance: 0.2,
  leadIn: 400_000,
  holdAfter: 800_000,
};

/** A suggested zoom in source time (BUILD.md 7.6 step 5). */
export interface ZoomProposal {
  start: Micros;
  end: Micros;
  scale: number;
  focus: { x: number; y: number };
}

export function classifyStep(step: MotionStep, o: AnalysisOptions = DEFAULT_ANALYSIS): StepKind {
  if (!step.bbox || step.changed < o.minChanged) return "idle";
  const area = step.bbox.w * step.bbox.h;
  if (area > o.fullArea) return "full";
  if (area < o.localArea) return "local";
  return "mixed";
}

interface Window {
  start: Micros;
  end: Micros;
  steps: MotionStep[];
}

const union = (a: NormRect, b: NormRect): NormRect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

function center(window: Window): { x: number; y: number } {
  let wx = 0;
  let wy = 0;
  let total = 0;
  for (const s of window.steps) {
    if (!s.centroid) continue;
    wx += s.centroid.x * s.changed;
    wy += s.centroid.y * s.changed;
    total += s.changed;
  }
  return total > 0 ? { x: wx / total, y: wy / total } : { x: 0.5, y: 0.5 };
}

/** Groups consecutive localized steps into activity windows (7.6 step 4). */
export function activityWindows(steps: readonly MotionStep[], interval: Micros, o: AnalysisOptions = DEFAULT_ANALYSIS): Window[] {
  const windows: Window[] = [];
  let current: Window | null = null;
  let idle = 0;
  for (const step of steps) {
    const kind = classifyStep(step, o);
    if (kind === "local") {
      if (!current) current = { start: step.time - interval, end: step.time, steps: [] };
      current.steps.push(step);
      current.end = step.time;
      idle = 0;
      continue;
    }
    if (kind === "idle" && current && idle < o.maxIdleGap) {
      idle++;
      continue;
    }
    if (current) windows.push(current);
    current = null;
    idle = 0;
  }
  if (current) windows.push(current);

  const long = windows.filter((w) => w.end - w.start > o.minWindow);
  const merged: Window[] = [];
  for (const w of long) {
    const last = merged[merged.length - 1];
    if (last && w.start - last.end < o.mergeGap) {
      const a = center(last);
      const b = center(w);
      if (Math.hypot(a.x - b.x, a.y - b.y) < o.mergeDistance) {
        last.end = w.end;
        last.steps.push(...w.steps);
        continue;
      }
    }
    merged.push({ ...w, steps: [...w.steps] });
  }
  return merged;
}

/**
 * Turns motion steps into zoom proposals (7.6 steps 3 to 5): focus at the weighted center of activity,
 * scale = clamp(0.7 / max(bboxW, bboxH), 1.4, 2.5). Proposals are padded, kept inside `range` and
 * made non-overlapping.
 */
export function proposeZooms(
  steps: readonly MotionStep[],
  interval: Micros,
  range: { start: Micros; end: Micros },
  o: AnalysisOptions = DEFAULT_ANALYSIS,
): ZoomProposal[] {
  const proposals: ZoomProposal[] = [];
  for (const window of activityWindows(steps, interval, o)) {
    let box: NormRect | null = null;
    for (const s of window.steps) if (s.bbox) box = box ? union(box, s.bbox) : s.bbox;
    if (!box) continue;
    const scale = Math.min(2.5, Math.max(1.4, 0.7 / Math.max(box.w, box.h)));
    const c = center(window);
    const previousEnd = proposals[proposals.length - 1]?.end ?? range.start;
    const start = Math.max(range.start, previousEnd, window.start - o.leadIn);
    const end = Math.min(range.end, window.end + o.holdAfter);
    if (end - start < o.minWindow) continue;
    proposals.push({
      start: Math.round(start),
      end: Math.round(end),
      scale: Math.round(scale * 10) / 10,
      focus: { x: clamp01(c.x), y: clamp01(c.y) },
    });
  }
  return proposals;
}
