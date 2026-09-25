import type { Background } from "@/schema/project";
import type { RenderContext } from "../frame-provider";
import { gradientLine, type Size } from "../geometry";

const IMAGE_FALLBACK = "#111111";

export function drawBackground(ctx: RenderContext, background: Background, canvas: Size): void {
  switch (background.type) {
    case "transparent":
      return;
    case "solid":
      ctx.fillStyle = background.color;
      break;
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
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
