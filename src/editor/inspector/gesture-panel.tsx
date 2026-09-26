"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format-time";
import type { Gesture, Project } from "@/schema/project";
import { deleteGesture, updateGesture } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { Choice, NumberField, Section } from "./fields";
import { fromSeconds, recordingSize, toSeconds } from "./units";

export function GesturePanel({ project }: { project: Project }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const gestureTool = useEditorStore((s) => s.gestureTool);
  const setGestureTool = useEditorStore((s) => s.setGestureTool);
  const commit = useProjectStore((s) => s.commit);
  const gesture = selection?.kind === "gesture" ? project.gestures.find((g) => g.id === selection.id) : undefined;

  const toolToggle = (
    <Button
      variant={gestureTool ? "default" : "outline"}
      size="sm"
      aria-pressed={gestureTool}
      aria-keyshortcuts="G"
      onClick={() => setGestureTool(!gestureTool)}
    >
      {gestureTool ? "Tap tool on" : "Tap tool off"}
    </Button>
  );

  if (!gesture) return <div className="space-y-4">{toolToggle}</div>;

  const size = recordingSize(project);
  const set = (patch: Partial<Omit<Gesture, "id">>, key?: string) =>
    commit((d) => updateGesture(d, gesture.id, patch), key ? { coalesce: `${key}-${gesture.id}` } : undefined);
  const to = gesture.to;

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">{gesture.type === "tap" ? "Tap" : "Swipe"}</h2>
        <p className="font-mono text-xs text-muted-foreground">{formatTime(gesture.time)}</p>
      </section>

      <Choice
        label="Gesture type"
        value={gesture.type}
        options={[
          { value: "tap", label: "Tap" },
          { value: "swipe", label: "Swipe" },
        ]}
        onChange={(type) => set({ type })}
      />
      <Choice
        label="Gesture style"
        value={gesture.style}
        options={[
          { value: "ripple", label: "Ripple" },
          { value: "dot", label: "Dot" },
        ]}
        onChange={(style) => set({ style })}
      />

      <Section title="Position">
        <NumberField
          label="Time"
          value={toSeconds(gesture.time)}
          min={0}
          max={Math.max(60, toSeconds(gesture.time))}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ time: fromSeconds(v) }, "time")}
        />
        <NumberField
          label="From X"
          value={Math.round(gesture.from.x * size.width)}
          min={0}
          max={size.width}
          unit="px"
          onChange={(v) => set({ from: { ...gesture.from, x: v / size.width } }, "from-x")}
        />
        <NumberField
          label="From Y"
          value={Math.round(gesture.from.y * size.height)}
          min={0}
          max={size.height}
          unit="px"
          onChange={(v) => set({ from: { ...gesture.from, y: v / size.height } }, "from-y")}
        />
        {gesture.type === "swipe" && to && (
          <>
            <NumberField
              label="To X"
              value={Math.round(to.x * size.width)}
              min={0}
              max={size.width}
              unit="px"
              onChange={(v) => set({ to: { ...to, x: v / size.width } }, "to-x")}
            />
            <NumberField
              label="To Y"
              value={Math.round(to.y * size.height)}
              min={0}
              max={size.height}
              unit="px"
              onChange={(v) => set({ to: { ...to, y: v / size.height } }, "to-y")}
            />
          </>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        {toolToggle}
        <Button
          variant="outline"
          size="sm"
          aria-keyshortcuts="Delete"
          onClick={() => {
            if (commit((d) => deleteGesture(d, gesture.id))) select(null);
          }}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </div>
  );
}
