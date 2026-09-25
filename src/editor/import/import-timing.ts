/** Measures drop-to-first-frame time, the Phase 1 acceptance metric (under 2 seconds). */
let startedAt: number | null = null;

export function markImportStart(): void {
  startedAt = performance.now();
}

/** Returns milliseconds since the import started, once, then resets. */
export function takeImportDuration(): number | null {
  if (startedAt === null) return null;
  const elapsed = performance.now() - startedAt;
  startedAt = null;
  return elapsed;
}
