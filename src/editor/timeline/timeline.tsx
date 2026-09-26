"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link2Icon, PlusIcon, VolumeXIcon } from "lucide-react";
import { ZOOM_MERGE_GAP } from "@/engine/camera";
import { MICROS_PER_SECOND, type Micros } from "@/engine/time";
import { clipDuration, clipEnd, projectDuration } from "@/engine/timeline";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { Project } from "@/schema/project";
import { GESTURE_DURATION } from "@/engine/layers/gestures";
import {
  addText,
  addZoom,
  addZoomRange,
  moveClip,
  moveEffect,
  moveText,
  moveZoom,
  trimClipEdge,
  updateEffect,
  updateGesture,
  updateText,
  updateZoom,
} from "@/store/edits";
import { useEditorStore } from "@/store/editor-store";
import { useProjectStore } from "@/store/project-store";
import type { Player } from "../preview/player";
import { usePlayerState } from "../preview/use-player";

const LABEL_WIDTH = 88;
const SNAP_PX = 8;
const DRAG_THRESHOLD_PX = 3;
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

let dragSessions = 0;

/** Ruler label: m:ss, with decimals only when ticks are closer than a second. */
function tickLabel(seconds: number, step: number): string {
  const m = Math.floor(seconds / 60);
  const sec = seconds - m * 60;
  const text =
    step < 1
      ? sec.toFixed(step < 0.5 ? 2 : 1).padStart(step < 0.5 ? 5 : 4, "0")
      : String(Math.round(sec)).padStart(2, "0");
  return `${m}:${text}`;
}

interface DragHandlers {
  onMove: (dxPx: number) => void;
  onClick?: () => void;
}

/** Pointer drag with a small threshold so clicks still register as clicks. */
function beginDrag(event: ReactPointerEvent, handlers: DragHandlers) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  let moved = false;
  const move = (e: PointerEvent) => {
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    moved = true;
    handlers.onMove(dx);
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
    if (!moved) handlers.onClick?.();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}

/** Snaps `t` to the nearest point within the snap distance. */
function snap(t: Micros, points: Micros[], threshold: Micros): { t: Micros; distance: number } {
  let best = { t, distance: Number.POSITIVE_INFINITY };
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d <= threshold && d < best.distance) best = { t: p, distance: d };
  }
  return best;
}

export function Timeline({ project, player }: { project: Project; player: Player | null }) {
  const { time, playing } = usePlayerState(player);
  const pps = useEditorStore((s) => s.pxPerSecond);
  const setPps = useEditorStore((s) => s.setPxPerSecond);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const commit = useProjectStore((s) => s.commit);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);

  const duration = projectDuration(project);
  const toPx = (t: Micros) => (t / MICROS_PER_SECOND) * pps;
  const toTime = (px: number) => Math.round((px / pps) * MICROS_PER_SECOND);
  const contentWidth = Math.max(toPx(duration) + 240, viewWidth - LABEL_WIDTH);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setViewWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ctrl or Cmd + wheel zooms the timeline around the cursor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const current = useEditorStore.getState().pxPerSecond;
      const x = e.clientX - el.getBoundingClientRect().left - LABEL_WIDTH + el.scrollLeft;
      const seconds = x / current;
      const next = current * Math.exp(-e.deltaY * 0.01);
      useEditorStore.getState().setPxPerSecond(next);
      const applied = useEditorStore.getState().pxPerSecond;
      el.scrollLeft = seconds * applied - (x - el.scrollLeft);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the playhead in view during playback.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = (time / MICROS_PER_SECOND) * pps;
    const visible = el.clientWidth - LABEL_WIDTH;
    if (x < el.scrollLeft || x > el.scrollLeft + visible - 40) el.scrollLeft = Math.max(0, x - visible * 0.2);
  }, [time, playing, pps]);

  const snapPoints = (excludeId: string): Micros[] => {
    const points = [0, time];
    for (const track of project.videoTracks) {
      for (const c of track.clips) if (c.id !== excludeId) points.push(c.timelineStart, clipEnd(c));
    }
    for (const z of project.zooms) if (z.id !== excludeId) points.push(z.start, z.end);
    for (const track of project.textTracks) {
      for (const l of track.layers) if (l.id !== excludeId) points.push(l.start, l.end);
    }
    for (const g of project.gestures) if (g.id !== excludeId) points.push(g.time);
    for (const fx of project.effects) if (fx.id !== excludeId) points.push(fx.start, fx.end);
    return points;
  };
  const threshold = toTime(SNAP_PX);

  const fit = () => {
    const available = (scrollRef.current?.clientWidth ?? 800) - LABEL_WIDTH - 48;
    if (duration > 0) setPps(available / (duration / MICROS_PER_SECOND));
  };

  const tickStep = TICK_STEPS.find((s) => s * pps >= 64) ?? 600;
  const ticks: number[] = [];
  for (let s = 0; s * pps <= contentWidth; s += tickStep) ticks.push(s);

  const scrubFrom = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!player || e.button !== 0) return;
    const el = e.currentTarget;
    const seekTo = (clientX: number) => {
      const x = clientX - el.getBoundingClientRect().left;
      player.seek(toTime(Math.max(0, x)));
    };
    seekTo(e.clientX);
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => seekTo(ev.clientX);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const [rangeDraft, setRangeDraft] = useState<{ from: number; to: number } | null>(null);

  /** On the zoom row: dragging across empty space creates a zoom for that range; a click moves the playhead. */
  const rangeOrScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!player || e.button !== 0) return;
    const el = e.currentTarget;
    const left = el.getBoundingClientRect().left;
    const startX = Math.max(0, e.clientX - left);
    el.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, ev.clientX - left);
      if (!moved && Math.abs(x - startX) < DRAG_THRESHOLD_PX) return;
      moved = true;
      setRangeDraft({ from: Math.min(startX, x), to: Math.max(startX, x) });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setRangeDraft(null);
      if (!moved) {
        player.seek(toTime(startX));
        return;
      }
      const points = snapPoints("");
      const from = snap(toTime(startX), points, threshold).t;
      const to = snap(toTime(Math.max(0, ev.clientX - left)), points, threshold).t;
      const id = crypto.randomUUID();
      if (commit((d) => addZoomRange(d, from, to, id, duration) !== null)) {
        player.pause();
        player.seek(Math.min(from, to) + Math.abs(to - from) / 2);
        select({ kind: "zoom", id });
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const sortedZooms = [...project.zooms].sort((a, b) => a.start - b.start);

  const addZoomAt = (t: Micros) => {
    const id = crypto.randomUUID();
    let added = false;
    commit((d) => {
      added = addZoom(d, t, id, duration) !== null;
      return added;
    });
    if (added) select({ kind: "zoom", id });
  };

  const addTextAt = (t: Micros) => {
    const id = crypto.randomUUID();
    if (commit((d) => addText(d, t, id, crypto.randomUUID(), duration))) select({ kind: "text", id });
  };
  const textTracks = project.textTracks.length > 0 ? project.textTracks : [{ id: "text-empty", layers: [] }];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="timeline">
      <div className="flex shrink-0 items-center justify-end gap-1 px-3 py-1">
        <span className="mr-auto pl-2 text-xs text-muted-foreground">
          Drag to move, drag edges to trim. Ctrl or ⌘ + scroll to zoom.
        </span>
        <TimelineButton label="Zoom timeline out" onClick={() => setPps(pps / 1.5)}>
          −
        </TimelineButton>
        <TimelineButton label="Fit timeline" onClick={fit}>
          Fit
        </TimelineButton>
        <TimelineButton label="Zoom timeline in" onClick={() => setPps(pps * 1.5)}>
          +
        </TimelineButton>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: contentWidth + LABEL_WIDTH }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex h-6 bg-background">
            <div className="sticky left-0 z-20 shrink-0 bg-background" style={{ width: LABEL_WIDTH }} />
            <div
              className="relative flex-1 cursor-text border-b"
              onPointerDown={scrubFrom}
              data-testid="timeline-ruler"
              aria-hidden
            >
              {ticks.map((s) => (
                <div key={s} className="absolute top-0 h-full border-l border-border" style={{ left: s * pps }}>
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">{tickLabel(s, tickStep)}</span>
                </div>
              ))}
            </div>
          </div>

          {project.videoTracks.map((track, trackIndex) => (
            <Row
              key={track.id}
              label={track.overlay ? "Camera" : trackIndex === 0 ? "Video" : `Video ${trackIndex + 1}`}
            >
              <div className="absolute inset-0" onPointerDown={scrubFrom} />
              {track.clips.map((clip) => {
                const asset = project.assets[clip.assetId];
                const selected = selection?.kind === "clip" && selection.id === clip.id;
                const left = toPx(clip.timelineStart);
                const width = Math.max(4, toPx(clipDuration(clip)));
                return (
                  <Block
                    key={clip.id}
                    left={left}
                    width={width}
                    selected={selected}
                    className="bg-sky-500/25 ring-sky-400/60"
                    label={`Clip ${asset?.name ?? ""}, ${formatTime(clip.timelineStart)} to ${formatTime(clipEnd(clip))}`}
                    testId="timeline-clip"
                    onSelect={() => select({ kind: "clip", id: clip.id })}
                    onBody={(e) => {
                      const key = `move-clip-${++dragSessions}`;
                      const origin = clip.timelineStart;
                      const length = clipDuration(clip);
                      const points = snapPoints(clip.id);
                      beginDrag(e, {
                        onClick: () => select({ kind: "clip", id: clip.id }),
                        onMove: (dx) => {
                          const raw = origin + toTime(dx);
                          const a = snap(raw, points, threshold);
                          const b = snap(raw + length, points, threshold);
                          const start = a.distance <= b.distance ? a.t : b.t - length;
                          select({ kind: "clip", id: clip.id });
                          commit((d) => moveClip(d, clip.id, start), { coalesce: key });
                        },
                      });
                    }}
                    onEdge={(edge, e) => {
                      const key = `trim-clip-${++dragSessions}`;
                      const origin = edge === "start" ? clip.timelineStart : clipEnd(clip);
                      const points = snapPoints(clip.id);
                      beginDrag(e, {
                        onMove: (dx) => {
                          const t = snap(origin + toTime(dx), points, threshold).t;
                          select({ kind: "clip", id: clip.id });
                          commit((d) => trimClipEdge(d, clip.id, edge, t), { coalesce: key });
                          player?.projectChanged();
                        },
                      });
                    }}
                  >
                    <span className="truncate">{asset?.name ?? "Missing video"}</span>
                    {clip.speed !== 1 && <span className="shrink-0 rounded bg-background/60 px-1">{clip.speed}×</span>}
                    {clip.muted && <VolumeXIcon className="size-3 shrink-0" aria-label="Muted" />}
                  </Block>
                );
              })}
            </Row>
          ))}

          <Row
            label="Zoom"
            action={
              <button
                type="button"
                aria-label="Add zoom at playhead"
                aria-keyshortcuts="Z"
                title="Add zoom at playhead (Z)"
                onClick={() => addZoomAt(time)}
                className="rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusIcon className="size-3.5" />
              </button>
            }
          >
            <div
              className="absolute inset-0 cursor-cell"
              title="Drag to add a zoom for that time range"
              data-testid="zoom-row-area"
              onPointerDown={rangeOrScrub}
            />
            {rangeDraft && (
              <div
                className="pointer-events-none absolute top-1 bottom-1 rounded-md border border-dashed border-violet-300 bg-violet-500/20"
                style={{ left: rangeDraft.from, width: rangeDraft.to - rangeDraft.from }}
              />
            )}
            {sortedZooms.slice(1).map((zoom, i) => {
              const prev = sortedZooms[i]!;
              if (zoom.start - prev.end >= ZOOM_MERGE_GAP) return null;
              return (
                <span
                  key={`chain-${zoom.id}`}
                  className="pointer-events-none absolute top-1/2 z-10 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-violet-400 text-background"
                  style={{ left: toPx(prev.end + (zoom.start - prev.end) / 2) }}
                  title="The camera pans between these zooms"
                  data-testid="zoom-chain"
                >
                  <Link2Icon className="size-2.5" aria-label="Pans to the next zoom" />
                </span>
              );
            })}
            {project.zooms.map((zoom) => {
              const selected = selection?.kind === "zoom" && selection.id === zoom.id;
              return (
                <Block
                  key={zoom.id}
                  left={toPx(zoom.start)}
                  width={Math.max(4, toPx(zoom.end - zoom.start))}
                  selected={selected}
                  className="bg-violet-500/25 ring-violet-400/60"
                  label={`Zoom ${zoom.scale}×, ${formatTime(zoom.start)} to ${formatTime(zoom.end)}`}
                  testId="timeline-zoom"
                  onSelect={() => select({ kind: "zoom", id: zoom.id })}
                  onBody={(e) => {
                    const key = `move-zoom-${++dragSessions}`;
                    const origin = zoom.start;
                    const length = zoom.end - zoom.start;
                    const points = snapPoints(zoom.id);
                    beginDrag(e, {
                      onClick: () => select({ kind: "zoom", id: zoom.id }),
                      onMove: (dx) => {
                        const raw = origin + toTime(dx);
                        const a = snap(raw, points, threshold);
                        const b = snap(raw + length, points, threshold);
                        const start = a.distance <= b.distance ? a.t : b.t - length;
                        select({ kind: "zoom", id: zoom.id });
                        commit((d) => moveZoom(d, zoom.id, start), { coalesce: key });
                      },
                    });
                  }}
                  onEdge={(edge, e) => {
                    const key = `trim-zoom-${++dragSessions}`;
                    const origin = edge === "start" ? zoom.start : zoom.end;
                    const points = snapPoints(zoom.id);
                    beginDrag(e, {
                      onMove: (dx) => {
                        const t = Math.min(snap(origin + toTime(dx), points, threshold).t, duration);
                        select({ kind: "zoom", id: zoom.id });
                        commit((d) => updateZoom(d, zoom.id, edge === "start" ? { start: t } : { end: t }), {
                          coalesce: key,
                        });
                      },
                    });
                  }}
                >
                  <span className="truncate">{zoom.scale}×</span>
                </Block>
              );
            })}
          </Row>

          <Row label="Effects">
            <div className="absolute inset-0" onPointerDown={scrubFrom} />
            {project.effects.map((effect) => (
              <Block
                key={effect.id}
                left={toPx(effect.start)}
                width={Math.max(4, toPx(effect.end - effect.start))}
                selected={selection?.kind === "effect" && selection.id === effect.id}
                className={
                  effect.type === "spotlight"
                    ? "bg-yellow-500/25 ring-yellow-400/60"
                    : "bg-slate-400/25 ring-slate-300/60"
                }
                label={`${effect.type === "spotlight" ? "Spotlight" : "Blur"}, ${formatTime(effect.start)} to ${formatTime(effect.end)}`}
                testId="timeline-effect"
                onSelect={() => select({ kind: "effect", id: effect.id })}
                onBody={(e) => {
                  const key = `move-effect-${++dragSessions}`;
                  const origin = effect.start;
                  const length = effect.end - effect.start;
                  const points = snapPoints(effect.id);
                  beginDrag(e, {
                    onClick: () => select({ kind: "effect", id: effect.id }),
                    onMove: (dx) => {
                      const raw = origin + toTime(dx);
                      const a = snap(raw, points, threshold);
                      const b = snap(raw + length, points, threshold);
                      select({ kind: "effect", id: effect.id });
                      commit((d) => moveEffect(d, effect.id, a.distance <= b.distance ? a.t : b.t - length), {
                        coalesce: key,
                      });
                    },
                  });
                }}
                onEdge={(edge, e) => {
                  const key = `trim-effect-${++dragSessions}`;
                  const origin = edge === "start" ? effect.start : effect.end;
                  const points = snapPoints(effect.id);
                  beginDrag(e, {
                    onMove: (dx) => {
                      const t = snap(origin + toTime(dx), points, threshold).t;
                      select({ kind: "effect", id: effect.id });
                      commit((d) => updateEffect(d, effect.id, edge === "start" ? { start: t } : { end: t }), {
                        coalesce: key,
                      });
                    },
                  });
                }}
              >
                <span className="truncate">{effect.type === "spotlight" ? "Spotlight" : "Blur"}</span>
              </Block>
            ))}
          </Row>

          {textTracks.map((track, index) => (
            <Row
              key={track.id}
              label={index === 0 ? "Text" : ""}
              action={
                index === 0 ? (
                  <button
                    type="button"
                    aria-label="Add text at playhead"
                    aria-keyshortcuts="T"
                    title="Add text at playhead (T)"
                    onClick={() => addTextAt(time)}
                    className="rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                ) : undefined
              }
            >
              <div
                className="absolute inset-0"
                onPointerDown={scrubFrom}
                onDoubleClick={(e) => addTextAt(toTime(e.clientX - e.currentTarget.getBoundingClientRect().left))}
              />
              {track.layers.map((layer) => (
                <Block
                  key={layer.id}
                  left={toPx(layer.start)}
                  width={Math.max(4, toPx(layer.end - layer.start))}
                  selected={selection?.kind === "text" && selection.id === layer.id}
                  className="bg-amber-500/25 ring-amber-400/60"
                  label={`Text ${layer.text.slice(0, 40)}, ${formatTime(layer.start)} to ${formatTime(layer.end)}`}
                  testId="timeline-text"
                  onSelect={() => select({ kind: "text", id: layer.id })}
                  onBody={(e) => {
                    const key = `move-text-${++dragSessions}`;
                    const origin = layer.start;
                    const length = layer.end - layer.start;
                    const points = snapPoints(layer.id);
                    beginDrag(e, {
                      onClick: () => select({ kind: "text", id: layer.id }),
                      onMove: (dx) => {
                        const raw = origin + toTime(dx);
                        const a = snap(raw, points, threshold);
                        const b = snap(raw + length, points, threshold);
                        const start = a.distance <= b.distance ? a.t : b.t - length;
                        select({ kind: "text", id: layer.id });
                        commit((d) => moveText(d, layer.id, start), { coalesce: key });
                      },
                    });
                  }}
                  onEdge={(edge, e) => {
                    const key = `trim-text-${++dragSessions}`;
                    const origin = edge === "start" ? layer.start : layer.end;
                    const points = snapPoints(layer.id);
                    beginDrag(e, {
                      onMove: (dx) => {
                        const t = snap(origin + toTime(dx), points, threshold).t;
                        select({ kind: "text", id: layer.id });
                        commit((d) => updateText(d, layer.id, edge === "start" ? { start: t } : { end: t }), {
                          coalesce: key,
                        });
                      },
                    });
                  }}
                >
                  <span className="truncate">{layer.text || "Empty text"}</span>
                </Block>
              ))}
            </Row>
          ))}

          <Row label="Taps">
            <div className="absolute inset-0" onPointerDown={scrubFrom} />
            {project.gestures.map((gesture) => (
              <Block
                key={gesture.id}
                left={toPx(gesture.time)}
                width={Math.max(12, toPx(GESTURE_DURATION))}
                selected={selection?.kind === "gesture" && selection.id === gesture.id}
                className="bg-emerald-500/25 ring-emerald-400/60"
                label={`${gesture.type === "tap" ? "Tap" : "Swipe"} at ${formatTime(gesture.time)}`}
                testId="timeline-gesture"
                resizable={false}
                onSelect={() => select({ kind: "gesture", id: gesture.id })}
                onBody={(e) => {
                  const key = `move-gesture-${++dragSessions}`;
                  const origin = gesture.time;
                  const points = snapPoints(gesture.id);
                  beginDrag(e, {
                    onClick: () => select({ kind: "gesture", id: gesture.id }),
                    onMove: (dx) => {
                      const t = snap(origin + toTime(dx), points, threshold).t;
                      select({ kind: "gesture", id: gesture.id });
                      commit((d) => updateGesture(d, gesture.id, { time: t }), { coalesce: key });
                    },
                  });
                }}
                onEdge={() => {}}
              >
                <span className="sr-only">{gesture.type}</span>
              </Block>
            ))}
          </Row>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-500"
            style={{ left: LABEL_WIDTH + toPx(time) }}
            data-testid="timeline-playhead"
          >
            <div className="absolute -top-0 -left-1 size-2 rotate-45 bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-10 border-b border-border/60">
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center justify-between gap-1 border-r bg-background px-3 text-xs text-muted-foreground"
        style={{ width: LABEL_WIDTH }}
      >
        {label}
        {action}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

function Block(props: {
  left: number;
  width: number;
  selected: boolean;
  className: string;
  label: string;
  testId: string;
  onSelect: () => void;
  onBody: (e: ReactPointerEvent) => void;
  onEdge: (edge: "start" | "end", e: ReactPointerEvent) => void;
  resizable?: boolean;
  children: ReactNode;
}) {
  const resizable = props.resizable ?? true;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={props.label}
      aria-pressed={props.selected}
      data-testid={props.testId}
      onPointerDown={props.onBody}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onSelect();
      }}
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab items-center gap-1 overflow-hidden rounded-md px-2 text-[11px] font-medium ring-1 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        props.className,
        props.selected && "ring-2 ring-foreground",
      )}
      style={{ left: props.left, width: props.width }}
    >
      {resizable && (
        <div
          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-foreground/40"
          data-edge="start"
          onPointerDown={(e) => props.onEdge("start", e)}
        />
      )}
      {props.children}
      {resizable && (
        <div
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-foreground/40"
          data-edge="end"
          onPointerDown={(e) => props.onEdge("end", e)}
        />
      )}
    </div>
  );
}

function TimelineButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-6 min-w-6 rounded px-1.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
