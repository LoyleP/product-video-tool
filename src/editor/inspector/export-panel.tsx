"use client";

import { useEffect, useState } from "react";
import { canEncodeVideo } from "mediabunny";
import { Button } from "@/components/ui/button";
import { exportSize, videoBitrate } from "@/engine/export/settings";
import { cn } from "@/lib/utils";
import type { ExportSettings, Project } from "@/schema/project";
import { useProjectStore } from "@/store/project-store";
import { downloadFile } from "../export/run-export";
import { useExport, type ExportStatus } from "../export/use-export";

const PRESETS = [
  { id: "1080p", label: "1080p" },
  { id: "1440p", label: "1440p" },
  { id: "4k", label: "4K" },
] as const satisfies { id: Exclude<ExportSettings["preset"], "custom">; label: string }[];

type Preset = (typeof PRESETS)[number]["id"];

/** Which presets this browser can encode as H.264 at the project's frame rate. */
function usePresetSupport(project: Project): Partial<Record<Preset, boolean>> {
  const [support, setSupport] = useState<Partial<Record<Preset, boolean>>>({});
  const { canvas } = project;
  const { fps, quality } = project.export;
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      PRESETS.map(async ({ id }) => {
        const size = exportSize(id, canvas);
        const ok = await canEncodeVideo("avc", {
          ...size,
          bitrate: videoBitrate(size, fps, quality),
          frameRate: fps,
        }).catch(() => false);
        return [id, ok] as const;
      }),
    ).then((entries) => !cancelled && setSupport(Object.fromEntries(entries)));
    return () => {
      cancelled = true;
    };
  }, [canvas, fps, quality]);
  return support;
}

export function ExportPanel({ project }: { project: Project }) {
  const setExportPreset = useProjectStore((s) => s.setExportPreset);
  const setExportFps = useProjectStore((s) => s.setExportFps);
  const support = usePresetSupport(project);
  const { status, start, cancel } = useExport(project);
  const busy = status.kind === "preparing" || status.kind === "mixing-audio" || status.kind === "encoding";
  const selectedSupported = support[project.export.preset as Preset] !== false;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Resolution</h2>
        <div role="radiogroup" aria-label="Resolution" className="grid gap-1.5">
          {PRESETS.map(({ id, label }) => {
            const size = exportSize(id, project.canvas);
            const checked = project.export.preset === id;
            const unsupported = support[id] === false;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={busy}
                onClick={() => setExportPreset(id)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  checked ? "border-foreground/60 bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className="font-medium">{label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {unsupported ? "not supported here" : `${size.width}×${size.height}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Frame rate</h2>
        <div role="radiogroup" aria-label="Frame rate" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {([30, 60] as const).map((fps) => (
            <button
              key={fps}
              type="button"
              role="radio"
              aria-checked={project.export.fps === fps}
              disabled={busy}
              onClick={() => setExportFps(fps)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                project.export.fps === fps ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {fps} fps
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">MP4 · H.264 video · AAC audio</p>
      </section>

      <section className="space-y-3">
        {busy ? (
          <Button variant="outline" className="w-full" onClick={cancel}>
            Cancel export
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void start()} disabled={!selectedSupported}>
            Export MP4
          </Button>
        )}
        <ExportStatusView status={status} />
      </section>
    </div>
  );
}

function ExportStatusView({ status }: { status: ExportStatus }) {
  switch (status.kind) {
    case "idle":
      return null;
    case "preparing":
      return <p className="text-xs text-muted-foreground">Preparing…</p>;
    case "mixing-audio":
      return <p className="text-xs text-muted-foreground">Mixing audio…</p>;
    case "encoding": {
      const fraction = status.frame / status.totalFrames;
      const remaining = status.secondsLeft;
      return (
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${fraction * 100}%` }} />
          </div>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {Math.round(fraction * 100)}% · frame {status.frame} of {status.totalFrames}
            {remaining !== null && ` · about ${Math.ceil(remaining)} s left`}
          </p>
        </div>
      );
    }
    case "done":
      return (
        <div className="space-y-2 text-xs" data-testid="export-done">
          <p>
            Exported {(status.file.size / 1e6).toFixed(1)} MB in {status.seconds.toFixed(1)} s.
          </p>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => downloadFile(status.file, status.name)}>
            Download again
          </Button>
        </div>
      );
    case "canceled":
      return <p className="text-xs text-muted-foreground">Export canceled.</p>;
    case "error":
      return (
        <p role="alert" className="text-xs text-red-400">
          {status.message}
        </p>
      );
  }
}
