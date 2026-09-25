import type { ExportSettings } from "@/schema/project";
import type { Size } from "../geometry";

export const PRESET_HEIGHTS = { "1080p": 1080, "1440p": 1440, "4k": 2160 } as const;

/** Output size for a preset, keeping the canvas aspect ratio with even dimensions (H.264 needs them). */
export function exportSize(preset: ExportSettings["preset"], canvas: Size, custom?: Size): Size {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (preset === "custom") {
    if (!custom) throw new Error("Custom export needs a size.");
    return { width: even(custom.width), height: even(custom.height) };
  }
  const aspect = canvas.width / canvas.height;
  const short = PRESET_HEIGHTS[preset];
  // Presets name the shorter side, so portrait canvases export 1080 wide, not 1080 tall.
  return aspect >= 1
    ? { width: even(short * aspect), height: short }
    : { width: short, height: even(short / aspect) };
}

const BITS_PER_PIXEL: Record<ExportSettings["quality"], number> = {
  standard: 0.06,
  high: 0.1,
  "lossless-ish": 0.25,
};

/** Target H.264 bitrate in bits per second. */
export function videoBitrate(size: Size, fps: number, quality: ExportSettings["quality"]): number {
  return Math.round(size.width * size.height * fps * BITS_PER_PIXEL[quality]);
}

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_BITRATE = 192_000;

/** OPFS directory holding finished exports. */
export const EXPORTS_DIR = "exports";
