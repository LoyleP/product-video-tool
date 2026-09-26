"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { deleteEffect, updateEffect } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";

export function EffectPanel({ project }: { project: Project }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const effect = selection?.kind === "effect" ? project.effects.find((e) => e.id === selection.id) : undefined;
  if (!effect) return null;

  return (
    <div className="space-y-7">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">{effect.type === "spotlight" ? "Spotlight" : "Blur"}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(effect.start)} – {formatTime(effect.end)}
        </p>
        <p className="text-xs text-muted-foreground">
          Draw or drag the box on the preview.{" "}
          {effect.type === "spotlight" ? "Everything outside it is dimmed." : "Everything inside it is blurred."}
        </p>
      </section>
      <section className="space-y-2">
        <Label>Type</Label>
        <div role="radiogroup" aria-label="Effect type" className="grid grid-cols-2 gap-1">
          {(["spotlight", "blur"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={effect.type === type}
              onClick={() => commit((d) => updateEffect(d, effect.id, { type }))}
              className={cn(
                "rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                effect.type === type ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {type === "spotlight" ? "Spotlight" : "Blur"}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <Label>Strength</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(effect.intensity * 100)}%
          </span>
        </div>
        <Slider
          thumbLabel="Effect strength"
          min={0}
          max={100}
          step={1}
          value={[Math.round(effect.intensity * 100)]}
          onValueChange={([v]) =>
            v !== undefined &&
            commit((d) => updateEffect(d, effect.id, { intensity: v / 100 }), {
              coalesce: `effect-strength-${effect.id}`,
            })
          }
        />
      </section>
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
