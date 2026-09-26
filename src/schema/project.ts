import { z } from "zod";

/** Integer microseconds (BUILD.md 2.5). */
export const micros = z.number().int();

const point = z.object({ x: z.number(), y: z.number() });

export const easingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cubic-bezier"), p: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("spring"), stiffness: z.number(), damping: z.number(), mass: z.number() }),
]);

export const interactionEventSchema = z.object({
  time: micros,
  type: z.enum(["click", "focus", "scroll"]),
  x: z.number(),
  y: z.number(),
});

export const mediaAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "audio", "image"]),
  name: z.string(),
  storage: z.discriminatedUnion("type", [
    z.object({ type: z.literal("opfs"), path: z.string() }),
    z.object({ type: z.literal("blob"), url: z.string() }),
  ]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: micros.nonnegative(),
  hasAudio: z.boolean(),
  codec: z.string(),
  isVariableFrameRate: z.boolean(),
  interactionEvents: z.array(interactionEventSchema).optional(),
  /** Index among the file's video tracks; absent means the primary track. Browser recordings put the webcam at 1. */
  videoTrack: z.number().int().nonnegative().optional(),
  /** Capture settings read back from getDisplayMedia (BUILD.md 7.5), for browser recordings. */
  capture: z
    .object({ cursor: z.string().nullable(), displaySurface: z.string().nullable() })
    .optional(),
});

export const clipSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  timelineStart: micros.nonnegative(),
  sourceIn: micros.nonnegative(),
  sourceOut: micros.nonnegative(),
  speed: z.number().min(0.25).max(8),
  muted: z.boolean(),
});

/** Picture-in-picture placement for overlay tracks such as a webcam, in canvas space (not zoomed). */
export const overlaySchema = z.object({
  shape: z.enum(["circle", "rounded"]),
  /** Height as a fraction of the canvas height. */
  size: z.number().min(0.05).max(0.6),
  corner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
  mirror: z.boolean(),
});

export const videoTrackSchema = z.object({
  id: z.string(),
  clips: z.array(clipSchema),
  hidden: z.boolean(),
  overlay: overlaySchema.optional(),
});
export const audioTrackSchema = z.object({
  id: z.string(),
  clips: z.array(clipSchema),
  volume: z.number().min(0),
  muted: z.boolean(),
});

export const zoomSegmentSchema = z.object({
  id: z.string(),
  start: micros,
  end: micros,
  scale: z.number().min(1).max(4),
  focus: point,
  easeIn: easingSchema,
  easeOut: easingSchema,
  origin: z.enum(["manual", "auto"]),
});

export const textAnimationSchema = z.object({
  type: z.enum(["none", "fade", "slide-up", "scale"]),
  duration: micros.nonnegative(),
});

export const textLayerSchema = z.object({
  id: z.string(),
  start: micros,
  end: micros,
  text: z.string(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  font: z.object({
    family: z.string(),
    size: z.number().positive(),
    weight: z.number(),
    lineHeight: z.number(),
    letterSpacing: z.number(),
  }),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  animIn: textAnimationSchema,
  animOut: textAnimationSchema,
});
export const textTrackSchema = z.object({ id: z.string(), layers: z.array(textLayerSchema) });

export const gestureSchema = z.object({
  id: z.string(),
  time: micros,
  type: z.enum(["tap", "swipe"]),
  from: point,
  to: point.optional(),
  style: z.enum(["ripple", "dot"]),
});

export const captionWordSchema = z.object({ text: z.string(), start: micros, end: micros });
export const captionTrackSchema = z.object({
  words: z.array(captionWordSchema),
  style: z.object({
    position: z.enum(["top", "bottom"]),
    font: z.object({ family: z.string(), size: z.number().positive(), weight: z.number() }),
    color: z.string(),
    highlightColor: z.string(),
  }),
});

export const gradientStopSchema = z.object({ color: z.string(), at: z.number().min(0).max(1) });

export const backgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string() }),
  z.object({ type: z.literal("gradient"), stops: z.array(gradientStopSchema).min(2), angle: z.number() }),
  z.object({ type: z.literal("image"), assetId: z.string(), blur: z.number().min(0) }),
  z.object({ type: z.literal("transparent") }),
]);

export const compositionStyleSchema = z.object({
  background: backgroundSchema,
  padding: z.number().min(0).max(0.45),
  cornerRadius: z.number().min(0),
  shadow: z.object({ blur: z.number().min(0), offsetY: z.number(), opacity: z.number().min(0).max(1) }),
  device: z.object({ frameId: z.string(), color: z.string() }).nullable(),
  zoomBackgroundBlur: z.number().min(0),
  tilt3d: z.object({ rotateX: z.number(), rotateY: z.number(), perspective: z.number() }).nullable(),
  watermark: z.boolean(),
});

export const exportSettingsSchema = z.object({
  preset: z.enum(["1080p", "1440p", "4k", "custom"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.union([z.literal(30), z.literal(60)]),
  format: z.enum(["mp4-h264", "webm-vp9", "webm-vp9-alpha", "gif", "png-still"]),
  quality: z.enum(["standard", "high", "lossless-ish"]),
  range: z.object({ start: micros, end: micros }).nullable(),
});

export const CURRENT_SCHEMA_VERSION = 1;

export const projectSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.union([z.literal(30), z.literal(60)]),
  }),
  assets: z.record(z.string(), mediaAssetSchema),
  videoTracks: z.array(videoTrackSchema).max(4),
  audioTracks: z.array(audioTrackSchema).max(4),
  textTracks: z.array(textTrackSchema).max(5),
  zooms: z.array(zoomSegmentSchema),
  gestures: z.array(gestureSchema),
  captions: captionTrackSchema.nullable(),
  style: compositionStyleSchema,
  export: exportSettingsSchema,
});

export type Easing = z.infer<typeof easingSchema>;
export type InteractionEvent = z.infer<typeof interactionEventSchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type VideoTrack = z.infer<typeof videoTrackSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type ZoomSegment = z.infer<typeof zoomSegmentSchema>;
export type TextAnimation = z.infer<typeof textAnimationSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type TextTrack = z.infer<typeof textTrackSchema>;
export type Gesture = z.infer<typeof gestureSchema>;
export type CaptionTrack = z.infer<typeof captionTrackSchema>;
export type Background = z.infer<typeof backgroundSchema>;
export type CompositionStyle = z.infer<typeof compositionStyleSchema>;
export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export type Project = z.infer<typeof projectSchema>;
