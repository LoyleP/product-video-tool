"use client";

import { ScissorsIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOTION_PRESETS, motionPresetOf, type MotionPreset } from "@/engine/easing";
import { formatTime } from "@/lib/format-time";
import type { Project } from "@/schema/project";
import { deleteZoom, splitZoom, updateZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "../preview/player";
import { Choice, NumberField, Section } from "./fields";
import { fromSeconds, recordingSize, toSeconds } from "./units";

const MOTION_LABELS: Record<MotionPreset, string> = { gentle: "Gentle", quick: "Quick", slow: "Slow" };
const DEFAULT_TRANSITION = 600_000;

export function ZoomPanel({ project, player }: { project: Project; player: Player | null }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const zoom = selection?.kind === "zoom" ? project.zooms.find((z) => z.id === selection.id) : undefined;
  if (!zoom) return null;

  const size = recordingSize(project);
  const motion = motionPresetOf(zoom);
  const set = (patch: Parameters<typeof updateZoom>[2], key?: string) =>
    commit((d) => updateZoom(d, zoom.id, patch), key ? { coalesce: `${key}-${zoom.id}` } : undefined);
  const length = toSeconds(zoom.end - zoom.start);
  const projectSeconds = Math.max(toSeconds(zoom.end), 60);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">Zoom</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(zoom.start)} – {formatTime(zoom.end)}
        </p>
      </section>

      <Section title="Timing">
        <NumberField
          label="Start"
          value={toSeconds(zoom.start)}
          min={0}
          max={projectSeconds}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ start: fromSeconds(v) }, "start")}
        />
        <NumberField
          label="End"
          value={toSeconds(zoom.end)}
          min={0}
          max={projectSeconds}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ end: fromSeconds(v) }, "end")}
        />
        <NumberField
          label="Transition"
          value={toSeconds(zoom.transition ?? DEFAULT_TRANSITION)}
          min={0.1}
          max={Math.max(0.2, Math.min(2, length / 2))}
          inputMax={Math.max(0.2, length)}
          step={0.05}
          unit="s"
          onChange={(v) => set({ transition: fromSeconds(v) }, "transition")}
        />
      </Section>

      <Section title="Scale">
        <NumberField
          label="Zoom scale"
          value={zoom.scale}
          min={1}
          max={4}
          step={0.05}
          unit="×"
          onChange={(v) => set({ scale: v }, "scale")}
        />
      </Section>

      <Section title="Focus">
        <NumberField
          label="Focus horizontal"
          value={Math.round(zoom.focus.x * size.width)}
          min={0}
          max={size.width}
          unit="px"
          onChange={(v) => set({ focus: { ...zoom.focus, x: v / size.width } }, "focus-x")}
        />
        <NumberField
          label="Focus vertical"
          value={Math.round(zoom.focus.y * size.height)}
          min={0}
          max={size.height}
          unit="px"
          onChange={(v) => set({ focus: { ...zoom.focus, y: v / size.height } }, "focus-y")}
        />
      </Section>

      <Section title="Motion">
        <Choice
          label="Zoom motion"
          value={motion}
          options={(Object.keys(MOTION_PRESETS) as MotionPreset[]).map((preset) => ({
            value: preset,
            label: MOTION_LABELS[preset],
          }))}
          onChange={(preset) =>
            set({
              easeIn: MOTION_PRESETS[preset].easing,
              easeOut: MOTION_PRESETS[preset].easing,
              transition: MOTION_PRESETS[preset].transition,
            })
          }
        />
      </Section>

      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
