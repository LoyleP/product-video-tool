import type { RenderContext } from "./frame-provider";
import type { Rect } from "./geometry";

/**
 * Original, generic device frames (BUILD.md 7.9), drawn as vector paths in device units. Geometry and
 * drawing come from the same numbers, so the screen cutout always matches the media rect exactly.
 * Deliberately not modeled on any specific manufacturer's artwork.
 */

export interface DeviceColor {
  id: string;
  name: string;
  body: string;
  edge: string;
}

export interface DeviceGeometry {
  width: number;
  height: number;
  /** Where the recording shows, in device units. */
  screen: Rect;
  /** Screen corner radii: top-left, top-right, bottom-right, bottom-left. */
  screenRadii: [number, number, number, number];
}

export interface DeviceDefinition {
  id: DeviceId;
  name: string;
  colors: DeviceColor[];
  /** Geometry for media of the given aspect ratio (width / height). */
  geometry(mediaAspect: number): DeviceGeometry;
  /** The outer outline, used for the drop shadow. */
  silhouette(ctx: RenderContext, g: DeviceGeometry): void;
  /** Draws the frame on top of the media. The screen area must stay transparent. */
  draw(ctx: RenderContext, g: DeviceGeometry, color: DeviceColor): void;
}

export type DeviceId = "phone" | "tablet" | "laptop" | "browser";

const GLASS = "#060606";

function roundRectPath(ctx: RenderContext, r: Rect, radii: number | number[]) {
  ctx.roundRect(r.x, r.y, r.w, r.h, radii);
}

/** Fills `outer` minus the screen, so the screen stays transparent. */
function fillAroundScreen(ctx: RenderContext, outer: Rect, outerRadius: number | number[], g: DeviceGeometry, fill: string) {
  ctx.beginPath();
  roundRectPath(ctx, outer, outerRadius);
  roundRectPath(ctx, g.screen, g.screenRadii);
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
}

const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });

// Phone: sized around a 1179 x 2556 screen, with a pill-shaped camera island and side buttons.
const PHONE = { screenW: 1179, screenH: 2556, bezel: 58, margin: 10, outerRadius: 212, screenRadius: 158 };

const phone: DeviceDefinition = {
  id: "phone",
  name: "Phone",
  colors: [
    { id: "graphite", name: "Graphite", body: "#2b2b2f", edge: "#46464c" },
    { id: "silver", name: "Silver", body: "#d7d8db", edge: "#b3b5ba" },
    { id: "blue", name: "Blue", body: "#3a4960", edge: "#56657d" },
    { id: "sand", name: "Sand", body: "#c9b697", edge: "#ab9876" },
  ],
  geometry() {
    const { screenW, screenH, bezel, margin, screenRadius } = PHONE;
    return {
      width: screenW + 2 * bezel + 2 * margin,
      height: screenH + 2 * bezel,
      screen: { x: margin + bezel, y: bezel, w: screenW, h: screenH },
      screenRadii: [screenRadius, screenRadius, screenRadius, screenRadius],
    };
  },
  silhouette(ctx, g) {
    ctx.beginPath();
    roundRectPath(ctx, { x: PHONE.margin, y: 0, w: g.width - 2 * PHONE.margin, h: g.height }, PHONE.outerRadius);
  },
  draw(ctx, g, color) {
    const outer = { x: PHONE.margin, y: 0, w: g.width - 2 * PHONE.margin, h: g.height };
    // Side buttons sit in the margin, behind the body edge.
    ctx.fillStyle = color.edge;
    for (const [side, y, h] of [
      [0, 520, 100],
      [0, 700, 180],
      [0, 920, 180],
      [1, 780, 280],
    ] as const) {
      ctx.beginPath();
      roundRectPath(ctx, { x: side === 0 ? 2 : g.width - PHONE.margin - 2, y, w: PHONE.margin, h }, 4);
      ctx.fill();
    }
    fillAroundScreen(ctx, outer, PHONE.outerRadius, g, color.body);
    // Black glass bezel inside the metal band.
    fillAroundScreen(ctx, inset(outer, 16), PHONE.outerRadius - 16, g, GLASS);
    ctx.beginPath();
    roundRectPath(ctx, inset(outer, 2), PHONE.outerRadius - 2);
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Camera island.
    const island = { w: 370, h: 108 };
    ctx.beginPath();
    roundRectPath(ctx, { x: g.width / 2 - island.w / 2, y: g.screen.y + 34, w: island.w, h: island.h }, island.h / 2);
    ctx.fillStyle = "#000";
    ctx.fill();
  },
};

// Tablet: symmetric bezel, portrait or landscape to match the media.
const TABLET = { long: 2360, short: 1640, bezel: 84, outerRadius: 118, screenRadius: 40 };

const tablet: DeviceDefinition = {
  id: "tablet",
  name: "Tablet",
  colors: [
    { id: "space", name: "Space", body: "#2c2c2e", edge: "#48484c" },
    { id: "silver", name: "Silver", body: "#dcdde0", edge: "#b9bbc0" },
  ],
  geometry(aspect) {
    const landscape = aspect > 1;
    const w = landscape ? TABLET.long : TABLET.short;
    const h = landscape ? TABLET.short : TABLET.long;
    const r = TABLET.screenRadius;
    return {
      width: w + 2 * TABLET.bezel,
      height: h + 2 * TABLET.bezel,
      screen: { x: TABLET.bezel, y: TABLET.bezel, w, h },
      screenRadii: [r, r, r, r],
    };
  },
  silhouette(ctx, g) {
    ctx.beginPath();
    roundRectPath(ctx, { x: 0, y: 0, w: g.width, h: g.height }, TABLET.outerRadius);
  },
  draw(ctx, g, color) {
    const outer = { x: 0, y: 0, w: g.width, h: g.height };
    fillAroundScreen(ctx, outer, TABLET.outerRadius, g, color.body);
    fillAroundScreen(ctx, inset(outer, 12), TABLET.outerRadius - 12, g, GLASS);
    ctx.beginPath();
    roundRectPath(ctx, inset(outer, 2), TABLET.outerRadius - 2);
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Front camera centered on the long top edge in landscape, short top edge in portrait.
    ctx.beginPath();
    ctx.arc(g.width / 2, TABLET.bezel / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1c1e";
    ctx.fill();
  },
};

// Laptop: 16:10 lid on a wider base.
const LAPTOP = { screenW: 2560, screenH: 1600, side: 62, top: 72, bottom: 92, lidRadius: 54, baseH: 74, baseOverhang: 210 };

const laptop: DeviceDefinition = {
  id: "laptop",
  name: "Laptop",
  colors: [
    { id: "silver", name: "Silver", body: "#c8cacd", edge: "#a7aaaf" },
    { id: "graphite", name: "Graphite", body: "#5b5c60", edge: "#77797e" },
  ],
  geometry() {
    const lidW = LAPTOP.screenW + 2 * LAPTOP.side;
    const lidH = LAPTOP.screenH + LAPTOP.top + LAPTOP.bottom;
    const width = lidW + 2 * LAPTOP.baseOverhang;
    return {
      width,
      height: lidH + LAPTOP.baseH,
      screen: { x: LAPTOP.baseOverhang + LAPTOP.side, y: LAPTOP.top, w: LAPTOP.screenW, h: LAPTOP.screenH },
      screenRadii: [10, 10, 0, 0],
    };
  },
  silhouette(ctx, g) {
    const lidW = g.width - 2 * LAPTOP.baseOverhang;
    const lidH = g.height - LAPTOP.baseH;
    ctx.beginPath();
    roundRectPath(ctx, { x: LAPTOP.baseOverhang, y: 0, w: lidW, h: lidH }, [LAPTOP.lidRadius, LAPTOP.lidRadius, 0, 0]);
    roundRectPath(ctx, { x: 0, y: lidH, w: g.width, h: LAPTOP.baseH }, [0, 0, 40, 40]);
  },
  draw(ctx, g, color) {
    const lidW = g.width - 2 * LAPTOP.baseOverhang;
    const lidH = g.height - LAPTOP.baseH;
    const lid = { x: LAPTOP.baseOverhang, y: 0, w: lidW, h: lidH };
    const lidRadii = [LAPTOP.lidRadius, LAPTOP.lidRadius, 0, 0];
    fillAroundScreen(ctx, lid, lidRadii, g, color.body);
    fillAroundScreen(ctx, inset(lid, 8), [LAPTOP.lidRadius - 8, LAPTOP.lidRadius - 8, 0, 0], g, GLASS);
    // Camera.
    ctx.beginPath();
    ctx.arc(g.width / 2, LAPTOP.top / 2, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#1f1f22";
    ctx.fill();
    // Base with a thumb groove on the front edge.
    ctx.beginPath();
    roundRectPath(ctx, { x: 0, y: lidH, w: g.width, h: LAPTOP.baseH }, [6, 6, 40, 40]);
    ctx.fillStyle = color.body;
    ctx.fill();
    ctx.beginPath();
    roundRectPath(ctx, { x: g.width / 2 - 260, y: lidH, w: 520, h: 26 }, [0, 0, 22, 22]);
    ctx.fillStyle = color.edge;
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, lidH + LAPTOP.baseH - 10, g.width, 10);
  },
};

// Browser window: adapts to any aspect ratio, with a toolbar and address bar.
const BROWSER = { screenW: 2000, toolbar: 96, radius: 26, border: 2 };

export const BROWSER_COLORS: DeviceColor[] = [
  { id: "light", name: "Light", body: "#f4f4f5", edge: "#d4d4d8" },
  { id: "dark", name: "Dark", body: "#27272a", edge: "#3f3f46" },
];

const browser: DeviceDefinition = {
  id: "browser",
  name: "Browser",
  colors: BROWSER_COLORS,
  geometry(aspect) {
    const screenH = Math.round(BROWSER.screenW / Math.max(0.2, Math.min(5, aspect)));
    const b = BROWSER.border;
    return {
      width: BROWSER.screenW + 2 * b,
      height: screenH + BROWSER.toolbar + b,
      screen: { x: b, y: BROWSER.toolbar, w: BROWSER.screenW, h: screenH },
      screenRadii: [0, 0, BROWSER.radius - b, BROWSER.radius - b],
    };
  },
  silhouette(ctx, g) {
    ctx.beginPath();
    roundRectPath(ctx, { x: 0, y: 0, w: g.width, h: g.height }, BROWSER.radius);
  },
  draw(ctx, g, color) {
    const outer = { x: 0, y: 0, w: g.width, h: g.height };
    fillAroundScreen(ctx, outer, BROWSER.radius, g, color.edge);
    ctx.beginPath();
    roundRectPath(ctx, { x: BROWSER.border, y: BROWSER.border, w: g.width - 2 * BROWSER.border, h: BROWSER.toolbar - BROWSER.border }, [
      BROWSER.radius - BROWSER.border,
      BROWSER.radius - BROWSER.border,
      0,
      0,
    ]);
    ctx.fillStyle = color.body;
    ctx.fill();
    const dark = color.id === "dark";
    // Window controls as neutral dots.
    ctx.fillStyle = dark ? "#52525b" : "#d4d4d8";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(52 + i * 40, BROWSER.toolbar / 2, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    // Address bar.
    ctx.beginPath();
    const barW = Math.min(g.width * 0.5, 900);
    roundRectPath(ctx, { x: g.width / 2 - barW / 2, y: BROWSER.toolbar / 2 - 26, w: barW, h: 52 }, 26);
    ctx.fillStyle = dark ? "#3f3f46" : "#e4e4e7";
    ctx.fill();
  },
};

export const DEVICES: Record<DeviceId, DeviceDefinition> = { phone, tablet, laptop, browser };
export const DEVICE_IDS = Object.keys(DEVICES) as DeviceId[];

export function deviceById(id: string): DeviceDefinition | null {
  return (DEVICES as Record<string, DeviceDefinition>)[id] ?? null;
}

/** Suggests a frame from the recording's aspect ratio (BUILD.md 7.9). */
export function suggestDevice(aspect: number): DeviceId {
  if (aspect < 0.56) return "phone";
  if (aspect < 0.85 || (aspect > 1.25 && aspect < 1.5)) return "tablet";
  if (aspect >= 1.55 && aspect <= 1.65) return "laptop";
  return "browser";
}

/** Scales `source` to cover `target` (cropping), centered. */
export function coverRect(target: Rect, sourceAspect: number): Rect {
  const targetAspect = target.w / target.h;
  if (sourceAspect > targetAspect) {
    const w = target.h * sourceAspect;
    return { x: target.x - (w - target.w) / 2, y: target.y, w, h: target.h };
  }
  const h = target.w / sourceAspect;
  return { x: target.x, y: target.y - (h - target.h) / 2, w: target.w, h };
}
