"use client";

import { useId } from "react";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FONTS, fontOption } from "@/engine/text/fonts";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Project, TextAnimation } from "@/schema/project";
import { deleteText, findText, updateText, type TextPatch } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { Choice, ColorField, NumberField, Section } from "./fields";
import { fromSeconds, toSeconds } from "./units";

const ANIMATIONS: { value: TextAnimation["type"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide" },
  { value: "scale", label: "Scale" },
];

export function TextPanel({ project }: { project: Project }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const textId = useId();
  const fontId = useId();
  const found = selection?.kind === "text" ? findText(project, selection.id) : null;
  if (!found) return null;

  const { layer } = found;
  const { width: cw, height: ch } = project.canvas;
  const set = (patch: TextPatch, key?: string) =>
    commit((d) => updateText(d, layer.id, patch), key ? { coalesce: `${key}-${layer.id}` } : undefined);
  const option = fontOption(layer.font.family);
  const projectSeconds = Math.max(toSeconds(layer.end), 60);
  const lineHeightPx = Math.round(layer.font.size * layer.font.lineHeight);

  return (
    <div className="space-y-8">
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

      <Section title="Font">
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
        <NumberField
          label="Size"
          value={layer.font.size}
          min={12}
          max={240}
          inputMax={400}
          unit="px"
          onChange={(v) => set({ font: { size: v } }, "size")}
        />
        <NumberField
          label="Weight"
          value={layer.font.weight}
          min={option.weights[0]}
          max={option.weights[1]}
          step={10}
          onChange={(v) => set({ font: { weight: v } }, "weight")}
        />
        <NumberField
          label="Line height"
          value={lineHeightPx}
          min={Math.round(layer.font.size * 0.8)}
          max={Math.round(layer.font.size * 2)}
          inputMin={1}
          inputMax={1000}
          unit="px"
          onChange={(v) => set({ font: { lineHeight: v / layer.font.size } }, "lineHeight")}
        />
        <NumberField
          label="Letter spacing"
          value={layer.font.letterSpacing}
          min={-10}
          max={30}
          inputMin={-100}
          inputMax={100}
          step={0.5}
          unit="px"
          onChange={(v) => set({ font: { letterSpacing: v } }, "letterSpacing")}
        />
        <ColorField label="Color" value={layer.color} onChange={(color) => set({ color }, "color")} />
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
      </Section>

      <Section title="Box">
        <NumberField
          label="Box X"
          value={Math.round(layer.box.x * cw)}
          min={0}
          max={cw}
          inputMin={-cw}
          inputMax={cw * 2}
          unit="px"
          onChange={(v) => set({ box: { x: v / cw } }, "box-x")}
        />
        <NumberField
          label="Box Y"
          value={Math.round(layer.box.y * ch)}
          min={0}
          max={ch}
          inputMin={-ch}
          inputMax={ch * 2}
          unit="px"
          onChange={(v) => set({ box: { y: v / ch } }, "box-y")}
        />
        <NumberField
          label="Box width"
          value={Math.round(layer.box.w * cw)}
          min={Math.round(0.05 * cw)}
          max={cw}
          inputMax={Math.round(1.5 * cw)}
          unit="px"
          onChange={(v) => set({ box: { w: v / cw } }, "box-w")}
        />
        <NumberField
          label="Box height"
          value={Math.round(layer.box.h * ch)}
          min={Math.round(0.03 * ch)}
          max={ch}
          inputMax={Math.round(1.5 * ch)}
          unit="px"
          onChange={(v) => set({ box: { h: v / ch } }, "box-h")}
        />
      </Section>

      <Section title="Timing">
        <NumberField
          label="Start"
          value={toSeconds(layer.start)}
          min={0}
          max={projectSeconds}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ start: fromSeconds(v) }, "start")}
        />
        <NumberField
          label="End"
          value={toSeconds(layer.end)}
          min={0}
          max={projectSeconds}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ end: fromSeconds(v) }, "end")}
        />
      </Section>

      {(["animIn", "animOut"] as const).map((key) => {
        const title = key === "animIn" ? "Animate in" : "Animate out";
        return (
          <Section key={key} title={title}>
            <Choice
              label={title}
              value={layer[key].type}
              options={ANIMATIONS}
              onChange={(type) => set({ [key]: { ...layer[key], type } })}
            />
            <NumberField
              label={`${title} duration`}
              value={toSeconds(layer[key].duration)}
              min={0}
              max={2}
              inputMax={10}
              step={0.05}
              unit="s"
              onChange={(v) => set({ [key]: { ...layer[key], duration: fromSeconds(v) } }, `${key}-duration`)}
            />
          </Section>
        );
      })}

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
