"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { canvasToMedia } from "@/engine/camera";
import type { FrameProvider } from "@/engine/frame-provider";
import { textAppearance } from "@/engine/layers/text";
import { layoutAt, renderFrame } from "@/engine/render-frame";
import { loadFontsHere, projectFontFamilies } from "@/engine/text/fonts";
import type { Micros } from "@/engine/time";
import { clipAt, sourceTimeAt } from "@/engine/timeline";
import type { Project, TextLayer } from "@/schema/project";
import { addGesture, findText, updateText, updateZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { useSuggestionsStore } from "@/store/suggestions-store";
import { suggestionToZoom } from "../suggest/suggest-zooms";
import { takeImportDuration } from "../import/import-timing";
import type { Player } from "./player";
import { usePlayerState } from "./use-player";

const NO_FRAMES: FrameProvider = { getFrame: () => null };
/** Pointer travel that turns a tap into a swipe, in CSS pixels. */
const SWIPE_THRESHOLD = 8;

interface Props {
  project: Project;
  frames: FrameProvider | null;
  player: Player | null;
}

function hasFirstFrame(project: Project, frames: FrameProvider, time: Micros): boolean {
  const track = project.videoTracks.find((t) => !t.hidden);
  const clip = track && clipAt(track, time);
  return !!clip && frames.getFrame(clip.assetId, sourceTimeAt(clip, time)) !== null;
}

/** Loads the fonts used by text layers and returns a counter that changes when more are ready. */
function useFontsVersion(project: Project): number {
  const [version, setVersion] = useState(0);
  const key = projectFontFamilies(project.textTracks).join("|");
  useEffect(() => {
    let cancelled = false;
    loadFontsHere(key ? key.split("|") : [])
      .then(() => !cancelled && setVersion((v) => v + 1))
      .catch((e: unknown) => console.warn("Font loading failed", e));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return version;
}

/** Draws the project at the playhead with renderFrame, fitted to the available space. */
export function PreviewCanvas({ project: editedProject, frames, player }: Props) {
  const { time, frameVersion } = usePlayerState(player);
  const selection = useEditorStore((s) => s.selection);
  const suggestion = useSuggestionsStore((s) =>
    selection?.kind === "suggestion" ? s.suggestions.find((x) => x.id === selection.id) : undefined,
  );
  // A selected suggestion previews as if accepted, so it can be judged before accepting.
  const project = useMemo(
    () =>
      suggestion && !editedProject.zooms.some((z) => suggestion.start < z.end && suggestion.end > z.start)
        ? { ...editedProject, zooms: [...editedProject.zooms, suggestionToZoom(suggestion)] }
        : editedProject,
    [editedProject, suggestion],
  );
  const select = useEditorStore((s) => s.select);
  const gestureTool = useEditorStore((s) => s.gestureTool);
  const commit = useProjectStore((s) => s.commit);
  const fontsVersion = useFontsVersion(project);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const aspect = project.canvas.width / project.canvas.height;
  const cssWidth = box ? Math.floor(Math.min(box.width, box.height * aspect)) : 0;
  const cssHeight = Math.floor(cssWidth / aspect);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.min(Math.round(cssWidth * dpr), project.canvas.width);
    const height = Math.round(width / aspect);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const provider = frames ?? NO_FRAMES;
    renderFrame({ ctx, width, height }, project, time, provider);

    if (canvas.dataset.firstFrame !== "ready" && hasFirstFrame(project, provider, time)) {
      canvas.dataset.firstFrame = "ready";
      const ms = takeImportDuration();
      if (ms !== null) console.info(`[import] first frame composited ${Math.round(ms)} ms after drop`);
    }
  }, [project, frames, frameVersion, fontsVersion, time, cssWidth, aspect]);

  /** Converts a pointer position to canvas units. */
  const toCanvas = (e: { clientX: number; clientY: number }, el: Element) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * project.canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * project.canvas.height,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (cssWidth === 0 || e.button !== 0) return;
    const point = toCanvas(e, e.currentTarget);
    const layout = layoutAt(project, time);

    if ((selection?.kind === "zoom" || selection?.kind === "suggestion") && !gestureTool) {
      if (!layout.primaryRect) return;
      const p = canvasToMedia(point, layout.primaryRect, layout.transform);
      const focus = { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
      if (selection.kind === "zoom") commit((d) => updateZoom(d, selection.id, { focus }));
      else useSuggestionsStore.getState().update(selection.id, { focus });
      return;
    }

    if (gestureTool) {
      if (!layout.primaryRect) return;
      const rect = layout.primaryRect;
      const from = canvasToMedia(point, rect, layout.transform);
      if (from.x < 0 || from.x > 1 || from.y < 0 || from.y > 1) return;
      const el = e.currentTarget;
      const startX = e.clientX;
      const startY = e.clientY;
      el.setPointerCapture(e.pointerId);
      const up = (ev: PointerEvent) => {
        el.removeEventListener("pointerup", up);
        const id = crypto.randomUUID();
        const swipe = Math.hypot(ev.clientX - startX, ev.clientY - startY) > SWIPE_THRESHOLD;
        const to = swipe ? canvasToMedia(toCanvas(ev, el), rect, layout.transform) : undefined;
        if (commit((d) => addGesture(d, { id, time, type: swipe ? "swipe" : "tap", from, to, style: "ripple" }))) {
          select({ kind: "gesture", id });
        }
      };
      el.addEventListener("pointerup", up);
      return;
    }

    // Select the topmost visible text under the pointer.
    const hit = project.textTracks
      .flatMap((track) => track.layers)
      .filter((l) => textAppearance(l, time) !== null)
      .reverse()
      .find((l) => {
        const x = point.x / project.canvas.width;
        const y = point.y / project.canvas.height;
        return x >= l.box.x && x <= l.box.x + l.box.w && y >= l.box.y && y <= l.box.y + l.box.h;
      });
    if (hit) select({ kind: "text", id: hit.id });
  };

  const selectedText = selection?.kind === "text" ? findText(project, selection.id)?.layer : undefined;

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div className="relative" style={{ width: cssWidth, height: cssHeight }}>
        <canvas
          ref={canvasRef}
          data-testid="preview-canvas"
          aria-label={
            gestureTool
              ? "Video preview. Click to add a tap, drag to add a swipe."
              : selection?.kind === "zoom"
                ? "Video preview. Click to aim the selected zoom."
                : "Video preview"
          }
          role="img"
          style={{ width: cssWidth, height: cssHeight }}
          className={
            gestureTool || selection?.kind === "zoom" || selection?.kind === "suggestion"
              ? "cursor-crosshair rounded-sm"
              : "rounded-sm"
          }
          onPointerDown={onPointerDown}
        />
        {selectedText && !gestureTool && (
          <TextBoxOverlay layer={selectedText} cssWidth={cssWidth} cssHeight={cssHeight} visible={textAppearance(selectedText, time) !== null} />
        )}
      </div>
    </div>
  );
}

let boxDrags = 0;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

/** Move and resize handles for the selected text layer's box, in normalized canvas coordinates. */
function TextBoxOverlay({
  layer,
  cssWidth,
  cssHeight,
  visible,
}: {
  layer: TextLayer;
  cssWidth: number;
  cssHeight: number;
  visible: boolean;
}) {
  const commit = useProjectStore((s) => s.commit);

  const drag = (e: ReactPointerEvent<HTMLElement>, handle: Handle | "move") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, box: { ...layer.box } };
    const key = `text-box-${++boxDrags}`;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / cssWidth;
      const dy = (ev.clientY - start.y) / cssHeight;
      const b = { ...start.box };
      if (handle === "move") {
        b.x += dx;
        b.y += dy;
      } else {
        if (handle.includes("w")) {
          b.x += dx;
          b.w -= dx;
        }
        if (handle.includes("e")) b.w += dx;
        if (handle.includes("n")) {
          b.y += dy;
          b.h -= dy;
        }
        if (handle.includes("s")) b.h += dy;
      }
      commit((d) => updateText(d, layer.id, { box: b }), { coalesce: key });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const position: Record<Handle, string> = {
    nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
    n: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
    ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
    e: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize",
    se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
    s: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
    sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
    w: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize",
  };

  return (
    <div
      data-testid="text-box"
      className={`absolute cursor-move border border-dashed ${visible ? "border-sky-400" : "border-sky-400/40"}`}
      style={{
        left: layer.box.x * cssWidth,
        top: layer.box.y * cssHeight,
        width: layer.box.w * cssWidth,
        height: layer.box.h * cssHeight,
      }}
      onPointerDown={(e) => drag(e, "move")}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          data-handle={h}
          className={`absolute size-3 rounded-sm border border-sky-400 bg-background ${position[h]}`}
          onPointerDown={(e) => drag(e, h)}
        />
      ))}
    </div>
  );
}
