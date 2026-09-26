"use client";

import { useRef } from "react";
import { ScissorsIcon, Trash2Icon } from "lucide-react";
import { MOTION_PRESETS, motionPresetOf, type MotionPreset } from "@/engine/easing";
import type { Rect } from "@/engine/geometry";
import { effectBox } from "@/engine/layers/effects";
import { layoutAt } from "@/engine/render-frame";
import type { Micros } from "@/engine/time";
import { zoomBox, zoomFromBox } from "@/engine/zoom-box";
import { cn } from "@/lib/utils";
import type { Effect, Project } from "@/schema/project";
import { deleteEffect, deleteZoom, splitZoom, updateEffect, updateZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { BoxEditor } from "./box-editor";
import type { Player } from "./player";

const MOTION_LABELS: Record<MotionPreset, string> = { gentle: "Gentle", quick: "Quick", slow: "Slow" };

/**
 * The box for the selected zoom or effect, drawn over the preview at rest, with a floating
 * toolbar. `project` is the at-rest project the preview is rendering.
 */
export function SelectedBox({
  project,
  time,
  cssWidth,
  player,
}: {
  project: Project;
  time: Micros;
  cssWidth: number;
  player: Player | null;
}) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const zooms = useProjectStore((s) => s.project?.zooms);
  const session = useRef(0);

  // Boxes are placed relative to the recording at rest; at a time with no clip, use the first clip's layout.
  const layout = layoutAt(project, time);
  const media = layout.primaryRect ?? layoutAt(project, 0).primaryRect;
  if (!media || !selection) return null;
  const k = cssWidth / project.canvas.width;
  const toCss = (r: Rect): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });
  const toCanvas = (r: Rect): Rect => ({ x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k });
  const aspect = project.canvas.width / project.canvas.height;
  // One undo step per drag: a new coalesce key each time the pointer is released.
  const key = () => `box-${session.current}`;
  const settle = (final: boolean) => {
    if (final) session.current++;
  };

  if (selection.kind === "zoom") {
    const zoom = zooms?.find((z) => z.id === selection.id);
    if (!zoom) return null;
    const motion = motionPresetOf(zoom);
    return (
      <BoxEditor
        box={toCss(zoomBox(project.canvas, media, zoom))}
        aspect={aspect}
        label={`Zoom area ${zoom.scale}×`}
        onChange={(box, final) => {
          const next = zoomFromBox(project.canvas, media, toCanvas(box));
          commit((d) => updateZoom(d, zoom.id, next), { coalesce: key() });
          settle(final);
        }}
        toolbar={
          <>
            <span className="px-1.5 font-mono text-xs text-muted-foreground tabular-nums">
              {zoom.scale.toFixed(1)}×
            </span>
            {(Object.keys(MOTION_PRESETS) as MotionPreset[]).map((m) => (
              <ToolbarButton
                key={m}
                pressed={motion === m}
                onClick={() =>
                  commit((d) =>
                    updateZoom(d, zoom.id, {
                      easeIn: MOTION_PRESETS[m].easing,
                      easeOut: MOTION_PRESETS[m].easing,
                      transition: MOTION_PRESETS[m].transition,
                    }),
                  )
                }
              >
                {MOTION_LABELS[m]}
              </ToolbarButton>
            ))}
            <Divider />
            <ToolbarButton
              label="Split zoom at playhead"
              onClick={() => commit((d) => splitZoom(d, zoom.id, player?.getState().time ?? time, crypto.randomUUID()))}
            >
              <ScissorsIcon className="size-3.5" />
            </ToolbarButton>
            <ToolbarButton
              label="Delete zoom"
              onClick={() => {
                if (commit((d) => deleteZoom(d, zoom.id))) select(null);
              }}
            >
              <Trash2Icon className="size-3.5" />
            </ToolbarButton>
          </>
        }
      />
    );
  }

  if (selection.kind === "effect") {
    const effect = project.effects.find((e) => e.id === selection.id);
    if (!effect) return null;
    const toRect = (box: Rect): Effect["rect"] => {
      const c = toCanvas(box);
      return { x: (c.x - media.x) / media.w, y: (c.y - media.y) / media.h, w: c.w / media.w, h: c.h / media.h };
    };
    return (
      <BoxEditor
        box={toCss(effectBox(effect, media))}
        label={`${effect.type === "spotlight" ? "Spotlight" : "Blur"} area`}
        onChange={(box, final) => {
          commit((d) => updateEffect(d, effect.id, { rect: toRect(box) }), { coalesce: key() });
          settle(final);
        }}
        toolbar={
          <>
            {(["spotlight", "blur"] as const).map((type) => (
              <ToolbarButton
                key={type}
                pressed={effect.type === type}
                onClick={() => commit((d) => updateEffect(d, effect.id, { type }))}
              >
                {type === "spotlight" ? "Spotlight" : "Blur"}
              </ToolbarButton>
            ))}
            <Divider />
            {([0.3, 0.6, 0.9] as const).map((intensity, i) => (
              <ToolbarButton
                key={intensity}
                pressed={Math.abs(effect.intensity - intensity) < 0.05}
                onClick={() => commit((d) => updateEffect(d, effect.id, { intensity }))}
              >
                {["Light", "Medium", "Strong"][i]}
              </ToolbarButton>
            ))}
            <Divider />
            <ToolbarButton
              label="Delete effect"
              onClick={() => {
                if (commit((d) => deleteEffect(d, effect.id))) select(null);
              }}
            >
              <Trash2Icon className="size-3.5" />
            </ToolbarButton>
          </>
        }
      />
    );
  }
  return null;
}

function ToolbarButton({
  children,
  onClick,
  pressed,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1 rounded-md px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />;
}
