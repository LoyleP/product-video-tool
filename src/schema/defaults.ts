import type { Background, CompositionStyle, ExportSettings, MediaAsset, Project } from "./project";
import { CURRENT_SCHEMA_VERSION } from "./project";

export interface BackgroundPreset {
  id: string;
  name: string;
  background: Background;
}

/** Original gradients and solids for the backgrounds gallery. */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "dusk",
    name: "Dusk",
    background: { type: "gradient", angle: 135, stops: [{ color: "#4f46e5", at: 0 }, { color: "#db2777", at: 1 }] },
  },
  {
    id: "lagoon",
    name: "Lagoon",
    background: { type: "gradient", angle: 160, stops: [{ color: "#0ea5e9", at: 0 }, { color: "#10b981", at: 1 }] },
  },
  {
    id: "ember",
    name: "Ember",
    background: { type: "gradient", angle: 120, stops: [{ color: "#f97316", at: 0 }, { color: "#e11d48", at: 1 }] },
  },
  {
    id: "citrus",
    name: "Citrus",
    background: { type: "gradient", angle: 150, stops: [{ color: "#facc15", at: 0 }, { color: "#f97316", at: 1 }] },
  },
  {
    id: "graphite",
    name: "Graphite",
    background: { type: "gradient", angle: 180, stops: [{ color: "#3f3f46", at: 0 }, { color: "#09090b", at: 1 }] },
  },
  {
    id: "mist",
    name: "Mist",
    background: { type: "gradient", angle: 180, stops: [{ color: "#f4f4f5", at: 0 }, { color: "#d4d4d8", at: 1 }] },
  },
  {
    id: "aurora",
    name: "Aurora",
    background: {
      type: "gradient",
      angle: 135,
      stops: [{ color: "#22d3ee", at: 0 }, { color: "#8b5cf6", at: 0.5 }, { color: "#f472b6", at: 1 }],
    },
  },
  { id: "ink", name: "Ink", background: { type: "solid", color: "#0a0a0a" } },
  { id: "paper", name: "Paper", background: { type: "solid", color: "#fafafa" } },
  { id: "cobalt", name: "Cobalt", background: { type: "solid", color: "#1d4ed8" } },
];

export const DEFAULT_STYLE: CompositionStyle = {
  background: BACKGROUND_PRESETS[0]!.background,
  padding: 0.08,
  cornerRadius: 24,
  shadow: { blur: 60, offsetY: 24, opacity: 0.4 },
  device: null,
  zoomBackgroundBlur: 0,
  tilt3d: null,
  watermark: false,
};

export const DEFAULT_CANVAS = { width: 1920, height: 1080 } as const;

export const DEFAULT_EXPORT: Omit<ExportSettings, "fps"> = {
  preset: "1080p",
  width: 1920,
  height: 1080,
  format: "mp4-h264",
  quality: "high",
  range: null,
};

export interface CreateProjectInput {
  id: string;
  now: string;
  asset: MediaAsset;
  /** Average source frame rate, used to pick 30 or 60 fps. */
  sourceFps: number;
  newId: () => string;
}

/** Builds a new single-clip project around an imported video. Pure: ids and time are injected. */
export function createProjectFromVideo({ id, now, asset, sourceFps, newId }: CreateProjectInput): Project {
  const fps = sourceFps > 45 ? 60 : 30;
  return {
    id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: asset.name.replace(/\.[^.]+$/, "") || "Untitled project",
    createdAt: now,
    updatedAt: now,
    canvas: { ...DEFAULT_CANVAS, fps },
    assets: { [asset.id]: asset },
    videoTracks: [
      {
        id: newId(),
        hidden: false,
        clips: [
          {
            id: newId(),
            assetId: asset.id,
            timelineStart: 0,
            sourceIn: 0,
            sourceOut: asset.duration,
            speed: 1,
            muted: false,
          },
        ],
      },
    ],
    audioTracks: [],
    textTracks: [],
    zooms: [],
    gestures: [],
    effects: [],
    captions: null,
    style: structuredClone(DEFAULT_STYLE),
    export: { ...DEFAULT_EXPORT, fps },
  };
}
