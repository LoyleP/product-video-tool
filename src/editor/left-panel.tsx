"use client";

import { LayoutTemplateIcon, PaletteIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore, type LeftPanelId } from "@/store/editor-store";
import { BackgroundsRail } from "./backgrounds-rail";
import { PresetsRail } from "./presets-rail";

const ITEMS: { id: LeftPanelId; label: string; icon: LucideIcon }[] = [
  { id: "presets", label: "Presets", icon: LayoutTemplateIcon },
  { id: "backgrounds", label: "Backgrounds", icon: PaletteIcon },
];

/**
 * An icon bar with one button per menu, and the chosen menu's panel opening next to it, like the sidebar
 * of a code editor. Selecting the open menu again closes its panel.
 */
export function LeftPanel() {
  const open = useEditorStore((s) => s.leftPanel);
  const setOpen = useEditorStore((s) => s.setLeftPanel);

  return (
    <>
      <nav aria-label="Menu" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = open === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={active}
              title={label}
              data-testid={`menu-${id}`}
              onClick={() => setOpen(active ? null : id)}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                active && "text-foreground",
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-foreground" aria-hidden />}
              <Icon className="size-5" aria-hidden />
            </button>
          );
        })}
      </nav>
      {open && (
        <aside aria-label={open === "presets" ? "Presets panel" : "Backgrounds panel"} className="w-64 shrink-0 overflow-y-auto border-r p-4">
          {open === "presets" ? <PresetsRail /> : <BackgroundsRail />}
        </aside>
      )}
    </>
  );
}
