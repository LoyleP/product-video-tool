"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/schema/project";
import { downloadFile, ExportError, exportFileName, runExport } from "./run-export";

export type ExportStatus =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "mixing-audio" }
  | { kind: "encoding"; frame: number; totalFrames: number; secondsLeft: number | null }
  | { kind: "done"; file: File; name: string; seconds: number }
  | { kind: "canceled" }
  | { kind: "error"; message: string };

export function useExport(project: Project) {
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });
  const controller = useRef<AbortController | null>(null);
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    if (controller.current) return;
    const abort = (controller.current = new AbortController());
    const snapshot = projectRef.current;
    const began = performance.now();
    let encodeStart = 0;
    setStatus({ kind: "preparing" });
    try {
      const file = await runExport(
        snapshot,
        (phase) => {
          if (phase.kind === "mixing-audio") return setStatus({ kind: "mixing-audio" });
          const now = performance.now();
          encodeStart ||= now;
          const fraction = phase.frame / phase.totalFrames;
          const elapsed = (now - encodeStart) / 1000;
          const secondsLeft = fraction > 0.02 ? Math.max(0, elapsed / fraction - elapsed) : null;
          setStatus({ kind: "encoding", frame: phase.frame, totalFrames: phase.totalFrames, secondsLeft });
        },
        abort.signal,
      );
      const name = exportFileName(snapshot);
      const seconds = (performance.now() - began) / 1000;
      console.info(`[export] ${name}: ${(file.size / 1e6).toFixed(1)} MB in ${seconds.toFixed(1)} s`);
      setStatus({ kind: "done", file, name, seconds });
      downloadFile(file, name);
    } catch (error) {
      if (abort.signal.aborted) {
        setStatus({ kind: "canceled" });
      } else {
        console.error(error);
        setStatus({
          kind: "error",
          message: error instanceof ExportError ? error.message : "Export failed. Try again, or choose a lower resolution.",
        });
      }
    } finally {
      controller.current = null;
    }
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { status, start, cancel };
}
