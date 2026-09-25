import type { Background } from "@/schema/project";

/** CSS for a background swatch. Uses the same angle convention as the engine's gradientLine. */
export function backgroundCss(background: Background): string {
  switch (background.type) {
    case "solid":
      return background.color;
    case "gradient":
      return `linear-gradient(${background.angle}deg, ${background.stops
        .map((s) => `${s.color} ${s.at * 100}%`)
        .join(", ")})`;
    case "image":
    case "transparent":
      return "repeating-conic-gradient(#3f3f46 0 25%, #27272a 0 50%) 0 0 / 12px 12px";
  }
}
