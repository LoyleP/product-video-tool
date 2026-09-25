"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectDuration } from "@/engine/timeline";
import { formatTime } from "@/lib/format-time";
import type { Project } from "@/schema/project";
import type { Player } from "../preview/player";
import { usePlayerState } from "../preview/use-player";

/** Play button, time and shuttle rate. */
export function Transport({ project, player }: { project: Project; player: Player | null }) {
  const { time, playing, rate } = usePlayerState(player);
  const duration = projectDuration(project);

  return (
    <div className="flex items-center gap-4 px-4 py-2">
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
      <p className="font-mono text-sm tabular-nums" data-testid="time-display">
        {formatTime(time)} <span className="text-muted-foreground">/ {formatTime(duration)}</span>
      </p>
      {playing && rate !== 1 && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" data-testid="shuttle-rate">
          {rate > 0 ? `${rate}×` : `◀ ${-rate}×`}
        </span>
      )}
      <p className="ml-auto text-xs text-muted-foreground">
        Space play · J K L shuttle · ←→ frame · S split · Z zoom · T text · G taps · ⌘Z undo
      </p>
    </div>
  );
}
