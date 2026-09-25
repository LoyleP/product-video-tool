import { DEFAULT_FONT_FAMILY } from "@/engine/text/fonts";
import type { CompositionStyle, TextLayer } from "./project";

/** Text properties a preset can carry. */
export interface PresetTextStyle {
  family: string;
  weight: number;
  color: string;
}

/** A preset is a partial composition style plus an optional text style (BUILD.md section 8). */
export interface StylePreset {
  id: string;
  name: string;
  style: Partial<Pick<CompositionStyle, "background" | "padding" | "cornerRadius" | "shadow" | "zoomBackgroundBlur" | "device">>;
  text?: PresetTextStyle;
  builtIn: boolean;
}

/** Eight original presets. */
export const BUILT_IN_PRESETS: StylePreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    builtIn: true,
    style: {
      background: { type: "gradient", angle: 160, stops: [{ color: "#1e1b4b", at: 0 }, { color: "#020617", at: 1 }] },
      padding: 0.1,
      cornerRadius: 28,
      shadow: { blur: 80, offsetY: 30, opacity: 0.55 },
      zoomBackgroundBlur: 12,
    },
    text: { family: DEFAULT_FONT_FAMILY, weight: 650, color: "#f8fafc" },
  },
  {
    id: "daylight",
    name: "Daylight",
    builtIn: true,
    style: {
      background: { type: "gradient", angle: 180, stops: [{ color: "#e0f2fe", at: 0 }, { color: "#f8fafc", at: 1 }] },
      padding: 0.09,
      cornerRadius: 22,
      shadow: { blur: 50, offsetY: 18, opacity: 0.18 },
      zoomBackgroundBlur: 0,
    },
    text: { family: DEFAULT_FONT_FAMILY, weight: 700, color: "#0f172a" },
  },
  {
    id: "sunset",
    name: "Sunset",
    builtIn: true,
    style: {
      background: {
        type: "gradient",
        angle: 135,
        stops: [{ color: "#fb923c", at: 0 }, { color: "#e11d48", at: 0.55 }, { color: "#7e22ce", at: 1 }],
      },
      padding: 0.08,
      cornerRadius: 26,
      shadow: { blur: 70, offsetY: 26, opacity: 0.45 },
      zoomBackgroundBlur: 16,
    },
    text: { family: "Studio Space Grotesk", weight: 700, color: "#ffffff" },
  },
  {
    id: "lagoon",
    name: "Lagoon",
    builtIn: true,
    style: {
      background: { type: "gradient", angle: 150, stops: [{ color: "#06b6d4", at: 0 }, { color: "#0f766e", at: 1 }] },
      padding: 0.08,
      cornerRadius: 24,
      shadow: { blur: 60, offsetY: 24, opacity: 0.4 },
      zoomBackgroundBlur: 10,
    },
    text: { family: DEFAULT_FONT_FAMILY, weight: 650, color: "#ffffff" },
  },
  {
    id: "mono",
    name: "Mono",
    builtIn: true,
    style: {
      background: { type: "solid", color: "#111113" },
      padding: 0.07,
      cornerRadius: 14,
      shadow: { blur: 40, offsetY: 16, opacity: 0.6 },
      zoomBackgroundBlur: 0,
    },
    text: { family: "Studio JetBrains Mono", weight: 600, color: "#e4e4e7" },
  },
  {
    id: "paper",
    name: "Paper",
    builtIn: true,
    style: {
      background: { type: "solid", color: "#f5f1e8" },
      padding: 0.1,
      cornerRadius: 18,
      shadow: { blur: 36, offsetY: 14, opacity: 0.16 },
      zoomBackgroundBlur: 0,
    },
    text: { family: "Studio Fraunces", weight: 600, color: "#1c1917" },
  },
  {
    id: "aurora",
    name: "Aurora",
    builtIn: true,
    style: {
      background: {
        type: "gradient",
        angle: 120,
        stops: [{ color: "#22d3ee", at: 0 }, { color: "#818cf8", at: 0.5 }, { color: "#f0abfc", at: 1 }],
      },
      padding: 0.09,
      cornerRadius: 30,
      shadow: { blur: 70, offsetY: 24, opacity: 0.35 },
      zoomBackgroundBlur: 14,
    },
    text: { family: "Studio Space Grotesk", weight: 700, color: "#0b1020" },
  },
  {
    id: "cobalt",
    name: "Cobalt",
    builtIn: true,
    style: {
      background: { type: "gradient", angle: 200, stops: [{ color: "#2563eb", at: 0 }, { color: "#1e3a8a", at: 1 }] },
      padding: 0.08,
      cornerRadius: 20,
      shadow: { blur: 60, offsetY: 22, opacity: 0.45 },
      zoomBackgroundBlur: 8,
    },
    text: { family: DEFAULT_FONT_FAMILY, weight: 700, color: "#ffffff" },
  },
];

/** Builds a custom preset from the current style and, if present, the first text layer. */
export function presetFromProject(
  id: string,
  name: string,
  style: CompositionStyle,
  sampleText: TextLayer | undefined,
): StylePreset {
  return {
    id,
    name,
    builtIn: false,
    style: structuredClone({
      background: style.background,
      padding: style.padding,
      cornerRadius: style.cornerRadius,
      shadow: style.shadow,
      zoomBackgroundBlur: style.zoomBackgroundBlur,
      device: style.device,
    }),
    text: sampleText
      ? { family: sampleText.font.family, weight: sampleText.font.weight, color: sampleText.color }
      : undefined,
  };
}
