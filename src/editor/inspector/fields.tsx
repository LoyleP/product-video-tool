"use client";

import { useId, useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Digits after the decimal point implied by a step (0.01 -> 2). */
function decimalsOf(step: number): number {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1]!.length : 0;
}

/** Rounds to the step's precision, so floating point noise never reaches the model. */
export function roundToStep(value: number, step: number): number {
  const d = decimalsOf(step);
  return Number(value.toFixed(d));
}

export interface NumberFieldProps {
  label: string;
  /** In display units (px, seconds, degrees...). */
  value: number;
  onChange: (value: number) => void;
  step?: number;
  /** Slider range. Omit `slider` to show only the input. */
  min: number;
  max: number;
  /** Range the input accepts, when wider than the slider's. Defaults to the slider range. */
  inputMin?: number;
  inputMax?: number;
  unit?: string;
  slider?: boolean;
}

/**
 * A value with a slider and a typed input. The input takes exact values: Enter or leaving the field applies
 * them (clamped to the allowed range), Escape puts the old value back, and Up and Down arrows step by the
 * field's step (10x with Shift).
 */
export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  inputMin = min,
  inputMax = max,
  unit,
  slider = true,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const decimals = decimalsOf(step);
  const shown = draft ?? value.toFixed(decimals);

  const apply = (n: number) => {
    const next = roundToStep(Math.min(inputMax, Math.max(inputMin, n)), step);
    if (next !== value) onChange(next);
  };

  const commit = () => {
    const text = (draft ?? "").trim().replace(",", ".");
    setDraft(null);
    if (text === "") return;
    const n = Number(text);
    if (Number.isFinite(n)) apply(n);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative w-[5.5rem]">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={shown}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                e.currentTarget.select();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setDraft(null);
              } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const base = draft !== null && Number.isFinite(Number(draft.replace(",", "."))) ? Number(draft.replace(",", ".")) : value;
                setDraft(null);
                apply(base + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
              }
            }}
            className={cn(
              "h-7 w-full rounded-md border bg-transparent pr-7 pl-2 text-right font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !unit && "pr-2",
            )}
          />
          {unit && (
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center font-mono text-[10px] text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      </div>
      {slider && (
        <Slider
          thumbLabel={label}
          value={[Math.min(max, Math.max(min, value))]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => v !== undefined && apply(v)}
        />
      )}
    </div>
  );
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalizes "#abc", "abc" or "#aabbcc" to "#aabbcc", or null when it isn't a hex color. */
export function normalizeHex(text: string): string | null {
  const match = HEX.exec(text.trim());
  if (!match) return null;
  let hex = match[1]!.toLowerCase();
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return `#${hex}`;
}

/** A color picker with a hex input for exact values. */
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const hex = normalizeHex(draft ?? "");
    setDraft(null);
    if (hex && hex !== value.toLowerCase()) onChange(hex);
  };
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={draft ?? value.toUpperCase()}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            }
          }}
          className="h-7 w-[5.5rem] rounded-md border bg-transparent px-2 text-right font-mono text-xs uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
        />
      </div>
    </div>
  );
}

/** A row of mutually exclusive options. */
export function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
