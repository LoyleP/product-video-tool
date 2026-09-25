"use client";

import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Background } from "@/schema/project";
import { useProjectStore } from "@/store/project-store";

export function StylePanel() {
  const style = useProjectStore((s) => s.project?.style);
  const updateStyle = useProjectStore((s) => s.updateStyle);
  const setBackground = useProjectStore((s) => s.setBackground);
  if (!style) return null;

  const bg = style.background;

  return (
    <div className="space-y-8">
      <Section title="Background">
        <div role="radiogroup" aria-label="Background type" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["gradient", "solid"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={bg.type === type}
              onClick={() => setBackground(convertBackground(bg, type))}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring",
                bg.type === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {type}
            </button>
          ))}
        </div>
        {bg.type === "solid" && (
          <ColorField label="Color" value={bg.color} onChange={(color) => setBackground({ type: "solid", color })} />
        )}
        {bg.type === "gradient" && (
          <>
            {bg.stops.map((stop, i) => (
              <ColorField
                key={i}
                label={`Color ${i + 1}`}
                value={stop.color}
                onChange={(color) =>
                  updateStyle((s) => {
                    if (s.background.type === "gradient") s.background.stops[i]!.color = color;
                  })
                }
              />
            ))}
            <SliderField
              label="Angle"
              value={bg.angle}
              min={0}
              max={360}
              format={(v) => `${v}°`}
              onChange={(v) =>
                updateStyle((s) => {
                  if (s.background.type === "gradient") s.background.angle = v;
                })
              }
            />
          </>
        )}
      </Section>

      <Section title="Layout">
        <SliderField
          label="Padding"
          value={Math.round(style.padding * 100)}
          min={0}
          max={30}
          format={(v) => `${v}%`}
          onChange={(v) => updateStyle((s) => void (s.padding = v / 100))}
        />
        <SliderField
          label="Corner radius"
          value={style.cornerRadius}
          min={0}
          max={120}
          format={(v) => `${v}px`}
          onChange={(v) => updateStyle((s) => void (s.cornerRadius = v))}
        />
      </Section>

      <Section title="Shadow">
        <SliderField
          label="Blur"
          value={style.shadow.blur}
          min={0}
          max={200}
          format={(v) => `${v}px`}
          onChange={(v) => updateStyle((s) => void (s.shadow.blur = v))}
        />
        <SliderField
          label="Offset"
          value={style.shadow.offsetY}
          min={0}
          max={100}
          format={(v) => `${v}px`}
          onChange={(v) => updateStyle((s) => void (s.shadow.offsetY = v))}
        />
        <SliderField
          label="Opacity"
          value={Math.round(style.shadow.opacity * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(v) => updateStyle((s) => void (s.shadow.opacity = v / 100))}
        />
      </Section>
    </div>
  );
}

function convertBackground(bg: Background, type: "solid" | "gradient"): Background {
  if (bg.type === type) return bg;
  const base = bg.type === "solid" ? bg.color : bg.type === "gradient" ? bg.stops[0]!.color : "#4f46e5";
  return type === "solid"
    ? { type: "solid", color: base }
    : { type: "gradient", angle: 135, stops: [{ color: base, at: 0 }, { color: "#0a0a0a", at: 1 }] };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label id={id}>{props.label}</Label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{props.format(props.value)}</span>
      </div>
      <Slider
        aria-labelledby={id}
        thumbLabel={props.label}
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={1}
        onValueChange={([v]) => v !== undefined && props.onChange(v)}
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between text-sm">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground uppercase">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
        />
      </div>
    </div>
  );
}
