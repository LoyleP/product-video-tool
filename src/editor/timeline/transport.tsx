"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { projectDuration } from "@/engine/timeline";
import { formatTime } from "@/lib/format-time";
import type { Project } from "@/schema/project";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "../preview/player";
import { usePlayerState } from "../preview/use-player";

const MS = 1000;

/** Play, time, scrubber and trim for the single-clip timeline of Phase 2. */
export function Transport({ project, player }: { project: Project; player: Player | null }) {
  const { time, playing } = usePlayerState(player);
  const setClipTrim = useProjectStore((s) => s.setClipTrim);
  const duration = projectDuration(project);
  const clip = project.videoTracks[0]?.clips[0];
  const asset = clip ? project.assets[clip.assetId] : undefined;

  return (
    <div className="flex h-full flex-col gap-5 px-6 py-4">
      <div className="flex items-center gap-4">
        <Button
          size="icon"
          variant="secondary"
          aria-label={playing ? "Pause" : "Play"}
          aria-keyshortcuts="Space"
          disabled={!player || duration === 0}
          onClick={() => player?.toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <p className="w-40 shrink-0 font-mono text-sm tabular-nums" aria-live="off" data-testid="time-display">
          {formatTime(time)} <span className="text-muted-foreground">/ {formatTime(duration)}</span>
        </p>
        <Slider
          thumbLabel="Playhead"
          disabled={!player}
          min={0}
          max={Math.max(0, Math.floor((duration - 1) / MS))}
          step={1}
          value={[Math.floor(time / MS)]}
          onValueChange={([ms]) => ms !== undefined && player?.seek(ms * MS)}
        />
      </div>

      {clip && asset && (
        <div className="flex items-center gap-4">
          <p className="w-[11.5rem] shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Trim
          </p>
          <div className="flex flex-1 items-center gap-4">
            <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {formatTime(clip.sourceIn)}
            </span>
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
                setClipTrim(clip.id, inMs * MS, outMs * MS);
                if (!player) return;
                player.projectChanged();
                // Show the frame at whichever edge is being dragged.
                if (!playing) player.seek(movedEnd ? Number.MAX_SAFE_INTEGER : 0);
              }}
            />
            <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {formatTime(clip.sourceOut)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
