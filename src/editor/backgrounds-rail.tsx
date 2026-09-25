"use client";

import { BACKGROUND_PRESETS } from "@/schema/defaults";
import type { Background } from "@/schema/project";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";
import { backgroundCss } from "./background-css";

const same = (a: Background, b: Background) => JSON.stringify(a) === JSON.stringify(b);

export function BackgroundsRail() {
  const current = useProjectStore((s) => s.project?.style.background);
  const setBackground = useProjectStore((s) => s.setBackground);

  return (
    <nav aria-label="Backgrounds" className="space-y-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Backgrounds</h2>
      <ul className="grid grid-cols-3 gap-2">
        {BACKGROUND_PRESETS.map((preset) => {
          const selected = !!current && same(current, preset.background);
          return (
            <li key={preset.id}>
              <button
                type="button"
                aria-label={preset.name}
                aria-pressed={selected}
                title={preset.name}
                onClick={() => setBackground(structuredClone(preset.background))}
                className={cn(
                  "block aspect-square w-full rounded-md ring-offset-2 ring-offset-background transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "ring-2 ring-foreground" : "ring-1 ring-border hover:ring-foreground/50",
                )}
                style={{ background: backgroundCss(preset.background) }}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
