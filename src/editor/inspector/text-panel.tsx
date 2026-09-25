"use client";

import { useId } from "react";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { FONTS, fontOption } from "@/engine/text/fonts";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Project, TextAnimation } from "@/schema/project";
import { deleteText, findText, updateText, type TextPatch } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";

const ANIMATIONS: { id: TextAnimation["type"]; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide-up", label: "Slide" },
  { id: "scale", label: "Scale" },
];

export function TextPanel({ project }: { project: Project }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const textId = useId();
  const fontId = useId();
  const colorId = useId();
  const found = selection?.kind === "text" ? findText(project, selection.id) : null;

  if (!found) {
    return <p className="text-sm text-muted-foreground">Select text in the timeline or preview, or press T to add text.</p>;
  }
  const { layer } = found;
  const set = (patch: TextPatch, key?: string) =>
    commit((d) => updateText(d, layer.id, patch), key ? { coalesce: `${key}-${layer.id}` } : undefined);
  const option = fontOption(layer.font.family);

  return (
    <div className="space-y-7">
      <section className="space-y-2">
        <Label htmlFor={textId}>Text</Label>
        <textarea
          id={textId}
          value={layer.text}
          rows={3}
          onChange={(e) => set({ text: e.target.value }, "text")}
          className="w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(layer.start)} – {formatTime(layer.end)}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <Label htmlFor={fontId}>Font</Label>
          <select
            id={fontId}
            value={option.family}
            onChange={(e) => set({ font: { family: e.target.value } })}
            className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {FONTS.map((f) => (
              <option key={f.family} value={f.family}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Size" value={`${layer.font.size}px`}>
          <Slider thumbLabel="Font size" min={12} max={240} step={1} value={[layer.font.size]} onValueChange={([v]) => v !== undefined && set({ font: { size: v } }, "size")} />
        </Field>
        <Field label="Weight" value={String(layer.font.weight)}>
          <Slider thumbLabel="Font weight" min={option.weights[0]} max={option.weights[1]} step={50} value={[layer.font.weight]} onValueChange={([v]) => v !== undefined && set({ font: { weight: v } }, "weight")} />
        </Field>
        <Field label="Line height" value={layer.font.lineHeight.toFixed(2)}>
          <Slider thumbLabel="Line height" min={80} max={200} step={5} value={[Math.round(layer.font.lineHeight * 100)]} onValueChange={([v]) => v !== undefined && set({ font: { lineHeight: v / 100 } }, "lineHeight")} />
        </Field>
        <Field label="Letter spacing" value={`${layer.font.letterSpacing}px`}>
          <Slider thumbLabel="Letter spacing" min={-10} max={30} step={0.5} value={[layer.font.letterSpacing]} onValueChange={([v]) => v !== undefined && set({ font: { letterSpacing: v } }, "letterSpacing")} />
        </Field>
        <div className="flex items-center justify-between text-sm">
          <Label htmlFor={colorId}>Color</Label>
          <input
            id={colorId}
            type="color"
            value={layer.color}
            onChange={(e) => set({ color: e.target.value }, "color")}
            className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
          />
        </div>
        <div role="radiogroup" aria-label="Alignment" className="flex gap-1">
          {(
            [
              ["left", AlignLeftIcon],
              ["center", AlignCenterIcon],
              ["right", AlignRightIcon],
            ] as const
          ).map(([align, Icon]) => (
            <button
              key={align}
              type="button"
              role="radio"
              aria-checked={layer.align === align}
              aria-label={`Align ${align}`}
              onClick={() => set({ align })}
              className={cn(
                "rounded-md border p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                layer.align === align ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </section>

      {(["animIn", "animOut"] as const).map((key) => (
        <section key={key} className="space-y-2">
          <Label>{key === "animIn" ? "Animate in" : "Animate out"}</Label>
          <div role="radiogroup" aria-label={key === "animIn" ? "Animate in" : "Animate out"} className="grid grid-cols-4 gap-1">
            {ANIMATIONS.map((anim) => (
              <button
                key={anim.id}
                type="button"
                role="radio"
                aria-checked={layer[key].type === anim.id}
                onClick={() => set({ [key]: { ...layer[key], type: anim.id } })}
                className={cn(
                  "rounded-md border px-1 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  layer[key].type === anim.id ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {anim.label}
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">Drag the box in the preview to move it; drag its handles to resize and reflow.</p>

      <Button
        variant="outline"
        size="sm"
        aria-keyshortcuts="Delete"
        onClick={() => {
          if (commit((d) => deleteText(d, layer.id))) select(null);
        }}
      >
        <Trash2Icon />
        Delete text
      </Button>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}
