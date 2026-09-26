"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Rect } from "@/engine/geometry";
import { aspectBox, freeBox } from "@/engine/zoom-box";

const CORNERS = ["nw", "ne", "se", "sw"] as const;
type Corner = (typeof CORNERS)[number];
/** Pointer travel that turns a click into a drag, in CSS pixels. */
const DRAG_THRESHOLD = 4;

interface Props {
  /** The box in CSS pixels, relative to the preview. */
  box: Rect;
  /** Lock to this width / height ratio (zooms), or leave free (effects). */
  aspect?: number;
  /** Called while dragging (`final` false) and once when the pointer is released (`final` true). */
  onChange: (box: Rect, final: boolean) => void;
  label: string;
  /** Floating toolbar shown above the box. */
  toolbar?: ReactNode;
}

/**
 * Edits a box drawn over the preview: drag inside to move, drag a corner to resize, drag outside to draw a
 * new box, click outside to recenter the box on that point.
 */
export function BoxEditor({ box, aspect, onChange, label, toolbar }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const shown = draft ?? box;

  const pointIn = (e: { clientX: number; clientY: number }) => {
    const r = areaRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const track = (e: ReactPointerEvent, compute: (p: { x: number; y: number }, moved: boolean) => Rect | null) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const start = pointIn(e);
    let moved = false;
    let latest: Rect | null = null;
    const move = (ev: PointerEvent) => {
      const p = pointIn(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < DRAG_THRESHOLD) return;
      moved = true;
      latest = compute(p, true);
      if (latest) {
        setDraft(latest);
        onChange(latest, false);
      }
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      const final = moved ? latest : compute(pointIn(ev), false);
      setDraft(null);
      if (final) onChange(final, true);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const shape = (start: { x: number; y: number }, p: { x: number; y: number }) =>
    aspect ? aspectBox(start, p, aspect) : freeBox(start, p);

  // Outside the box: drag draws a new one; a click recenters the box on the point.
  const onArea = (e: ReactPointerEvent) => {
    const start = pointIn(e);
    track(e, (p, moved) => {
      if (moved) {
        const drawn = shape(start, p);
        return drawn.w > 8 && drawn.h > 8 ? drawn : null;
      }
      return { ...box, x: p.x - box.w / 2, y: p.y - box.h / 2 };
    });
  };

  const onBody = (e: ReactPointerEvent) => {
    const start = pointIn(e);
    track(e, (p, moved) => (moved ? { ...box, x: box.x + p.x - start.x, y: box.y + p.y - start.y } : null));
  };

  const onCorner = (corner: Corner) => (e: ReactPointerEvent) => {
    // Resize from the opposite corner, which stays put.
    const anchor = {
      x: corner.includes("w") ? box.x + box.w : box.x,
      y: corner.includes("n") ? box.y + box.h : box.y,
    };
    track(e, (p, moved) => (moved ? shape(anchor, p) : null));
  };

  const cornerClass: Record<Corner, string> = {
    nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
    ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
    se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
    sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  };

  return (
    <div ref={areaRef} className="absolute inset-0 cursor-crosshair" onPointerDown={onArea} data-testid="box-editor">
      <div
        role="group"
        aria-label={label}
        data-testid="edit-box"
        className="absolute cursor-move rounded-[3px] border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
        style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h }}
        onPointerDown={onBody}
      >
        {CORNERS.map((c) => (
          <div
            key={c}
            data-handle={c}
            className={`absolute size-3 rounded-sm border-2 border-sky-400 bg-background ${cornerClass[c]}`}
            onPointerDown={onCorner(c)}
          />
        ))}
        {toolbar && !draft && (
          <div
            className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 whitespace-nowrap shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {toolbar}
          </div>
        )}
      </div>
    </div>
  );
}
