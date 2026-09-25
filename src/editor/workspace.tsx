"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { StorageError } from "@/storage/errors";
import { ProjectMigrationError } from "@/storage/migrations";
import { loadProject } from "@/storage/projects";
import { useProjectStore } from "@/store/project-store";
import { BackgroundsRail } from "./backgrounds-rail";
import { ExportPanel } from "./inspector/export-panel";
import { StylePanel } from "./inspector/style-panel";
import type { Player } from "./preview/player";
import { PreviewCanvas } from "./preview/preview-canvas";
import { usePlayer } from "./preview/use-player";
import { Transport } from "./timeline/transport";
import { useAutosave } from "./use-autosave";

export function EditorWorkspace({ projectId }: { projectId: string }) {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loaded = project?.id === projectId ? project : null;

  useEffect(() => {
    if (useProjectStore.getState().project?.id === projectId) return;
    let cancelled = false;
    loadProject(projectId)
      .then((p) => {
        if (cancelled) return;
        if (p) setProject(p);
        else setLoadError("This project isn't in this browser's storage. Projects are saved per browser.");
      })
      .catch((e: unknown) => {
        console.error(e);
        if (cancelled) return;
        setLoadError(
          e instanceof ProjectMigrationError || e instanceof StorageError
            ? e.message
            : "Couldn't open this project from browser storage.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, setProject]);

  if (loadError) return <WorkspaceMessage message={loadError} />;
  if (!loaded) return <div className="flex-1 bg-background" aria-busy="true" />;
  return <Workspace project={loaded} />;
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName));

/** Space toggles playback unless focus is on a control that uses Space itself. */
function usePlaybackShortcuts(player: Player | null) {
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      player.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);
}

type InspectorTab = "style" | "export";

function Workspace({ project }: { project: Project }) {
  const { player, frames, error } = usePlayer(project);
  const autosave = useAutosave(project);
  const [tab, setTab] = useState<InspectorTab>("style");
  usePlaybackShortcuts(player);

  return (
    <div className="flex h-dvh min-w-[1280px] flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/editor" className="text-muted-foreground hover:text-foreground">
            New project
          </Link>
          <span className="text-muted-foreground" aria-hidden>
            /
          </span>
          <h1 className="font-medium">{project.name}</h1>
        </div>
        {autosave.error && (
          <p role="status" className="text-xs text-red-400">
            {autosave.error}
          </p>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r p-4">
          <BackgroundsRail />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <section aria-label="Preview" className="relative flex min-h-0 flex-1 p-8">
            <PreviewCanvas project={project} frames={frames} player={player} />
            {error && (
              <p
                role="alert"
                className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-lg rounded-md bg-red-950/80 px-4 py-2 text-sm text-red-200"
              >
                {error}
              </p>
            )}
          </section>
          <section aria-label="Timeline" className="h-40 shrink-0 border-t">
            <Transport project={project} player={player} />
          </section>
        </main>
        <aside aria-label="Inspector" className="flex w-80 shrink-0 flex-col border-l">
          <div role="tablist" aria-label="Inspector panels" className="flex shrink-0 gap-1 border-b px-4 pt-3">
            {(["style", "export"] as const).map((id) => (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px border-b-2 px-3 pb-2 text-sm font-medium capitalize outline-none focus-visible:text-foreground focus-visible:underline",
                  tab === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
                )}
              >
                {id}
              </button>
            ))}
          </div>
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto p-4">
            {tab === "style" ? <StylePanel /> : <ExportPanel project={project} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function WorkspaceMessage({ message }: { message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p role="alert" className="max-w-md text-pretty text-muted-foreground">
        {message}
      </p>
      <Button asChild>
        <Link href="/editor">Import a video</Link>
      </Button>
    </main>
  );
}
