"use client";

import { useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectDuration } from "@/engine/timeline";
import { fromSeconds } from "../inspector/units";
import { formatTime } from "@/lib/format-time";
import type { Project } from "@/schema/project";
import type { Player } from "../preview/player";
import { usePlayerState } from "../preview/use-player";

/** Parses "1:02.50", "62.5" or "0:03" into seconds, or null when it isn't a time. */
export function parseTime(text: string): number | null {
  const parts = text.trim().replace(",", ".").split(":");
  if (parts.length > 3 || parts.some((p) => p === "" || !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** Play button, the playhead time (click it to type a time) and the shuttle rate. */
export function Transport({ project, player }: { project: Project; player: Player | null }) {
  const { time, playing, rate } = usePlayerState(player);
  const [draft, setDraft] = useState<string | null>(null);
  const duration = projectDuration(project);

  const commit = () => {
    const seconds = draft === null ? null : parseTime(draft);
    setDraft(null);
    if (seconds !== null) player?.seek(fromSeconds(seconds));
  };

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
      <p className="flex items-center font-mono text-sm tabular-nums" data-testid="time-display">
        {draft === null ? (
          <button
            type="button"
            aria-label="Playhead time"
            onClick={() => {
              player?.pause();
              setDraft(formatTime(time));
            }}
            className="rounded px-1 py-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {formatTime(time)}
          </button>
        ) : (
          <input
            autoFocus
            aria-label="Playhead time"
            value={draft}
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") {
                e.stopPropagation();
                setDraft(null);
              }
            }}
            className="h-6 w-24 rounded border bg-transparent px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        <span className="pl-1 text-muted-foreground">/ {formatTime(duration)}</span>
      </p>
      {playing && rate !== 1 && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" data-testid="shuttle-rate">
          {rate > 0 ? `${rate}×` : `◀ ${-rate}×`}
        </span>
      )}
    </div>
  );
}
