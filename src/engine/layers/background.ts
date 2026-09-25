import type { Background } from "@/schema/project";
import type { RenderContext } from "../frame-provider";
import { gradientLine, type Size } from "../geometry";

const IMAGE_FALLBACK = "#111111";

/**
 * Paints the background. `blur` is in canvas units; `pixelScale` converts it to output pixels because
 * canvas filters ignore the transform.
 */
export function drawBackground(
  ctx: RenderContext,
  background: Background,
  canvas: Size,
  blur = 0,
  pixelScale = 1,
): void {
  switch (background.type) {
    case "transparent":
      return;
    case "solid":
      // A blurred solid color looks identical, so skip the filter.
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    case "gradient": {
      const { x0, y0, x1, y1 } = gradientLine(canvas, background.angle);
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      for (const stop of background.stops) gradient.addColorStop(stop.at, stop.color);
      ctx.fillStyle = gradient;
      break;
    }
    case "image":
      // Image backgrounds need asset decoding; drawn in a later phase.
      ctx.fillStyle = IMAGE_FALLBACK;
      break;
  }
  if (blur > 0) {
    ctx.save();
    ctx.filter = `blur(${blur * pixelScale}px)`;
    // Overdraw past the edges so the blur doesn't pull in transparent pixels.
    const m = blur * 3;
    ctx.fillRect(-m, -m, canvas.width + 2 * m, canvas.height + 2 * m);
    ctx.restore();
  } else {
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}
