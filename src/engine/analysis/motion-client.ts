import * as Comlink from "comlink";
import type { Micros } from "../time";
import type { MotionStep } from "./frame-diff";
import type { MotionWorkerApi } from "./motion.worker";

export interface MotionJob {
  file: Blob;
  trackIndex: number | undefined;
  range: { start: Micros; end: Micros };
}

/** Runs motion analysis for several source ranges in one worker, reporting overall progress. */
export async function analyzeMotion(
  jobs: MotionJob[],
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<MotionStep[][]> {
  const worker = new Worker(new URL("./motion.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<MotionWorkerApi>(worker);
  const cancel = () => void api.cancel();
  signal.addEventListener("abort", cancel);
  try {
    const total = jobs.reduce((n, j) => n + (j.range.end - j.range.start), 0) || 1;
    let done = 0;
    const results: MotionStep[][] = [];
    for (const job of jobs) {
      signal.throwIfAborted();
      const length = job.range.end - job.range.start;
      // Progress messages can arrive after the result; ignore them once the job has returned.
      let active = true;
      const progress = Comlink.proxy((f: number) => {
        if (active) onProgress(Math.min(1, (done + f * length) / total));
      });
      try {
        results.push(await api.analyze(job.file, job.trackIndex, job.range, progress));
      } finally {
        active = false;
      }
      done += length;
    }
    return results;
  } finally {
    signal.removeEventListener("abort", cancel);
    api[Comlink.releaseProxy]();
    worker.terminate();
  }
}
