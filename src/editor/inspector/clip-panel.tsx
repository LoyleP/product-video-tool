"use client";

import { ScissorsIcon, Trash2Icon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clipDuration } from "@/engine/timeline";
import { formatTime } from "@/lib/format-time";
import type { Project } from "@/schema/project";
import {
  deleteClip,
  findClip,
  moveClip,
  setClipMuted,
  setClipSource,
  setClipSpeed,
  setTrackHidden,
  splitClip,
  updateOverlay,
} from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "../preview/player";
import { Choice, NumberField, Section } from "./fields";
import { fromSeconds, toSeconds } from "./units";

const QUICK_SPEEDS = [0.5, 1, 1.5, 2, 4];

export function ClipPanel({ project, player }: { project: Project; player: Player | null }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const found = selection?.kind === "clip" ? findClip(project, selection.id) : null;
  if (!found) return null;

  const { clip, track } = found;
  const asset = project.assets[clip.assetId];
  const assetSeconds = asset ? toSeconds(asset.duration) : toSeconds(clip.sourceOut);
  const canvasHeight = project.canvas.height;

  /** Applies a trim, then keeps the player and the shown frame in step. */
  const setSource = (inS: number, outS: number, movedEnd: boolean) => {
    commit((d) => setClipSource(d, clip.id, fromSeconds(inS), fromSeconds(outS)), { coalesce: `trim-${clip.id}` });
    if (!player) return;
    player.projectChanged();
    const updated = useProjectStore.getState().project;
    const current = updated && findClip(updated, clip.id)?.clip;
    if (current && !player.getState().playing) {
      player.seek(movedEnd ? current.timelineStart + clipDuration(current) - 1 : current.timelineStart);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="truncate text-sm font-medium">{asset?.name ?? "Clip"}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(clip.timelineStart)} · {formatTime(clipDuration(clip))}
        </p>
      </section>

      <Section title="Timing">
        <NumberField
          label="Start"
          value={toSeconds(clip.timelineStart)}
          min={0}
          max={Math.max(60, toSeconds(clip.timelineStart) * 2)}
          step={0.01}
          unit="s"
          slider={false}
          onChange={(v) => {
            commit((d) => moveClip(d, clip.id, fromSeconds(v)), { coalesce: `clip-start-${clip.id}` });
            player?.projectChanged();
          }}
        />
        <NumberField
          label="Trim start"
          value={toSeconds(clip.sourceIn)}
          min={0}
          max={assetSeconds}
          step={0.01}
          unit="s"
          onChange={(v) => setSource(v, toSeconds(clip.sourceOut), false)}
        />
        <NumberField
          label="Trim end"
          value={toSeconds(clip.sourceOut)}
          min={0}
          max={assetSeconds}
          step={0.01}
          unit="s"
          onChange={(v) => setSource(toSeconds(clip.sourceIn), v, true)}
        />
      </Section>

      <Section title="Speed">
        <NumberField
          label="Speed"
          value={clip.speed}
          min={0.25}
          max={8}
          step={0.05}
          unit="×"
          onChange={(v) => {
            commit((d) => setClipSpeed(d, clip.id, v), { coalesce: `speed-${clip.id}` });
            player?.projectChanged();
          }}
        />
        <div className="flex flex-wrap gap-1">
          {QUICK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => {
                commit((d) => setClipSpeed(d, clip.id, speed));
                player?.projectChanged();
              }}
              className={
                "rounded-md border px-2 py-0.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (clip.speed === speed ? "border-foreground/60 bg-muted" : "text-muted-foreground hover:bg-muted/50")
              }
            >
              {speed}×
            </button>
          ))}
        </div>
      </Section>

      {track.overlay && (
        <section className="space-y-4" aria-label="Camera overlay">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Camera</h2>
          <Choice
            label="Overlay shape"
            value={track.overlay.shape}
            options={[
              { value: "circle", label: "Circle" },
              { value: "rounded", label: "Rounded" },
            ]}
            onChange={(shape) => commit((d) => updateOverlay(d, track.id, { shape }))}
          />
          <NumberField
            label="Overlay size"
            value={Math.round(track.overlay.size * canvasHeight)}
            min={Math.round(0.1 * canvasHeight)}
            max={Math.round(0.5 * canvasHeight)}
            inputMin={Math.round(0.05 * canvasHeight)}
            inputMax={Math.round(0.6 * canvasHeight)}
            unit="px"
            onChange={(v) =>
              commit((d) => updateOverlay(d, track.id, { size: v / canvasHeight }), { coalesce: `overlay-size-${track.id}` })
            }
          />
          <Choice
            label="Overlay corner"
            columns={2}
            value={track.overlay.corner}
            options={(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => ({
              value: corner,
              label: corner.replace("-", " "),
            }))}
            onChange={(corner) => commit((d) => updateOverlay(d, track.id, { corner }))}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={track.overlay.mirror}
              onClick={() => commit((d) => updateOverlay(d, track.id, { mirror: !track.overlay!.mirror }))}
            >
              {track.overlay.mirror ? "Mirrored" : "Not mirrored"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={track.hidden}
              onClick={() => commit((d) => setTrackHidden(d, track.id, !track.hidden))}
            >
              {track.hidden ? "Show camera" : "Hide camera"}
            </Button>
          </div>
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
