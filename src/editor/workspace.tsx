"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StorageError } from "@/storage/errors";
import { ProjectMigrationError } from "@/storage/migrations";
import { loadProject } from "@/storage/projects";
import { useProjectStore } from "@/store/project-store";
import type { Project } from "@/schema/project";
import { BackgroundsRail } from "./backgrounds-rail";
import { StylePanel } from "./inspector/style-panel";
import { PreviewCanvas } from "./preview/preview-canvas";
import { useFrames } from "./preview/use-frames";
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

function Workspace({ project }: { project: Project }) {
  const time = 0;
  const frames = useFrames(project, time);
  const autosave = useAutosave(project);

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
            <PreviewCanvas project={project} frames={frames.provider} frameVersion={frames.version} time={time} />
            {frames.error && (
              <p
                role="alert"
                className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-lg rounded-md bg-red-950/80 px-4 py-2 text-sm text-red-200"
              >
                {frames.error}
              </p>
            )}
          </section>
          <section aria-label="Timeline" className="h-56 shrink-0 border-t" />
        </main>
        <aside aria-label="Inspector" className="w-80 shrink-0 overflow-y-auto border-l p-4">
          <StylePanel />
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
