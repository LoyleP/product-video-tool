"use client";

import { useEffect, useRef, useState } from "react";
import type { FrameProvider } from "@/engine/frame-provider";
import { canvasToMedia } from "@/engine/camera";
import { layoutAt, renderFrame } from "@/engine/render-frame";
import type { Micros } from "@/engine/time";
import { clipAt, sourceTimeAt } from "@/engine/timeline";
import type { Project } from "@/schema/project";
import { updateZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { takeImportDuration } from "../import/import-timing";
import type { Player } from "./player";
import { usePlayerState } from "./use-player";

const NO_FRAMES: FrameProvider = { getFrame: () => null };

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

/** Draws the project at the playhead with renderFrame, fitted to the available space. */
export function PreviewCanvas({ project, frames, player }: Props) {
  const { time, frameVersion } = usePlayerState(player);
  const selection = useEditorStore((s) => s.selection);
  const commit = useProjectStore((s) => s.commit);
  const aiming = selection?.kind === "zoom";
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
  }, [project, frames, frameVersion, time, cssWidth, aspect]);

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        aria-label={aiming ? "Video preview. Click to aim the selected zoom." : "Video preview"}
        role="img"
        style={{ width: cssWidth, height: cssHeight }}
        className={aiming ? "cursor-crosshair rounded-sm" : "rounded-sm"}
        onPointerDown={(e) => {
          if (selection?.kind !== "zoom" || cssWidth === 0) return;
          // Map the click through the current camera to a point in the media.
          const box = e.currentTarget.getBoundingClientRect();
          const point = {
            x: ((e.clientX - box.left) / box.width) * project.canvas.width,
            y: ((e.clientY - box.top) / box.height) * project.canvas.height,
          };
          const layout = layoutAt(project, time);
          if (!layout.primaryRect) return;
          const focus = canvasToMedia(point, layout.primaryRect, layout.transform);
          commit((d) => updateZoom(d, selection.id, { focus }));
        }}
      />
    </div>
  );
}
