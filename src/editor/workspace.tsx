"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlusIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { StorageError } from "@/storage/errors";
import { ProjectMigrationError } from "@/storage/migrations";
import { loadProject } from "@/storage/projects";
import { appendVideo } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import { useSuggestionsStore } from "@/store/suggestions-store";
import { BackgroundsRail } from "./backgrounds-rail";
import { ACCEPT_ATTRIBUTE, ImportError, importAsset } from "./import/import-video";
import { ClipPanel } from "./inspector/clip-panel";
import { EffectPanel } from "./inspector/effect-panel";
import { GesturePanel } from "./inspector/gesture-panel";
import { TextPanel } from "./inspector/text-panel";
import { ExportPanel } from "./inspector/export-panel";
import { StylePanel } from "./inspector/style-panel";
import { SuggestionPanel } from "./inspector/suggestion-panel";
import { ZoomPanel } from "./inspector/zoom-panel";
import { PresetsRail } from "./presets-rail";
import { PreviewCanvas } from "./preview/preview-canvas";
import { ToolBar } from "./preview/tool-bar";
import { usePlayer } from "./preview/use-player";
import { Timeline } from "./timeline/timeline";
import { Transport } from "./timeline/transport";
import { useAutosave } from "./use-autosave";
import { useEditorShortcuts } from "./use-editor-shortcuts";

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

type InspectorTab = "style" | "edit" | "export";
const EDIT_LABELS = {
  clip: "Clip",
  zoom: "Zoom",
  text: "Text",
  gesture: "Tap",
  suggestion: "Suggestion",
  effect: "Effect",
} as const;

function Workspace({ project }: { project: Project }) {
  const { player, frames, error } = usePlayer(project);
  const autosave = useAutosave(project);
  const [tab, setTab] = useState<InspectorTab>("style");
  const selection = useEditorStore((s) => s.selection);
  const gestureTool = useEditorStore((s) => s.gestureTool);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  useEditorShortcuts(player);

  // Show the matching panel when something is selected in the timeline.
  const [lastSelection, setLastSelection] = useState(selection);
  if (selection !== lastSelection) {
    setLastSelection(selection);
    if (selection) setTab("edit");
  }
  const [lastTool, setLastTool] = useState(gestureTool);
  if (gestureTool !== lastTool) {
    setLastTool(gestureTool);
    if (gestureTool) setTab("edit");
  }

  // Keep the player in step with timing edits, including undo and redo.
  const timing = JSON.stringify([project.videoTracks, project.zooms]);

  useEffect(() => {
    player?.projectChanged();
  }, [player, timing]);

  // A new project starts with nothing selected and no suggestions.
  useEffect(() => {
    useEditorStore.getState().select(null);
    useSuggestionsStore.getState().reset(project.id);
  }, [project.id]);

  // Suggestions are positioned for the current clip timing; edits to clips make them stale.
  const clipTiming = JSON.stringify(project.videoTracks);
  useEffect(() => {
    const { suggestions, reset, projectId } = useSuggestionsStore.getState();
    if (suggestions.length > 0 && projectId === project.id) reset(project.id);
  }, [clipTiming, project.id]);

  const run = (action: "undo" | "redo") => {
    useProjectStore.getState()[action]();
    player?.projectChanged();
  };

  return (
    <div className="flex h-dvh min-w-[1280px] flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/editor" className="text-muted-foreground hover:text-foreground">
            Projects
          </Link>
          <span className="text-muted-foreground" aria-hidden>
            /
          </span>
          <h1 className="font-medium">{project.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {autosave.error && (
            <p role="status" className="text-xs text-red-400">
              {autosave.error}
            </p>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Undo" aria-keyshortcuts="Meta+Z Control+Z" title="Undo (⌘Z / Ctrl+Z)" disabled={!canUndo} onClick={() => run("undo")}>
            <Undo2Icon />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Redo" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z" title="Redo (⇧⌘Z / Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => run("redo")}>
            <Redo2Icon />
          </Button>
          <AddVideoButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 space-y-8 overflow-y-auto border-r p-4">
          <PresetsRail />
          <BackgroundsRail />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <section aria-label="Preview" className="relative flex min-h-0 flex-1 flex-col items-center gap-3 p-6 pt-3">
            <ToolBar project={project} player={player} />
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
          <section aria-label="Timeline" className="flex h-80 shrink-0 flex-col border-t">
            <Transport project={project} player={player} />
            <div className="min-h-0 flex-1">
              <Timeline project={project} player={player} />
            </div>
          </section>
        </main>
        <aside aria-label="Inspector" className="flex w-80 shrink-0 flex-col border-l">
          <div role="tablist" aria-label="Inspector panels" className="flex shrink-0 gap-1 border-b px-3 pt-3">
            {(["style", "edit", "export"] as const).map((id) => (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px border-b-2 px-2.5 pb-2 text-sm font-medium capitalize outline-none focus-visible:text-foreground focus-visible:underline",
                  tab === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
                )}
              >
                {id === "edit" ? (selection ? EDIT_LABELS[selection.kind] : gestureTool ? "Tap" : "Edit") : id}
              </button>
            ))}
          </div>
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto p-4">
            {tab === "style" && <StylePanel />}
            {tab === "edit" && (
              <>
                {selection?.kind === "clip" && <ClipPanel project={project} player={player} />}
                {selection?.kind === "zoom" && <ZoomPanel project={project} player={player} />}
                {selection?.kind === "suggestion" && <SuggestionPanel />}
                {selection?.kind === "effect" && <EffectPanel project={project} />}
                {selection?.kind === "text" && <TextPanel project={project} />}
                {(selection?.kind === "gesture" || (!selection && gestureTool)) && <GesturePanel project={project} />}
                {!selection && !gestureTool && <EditHelp />}
              </>
            )}
            {tab === "export" && <ExportPanel project={project} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EditHelp() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Use the bar above the preview to add a zoom, spotlight, blur or text at the playhead, then draw its box on the
        preview. Or select something in the timeline to edit it.
      </p>
      <p>Shortcuts:</p>
      <ul className="space-y-1.5">
        <li>
          <kbd className="rounded border px-1 font-mono text-xs">Z</kbd> a zoom at the playhead
        </li>
        <li>
          <kbd className="rounded border px-1 font-mono text-xs">T</kbd> text at the playhead
        </li>
        <li>
          <kbd className="rounded border px-1 font-mono text-xs">G</kbd> the tap tool, then click or drag the preview
        </li>
        <li>
          <kbd className="rounded border px-1 font-mono text-xs">S</kbd> split the clip at the playhead
        </li>
      </ul>
    </div>
  );
}

/** Imports another video and appends it to the end of the timeline. */
function AddVideoButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const commit = useProjectStore((s) => s.commit);
  const select = useEditorStore((s) => s.select);

  return (
    <>
      {message && (
        <p role="alert" className="max-w-xs truncate text-xs text-red-400" title={message}>
          {message}
        </p>
      )}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        <PlusIcon />
        {busy ? "Adding…" : "Add video"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label="Video file to add"
        data-testid="add-video-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setMessage(null);
          try {
            const { asset } = await importAsset(file);
            const clipId = crypto.randomUUID();
            if (commit((d) => appendVideo(d, asset, clipId))) select({ kind: "clip", id: clipId });
          } catch (error) {
            setMessage(error instanceof ImportError ? error.message : "Couldn't add that video.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
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
