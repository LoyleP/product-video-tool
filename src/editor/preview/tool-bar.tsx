"use client";

import { CircleDotIcon, EyeOffIcon, SunIcon, TypeIcon, ZoomInIcon } from "lucide-react";
import { projectDuration } from "@/engine/timeline";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { addEffect, addText, addZoom } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "./player";

/**
 * One-click tools above the preview. Each adds its item at the playhead and selects it, so its box appears
 * on the preview ready to be drawn or adjusted.
 */
export function ToolBar({ project, player }: { project: Project; player: Player | null }) {
  const commit = useProjectStore((s) => s.commit);
  const select = useEditorStore((s) => s.select);
  const gestureTool = useEditorStore((s) => s.gestureTool);
  const setGestureTool = useEditorStore((s) => s.setGestureTool);
  const now = () => {
    player?.pause();
    return player?.getState().time ?? 0;
  };
  const end = projectDuration(project);

  const tools = [
    {
      id: "zoom",
      label: "Zoom",
      shortcut: "Z",
      icon: ZoomInIcon,
      run: () => {
        const id = crypto.randomUUID();
        const t = now();
        if (commit((d) => addZoom(d, t, id, end) !== null)) select({ kind: "zoom", id });
      },
    },
    {
      id: "spotlight",
      label: "Spotlight",
      icon: SunIcon,
      run: () => {
        const id = crypto.randomUUID();
        const t = now();
        if (commit((d) => addEffect(d, "spotlight", t, id, end) !== null)) select({ kind: "effect", id });
      },
    },
    {
      id: "blur",
      label: "Blur",
      icon: EyeOffIcon,
      run: () => {
        const id = crypto.randomUUID();
        const t = now();
        if (commit((d) => addEffect(d, "blur", t, id, end) !== null)) select({ kind: "effect", id });
      },
    },
    {
      id: "text",
      label: "Text",
      shortcut: "T",
      icon: TypeIcon,
      run: () => {
        const id = crypto.randomUUID();
        const t = now();
        if (commit((d) => addText(d, t, id, crypto.randomUUID(), end))) select({ kind: "text", id });
      },
    },
  ] as const;

  return (
    <div role="toolbar" aria-label="Add" className="flex items-center gap-1 rounded-lg border bg-background/80 p-1">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={tool.run}
          aria-keyshortcuts={"shortcut" in tool ? tool.shortcut : undefined}
          title={"shortcut" in tool ? `${tool.label} (${tool.shortcut})` : tool.label}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <tool.icon className="size-3.5" aria-hidden />
          {tool.label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={gestureTool}
        aria-keyshortcuts="G"
        title="Taps and swipes (G)"
        onClick={() => setGestureTool(!gestureTool)}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
          gestureTool ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <CircleDotIcon className="size-3.5" aria-hidden />
        Taps
      </button>
    </div>
  );
}
