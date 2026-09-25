"use client";

import { ScissorsIcon, Trash2Icon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { clipDuration } from "@/engine/timeline";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { deleteClip, findClip, setClipMuted, setClipSource, setClipSpeed, splitClip } from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "../preview/player";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const MS = 1000;

export function ClipPanel({ project, player }: { project: Project; player: Player | null }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const found = selection?.kind === "clip" ? findClip(project, selection.id) : null;

  if (!found) {
    return <p className="text-sm text-muted-foreground">Select a clip in the timeline to change its speed or trim.</p>;
  }
  const { clip } = found;
  const asset = project.assets[clip.assetId];
  const speedIndex = SPEEDS.reduce((best, s, i) => (Math.abs(s - clip.speed) < Math.abs(SPEEDS[best]! - clip.speed) ? i : best), 0);

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="truncate text-sm font-medium">{asset?.name ?? "Clip"}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(clip.timelineStart)} · {formatTime(clipDuration(clip))} long
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <Label>Speed</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{clip.speed}×</span>
        </div>
        <Slider
          thumbLabel="Speed"
          min={0}
          max={SPEEDS.length - 1}
          step={1}
          value={[speedIndex]}
          onValueChange={([i]) => {
            if (i === undefined) return;
            commit((d) => setClipSpeed(d, clip.id, SPEEDS[i]!), { coalesce: `speed-${clip.id}` });
            player?.projectChanged();
          }}
        />
        <div className="flex flex-wrap gap-1">
          {[0.5, 1, 1.5, 2, 4].map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => {
                commit((d) => setClipSpeed(d, clip.id, speed));
                player?.projectChanged();
              }}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                clip.speed === speed ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {speed}×
            </button>
          ))}
        </div>
        {clip.speed !== 1 && clip.muted === false && asset?.hasAudio && (
          <p className="text-xs text-muted-foreground">Audio plays at the new speed, so its pitch changes.</p>
        )}
      </section>

      {asset && (
        <section className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <Label>Trim</Label>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {formatTime(clip.sourceIn)} – {formatTime(clip.sourceOut)}
            </span>
          </div>
          <Slider
            thumbLabels={["Trim start", "Trim end"]}
            min={0}
            max={Math.floor(asset.duration / MS)}
            step={10}
            minStepsBetweenThumbs={10}
            value={[Math.round(clip.sourceIn / MS), Math.round(clip.sourceOut / MS)]}
            onValueChange={([inMs, outMs]) => {
              if (inMs === undefined || outMs === undefined) return;
              const movedEnd = outMs * MS !== clip.sourceOut;
              commit((d) => setClipSource(d, clip.id, inMs * MS, outMs * MS), { coalesce: `trim-${clip.id}` });
              if (!player) return;
              player.projectChanged();
              const updated = useProjectStore.getState().project;
              const current = updated && findClip(updated, clip.id)?.clip;
              if (current && !player.getState().playing) {
                player.seek(movedEnd ? current.timelineStart + clipDuration(current) - 1 : current.timelineStart);
              }
            }}
          />
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => commit((d) => setClipMuted(d, clip.id, !clip.muted))}
          aria-pressed={clip.muted}
        >
          {clip.muted ? <VolumeXIcon /> : <Volume2Icon />}
          {clip.muted ? "Unmute" : "Mute"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-keyshortcuts="S"
          onClick={() => {
            const t = player?.getState().time ?? 0;
            commit((d) => splitClip(d, t, crypto.randomUUID(), clip.id));
          }}
        >
          <ScissorsIcon />
          Split at playhead
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-keyshortcuts="Delete"
          onClick={() => {
            if (commit((d) => deleteClip(d, clip.id))) select(null);
          }}
        >
          <Trash2Icon />
          Delete
        </Button>
      </section>
    </div>
  );
}
