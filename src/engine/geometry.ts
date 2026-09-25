export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the media sits on the canvas: inset by `padding` (a fraction of the canvas's shorter side)
 * and fitted inside the remaining area without cropping, centered.
 */
export function mediaRect(canvas: Size, media: Size, padding: number): Rect {
  const inset = padding * Math.min(canvas.width, canvas.height);
  const availW = Math.max(0, canvas.width - 2 * inset);
  const availH = Math.max(0, canvas.height - 2 * inset);
  if (media.width <= 0 || media.height <= 0 || availW === 0 || availH === 0) {
    return { x: canvas.width / 2, y: canvas.height / 2, w: 0, h: 0 };
  }
  const scale = Math.min(availW / media.width, availH / media.height);
  const w = media.width * scale;
  const h = media.height * scale;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
}

/**
 * Endpoints of a linear gradient following CSS `linear-gradient(<angle>deg, ...)`:
 * 0deg points up, 90deg points right, and the line is long enough that the corners get the end colors.
 */
export function gradientLine(size: Size, angleDeg: number): { x0: number; y0: number; x1: number; y1: number } {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(size.width * dx) + Math.abs(size.height * dy)) / 2;
  const cx = size.width / 2;
  const cy = size.height / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}
