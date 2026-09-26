"use client";

import { ScissorsIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MOTION_PRESETS, motionPresetOf, type MotionPreset } from "@/engine/easing";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { deleteZoom, splitZoom, updateZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "../preview/player";

const MOTION_LABELS: Record<MotionPreset, string> = { gentle: "Gentle", quick: "Quick", slow: "Slow" };

export function ZoomPanel({ project, player }: { project: Project; player: Player | null }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const zoom = selection?.kind === "zoom" ? project.zooms.find((z) => z.id === selection.id) : undefined;

  if (!zoom) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a zoom in the timeline, or press Z to add one at the playhead.
      </p>
    );
  }

  const motion = motionPresetOf(zoom);
  const set = (patch: Parameters<typeof updateZoom>[2], key?: string) =>
    commit((d) => updateZoom(d, zoom.id, patch), key ? { coalesce: `${key}-${zoom.id}` } : undefined);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">Zoom</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(zoom.start)} – {formatTime(zoom.end)}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <Label>Scale</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{zoom.scale.toFixed(1)}×</span>
        </div>
        <Slider
          thumbLabel="Zoom scale"
          min={10}
          max={40}
          step={1}
          value={[Math.round(zoom.scale * 10)]}
          onValueChange={([v]) => v !== undefined && set({ scale: v / 10 }, "scale")}
        />
      </section>

      <section className="space-y-3">
        <Label>Focus</Label>
        <p className="text-xs text-muted-foreground">Draw or drag the box on the preview, or fine-tune below.</p>
        {(["x", "y"] as const).map((axis) => (
          <div key={axis} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{axis === "x" ? "Horizontal" : "Vertical"}</span>
              <span className="font-mono tabular-nums">{Math.round(zoom.focus[axis] * 100)}%</span>
            </div>
            <Slider
              thumbLabel={axis === "x" ? "Focus horizontal" : "Focus vertical"}
              min={0}
              max={100}
              step={1}
              value={[Math.round(zoom.focus[axis] * 100)]}
              onValueChange={([v]) =>
                v !== undefined && set({ focus: { ...zoom.focus, [axis]: v / 100 } }, `focus-${axis}`)
              }
            />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <Label>Motion</Label>
        <div role="radiogroup" aria-label="Zoom motion" className="grid grid-cols-3 gap-1">
          {(Object.keys(MOTION_PRESETS) as MotionPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={motion === preset}
              onClick={() =>
                set({
                  easeIn: MOTION_PRESETS[preset].easing,
                  easeOut: MOTION_PRESETS[preset].easing,
                  transition: MOTION_PRESETS[preset].transition,
                })
              }
              className={cn(
                "rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                motion === preset ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {MOTION_LABELS[preset]}
            </button>
          ))}
        </div>
        {motion === null && <p className="text-xs text-muted-foreground">Custom motion.</p>}
      </section>

      <Button
        variant="outline"
        size="sm"
        aria-keyshortcuts="S"
        onClick={() => commit((d) => splitZoom(d, zoom.id, player?.getState().time ?? zoom.start, crypto.randomUUID()))}
      >
        <ScissorsIcon />
        Split at playhead
      </Button>

      <Button
        variant="outline"
        size="sm"
        aria-keyshortcuts="Delete"
        onClick={() => {
          if (commit((d) => deleteZoom(d, zoom.id))) select(null);
        }}
      >
        <Trash2Icon />
        Delete zoom
      </Button>
    </div>
  );
}
