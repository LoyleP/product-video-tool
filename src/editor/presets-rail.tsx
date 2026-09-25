"use client";

import { useEffect, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { BUILT_IN_PRESETS, presetFromProject, type StylePreset } from "@/schema/presets";
import { applyPreset } from "@/store/edits";
import { useProjectStore } from "@/store/project-store";
import { deleteCustomPreset, listCustomPresets, saveCustomPreset } from "@/storage/presets";
import { backgroundCss } from "./background-css";

/** Preset gallery: eight built-ins plus presets saved in this browser. */
export function PresetsRail() {
  const commit = useProjectStore((s) => s.commit);
  const [custom, setCustom] = useState<StylePreset[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomPresets()
      .then((list) => !cancelled && setCustom(list))
      .catch((e: unknown) => console.warn("Couldn't load presets", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const name = window.prompt("Name this preset", `My preset ${custom.length + 1}`)?.trim();
    if (!name) return;
    const sample = project.textTracks.flatMap((t) => t.layers)[0];
    const preset = presetFromProject(crypto.randomUUID(), name, project.style, sample);
    try {
      await saveCustomPreset(preset);
      setCustom((list) => [...list, preset]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the preset.");
    }
  };

  return (
    <nav aria-label="Presets" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Presets</h2>
        <button
          type="button"
          onClick={() => void save()}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-3" />
          Save current
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {[...BUILT_IN_PRESETS, ...custom].map((preset) => (
          <li key={preset.id} className="group relative">
            <button
              type="button"
              aria-label={`Apply preset ${preset.name}`}
              onClick={() => commit((d) => applyPreset(d, preset))}
              className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PresetThumbnail preset={preset} />
              <span className="mt-1 block truncate text-xs text-muted-foreground">{preset.name}</span>
            </button>
            {!preset.builtIn && (
              <button
                type="button"
                aria-label={`Delete preset ${preset.name}`}
                onClick={async () => {
                  await deleteCustomPreset(preset.id);
                  setCustom((list) => list.filter((p) => p.id !== preset.id));
                }}
                className="absolute top-1 right-1 rounded bg-background/80 p-0.5 opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </nav>
  );
}

function PresetThumbnail({ preset }: { preset: StylePreset }) {
  const bg = preset.style.background ?? { type: "solid" as const, color: "#27272a" };
  const pad = (preset.style.padding ?? 0.08) * 100 * 1.4;
  const shadow = preset.style.shadow;
  return (
    <div
      className="relative aspect-video overflow-hidden rounded-md ring-1 ring-border"
      style={{ background: backgroundCss(bg) }}
      aria-hidden
    >
      <div
        className="absolute bg-zinc-200/90"
        style={{
          inset: `${pad}%`,
          borderRadius: (preset.style.cornerRadius ?? 20) / 8,
          boxShadow: shadow ? `0 ${shadow.offsetY / 10}px ${shadow.blur / 8}px rgba(0,0,0,${shadow.opacity})` : undefined,
        }}
      />
      {preset.text && (
        <span
          className="absolute inset-x-0 bottom-1 text-center text-[9px] font-semibold"
          style={{ color: preset.text.color }}
        >
          Aa
        </span>
      )}
    </div>
  );
}
