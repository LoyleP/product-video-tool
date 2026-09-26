"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";
import { CapabilitiesPanel } from "../capabilities-panel";
import { useCapabilities } from "../use-capabilities";
import { markImportStart } from "./import-timing";
import { ACCEPT_ATTRIBUTE, ImportError, importVideo } from "./import-video";
import { RecordPanel } from "../record/record-panel";
import { RecentProjects } from "./recent-projects";

type Status = { kind: "idle" } | { kind: "importing"; name: string } | { kind: "error"; message: string };

export function ImportScreen() {
  const router = useRouter();
  const caps = useCapabilities();
  const setProject = useProjectStore((s) => s.setProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || status.kind === "importing") return;
    markImportStart();
    setStatus({ kind: "importing", name: file.name });
    try {
      const project = await importVideo(file);
      setProject(project);
      router.push(`/editor/${project.id}`);
    } catch (error) {
      if (error instanceof ImportError) console.warn(error.message, error.cause);
      else console.error(error);
      const message = error instanceof ImportError ? error.message : "Something went wrong while importing this video.";
      setStatus({ kind: "error", message });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <section
        aria-label="Import a video"
        className={cn(
          "flex w-full max-w-2xl flex-col items-center gap-5 rounded-2xl border border-dashed px-8 py-16 text-center transition-colors",
          dragging && "border-foreground/60 bg-muted/40",
        )}
      >
        <UploadIcon className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Drop a screen recording</h1>
        <Button onClick={() => inputRef.current?.click()} disabled={status.kind === "importing"}>
          {status.kind === "importing" ? `Importing ${status.name}…` : "Choose a video"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-label="Video file"
          data-testid="import-input"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {status.kind === "error" && (
          <p role="alert" className="max-w-md text-sm text-red-400">
            {status.message}
          </p>
        )}
      </section>
      <RecordPanel />
      <RecentProjects />
      {caps && (
        <div className="w-full max-w-2xl">
          <CapabilitiesPanel caps={caps} />
        </div>
      )}
    </main>
  );
}
