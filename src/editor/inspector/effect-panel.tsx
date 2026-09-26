"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blurRadiusPx, dimAmount, intensityFromBlurPx, intensityFromDim } from "@/engine/layers/effects";
import { formatTime } from "@/lib/format-time";
import type { Effect, Project } from "@/schema/project";
import { deleteEffect, updateEffect } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { Choice, NumberField, Section } from "./fields";
import { fromSeconds, recordingSize, toSeconds } from "./units";

export function EffectPanel({ project }: { project: Project }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const effect = selection?.kind === "effect" ? project.effects.find((e) => e.id === selection.id) : undefined;
  if (!effect) return null;

  const size = recordingSize(project);
  const set = (patch: Partial<Omit<Effect, "id">>, key?: string) =>
    commit((d) => updateEffect(d, effect.id, patch), key ? { coalesce: `${key}-${effect.id}` } : undefined);
  const setRect = (patch: Partial<Effect["rect"]>, key: string) => set({ rect: { ...effect.rect, ...patch } }, key);
  const projectSeconds = Math.max(toSeconds(effect.end), 60);
  const px = (fraction: number, of: number) => Math.round(fraction * of);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">{effect.type === "spotlight" ? "Spotlight" : "Blur"}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(effect.start)} – {formatTime(effect.end)}
        </p>
      </section>

      <Choice
        label="Effect type"
        value={effect.type}
        options={[
          { value: "spotlight", label: "Spotlight" },
          { value: "blur", label: "Blur" },
        ]}
        onChange={(type) => set({ type })}
      />

      <Section title={effect.type === "spotlight" ? "Dimming" : "Blur amount"}>
        {effect.type === "blur" ? (
          <NumberField
            label="Blur radius"
            value={Math.round(blurRadiusPx(effect.intensity))}
            min={4}
            max={30}
            inputMax={100}
            unit="px"
            onChange={(v) => set({ intensity: intensityFromBlurPx(v) }, "strength")}
          />
        ) : (
          <NumberField
            label="Dimming"
            value={Math.round(dimAmount(effect.intensity) * 100)}
            min={20}
            max={80}
            inputMax={100}
            unit="%"
            onChange={(v) => set({ intensity: intensityFromDim(v / 100) }, "strength")}
          />
        )}
      </Section>

      <Section title="Area">
        <NumberField
          label="Area X"
          value={px(effect.rect.x, size.width)}
          min={0}
          max={size.width}
          unit="px"
          onChange={(v) => setRect({ x: v / size.width }, "x")}
        />
        <NumberField
          label="Area Y"
          value={px(effect.rect.y, size.height)}
          min={0}
          max={size.height}
          unit="px"
          onChange={(v) => setRect({ y: v / size.height }, "y")}
        />
        <NumberField
          label="Area width"
          value={px(effect.rect.w, size.width)}
          min={1}
          max={size.width}
          unit="px"
          onChange={(v) => setRect({ w: v / size.width }, "w")}
        />
        <NumberField
          label="Area height"
          value={px(effect.rect.h, size.height)}
          min={1}
          max={size.height}
          unit="px"
          onChange={(v) => setRect({ h: v / size.height }, "h")}
        />
      </Section>

      <Section title="Timing">
        <NumberField
          label="Start"
          value={toSeconds(effect.start)}
          min={0}
          max={projectSeconds}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ start: fromSeconds(v) }, "start")}
        />
        <NumberField
          label="End"
          value={toSeconds(effect.end)}
          min={0}
          max={projectSeconds}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => set({ end: fromSeconds(v) }, "end")}
        />
      </Section>

      <Button
        variant="outline"
        size="sm"
        aria-keyshortcuts="Delete"
        onClick={() => {
          if (commit((d) => deleteEffect(d, effect.id))) select(null);
        }}
      >
        <Trash2Icon />
        Delete effect
      </Button>
    </div>
  );
}
