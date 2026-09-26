import type { Micros } from "../time";

/** Analysis frame width in pixels (BUILD.md 7.6 step 1). */
export const ANALYSIS_WIDTH = 160;
/** Analysis frame interval: about 10 fps. */
export const ANALYSIS_INTERVAL: Micros = 100_000;
