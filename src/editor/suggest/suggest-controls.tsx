"use client";

import { useRef } from "react";
import { CheckIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/schema/project";
import { NO_SUGGESTIONS, useSuggestionsStore } from "@/store/suggestions-store";
import { acceptSuggestions, dismissSuggestions } from "./accept";
import { suggestZooms } from "./suggest-zooms";

/** "Suggest zooms" with progress, then accept or dismiss all. */
export function SuggestControls({ project }: { project: Project }) {
  const status = useSuggestionsStore((s) => s.status);
  const suggestions = useSuggestionsStore((s) => (s.projectId === project.id ? s.suggestions : NO_SUGGESTIONS));
  const controller = useRef<AbortController | null>(null);

  const run = async () => {
    const { setStatus, setSuggestions } = useSuggestionsStore.getState();
    controller.current?.abort();
    const abort = (controller.current = new AbortController());
    setStatus({ kind: "analyzing", progress: 0 });
    try {
      const found = await suggestZooms(
        project,
        (progress) => {
          if (controller.current === abort) setStatus({ kind: "analyzing", progress });
        },
        abort.signal,
      );
      setSuggestions(project.id, found);
      setStatus({ kind: "done", found: found.length });
    } catch (error) {
      if (abort.signal.aborted) {
        setStatus({ kind: "idle" });
        return;
      }
      console.error(error);
      setStatus({ kind: "error", message: "Couldn't analyze this video for zooms." });
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  };

  if (status.kind === "analyzing") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <SparklesIcon className="size-3.5" />
        Finding zooms… {Math.round(status.progress * 100)}%
        <Button size="xs" variant="ghost" onClick={() => controller.current?.abort()}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="xs" variant="ghost" onClick={() => void run()} title="Find zooms from motion in the video">
        <SparklesIcon />
        Suggest zooms
      </Button>
      {suggestions.length > 0 ? (
        <>
          <Button size="xs" variant="secondary" onClick={() => acceptSuggestions(suggestions.map((s) => s.id))}>
            <CheckIcon />
            Accept all ({suggestions.length})
          </Button>
          <Button size="xs" variant="ghost" onClick={() => dismissSuggestions(suggestions.map((s) => s.id))}>
            <XIcon />
            Dismiss
          </Button>
        </>
      ) : status.kind === "done" ? (
        <span className="text-xs text-muted-foreground" role="status">
          {status.found === 0 ? "No clear activity to zoom on." : "All suggestions handled."}
        </span>
      ) : status.kind === "error" ? (
        <span role="alert" className="text-xs text-red-400">
          {status.message}
        </span>
      ) : null}
    </div>
  );
}
