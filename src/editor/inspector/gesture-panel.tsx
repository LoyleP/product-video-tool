"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Gesture, Project } from "@/schema/project";
import { deleteGesture, updateGesture } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";

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

  if (!gesture) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Turn on the tap tool (G), then click the preview to add a tap at the playhead or drag to add a swipe.
        </p>
        {toolToggle}
      </div>
    );
  }

  const choice = <K extends "type" | "style">(key: K, options: [Gesture[K], string][]) => (
    <div role="radiogroup" aria-label={key === "type" ? "Gesture type" : "Gesture style"} className="grid grid-cols-2 gap-1">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={gesture[key] === value}
          onClick={() => commit((d) => updateGesture(d, gesture.id, { [key]: value }))}
          className={cn(
            "rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
            gesture[key] === value ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-7">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">{gesture.type === "tap" ? "Tap" : "Swipe"}</h2>
        <p className="font-mono text-xs text-muted-foreground">at {formatTime(gesture.time)}</p>
      </section>
      <section className="space-y-2">
        <Label>Type</Label>
        {choice("type", [
          ["tap", "Tap"],
          ["swipe", "Swipe"],
        ])}
      </section>
      <section className="space-y-2">
        <Label>Style</Label>
        {choice("style", [
          ["ripple", "Ripple"],
          ["dot", "Dot"],
        ])}
      </section>
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
