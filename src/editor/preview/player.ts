import type { MediaFrameProvider } from "@/engine/decode/media-frame-provider";
import { secondsToMicros, type Micros } from "@/engine/time";
import { activeClips, projectDuration } from "@/engine/timeline";
import type { Project } from "@/schema/project";
import { AudioPlayback } from "./audio-playback";

export interface PlayerState {
  time: Micros;
  playing: boolean;
  /** Increments when a frame decoded for a paused time lands in the cache. */
  frameVersion: number;
}

/** Decode this far ahead of the playhead during playback, in timeline time. */
const PLAYBACK_LOOKAHEAD: Micros = 100_000;
/** Small delay before audio starts so the first buffers can be scheduled on time. */
const START_DELAY_S = 0.05;

/**
 * Playback clock and frame fetching for the preview. Time follows the AudioContext clock (minus output
 * latency) so video stays in sync with what is heard, with or without an audio track.
 */
export class Player {
  private state: PlayerState = { time: 0, playing: false, frameVersion: 0 };
  private readonly listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private audio: AudioPlayback | null = null;
  private anchor: { ctxTime: number; time: Micros } | null = null;
  private raf = 0;
  private readonly advancing = new Set<string>();
  private disposed = false;

  constructor(
    private readonly frames: MediaFrameProvider,
    private readonly getFile: (assetId: string) => Promise<Blob>,
    private readonly getProject: () => Project,
  ) {}

  getState = (): PlayerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Last time that shows a frame: clip ends are exclusive. */
  get lastTime(): Micros {
    return Math.max(0, projectDuration(this.getProject()) - 1);
  }

  seek(time: Micros): void {
    const t = Math.min(Math.max(0, Math.round(time)), this.lastTime);
    this.set({ time: t });
    if (this.state.playing) this.startAudioAt(t);
    else this.fetchExact(t);
  }

  async play(): Promise<void> {
    if (this.state.playing || this.disposed || this.lastTime === 0) return;
    const t = this.state.time >= this.lastTime ? 0 : this.state.time;
    this.ctx ??= new AudioContext({ latencyHint: "playback" });
    await this.ctx.resume();
    if (this.disposed) return;
    this.audio ??= new AudioPlayback(this.ctx, this.getFile);
    this.set({ playing: true, time: t });
    this.startAudioAt(t);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.state.playing) return;
    cancelAnimationFrame(this.raf);
    this.audio?.stop();
    this.anchor = null;
    this.set({ playing: false });
    this.fetchExact(this.state.time);
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  /** Call after edits that change timing (trim, speed) so the clock and audio follow the new project. */
  projectChanged(): void {
    if (this.state.time > this.lastTime) this.seek(this.lastTime);
    else if (this.state.playing) this.startAudioAt(this.state.time);
    else this.fetchExact(this.state.time);
  }

  private startAudioAt(t: Micros): void {
    if (!this.ctx || !this.audio) return;
    const ctxStart = this.ctx.currentTime + START_DELAY_S;
    this.anchor = { ctxTime: ctxStart, time: t };
    this.audio.start(this.getProject(), t, ctxStart);
  }

  private tick = (): void => {
    if (!this.state.playing || !this.ctx || !this.anchor) return;
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    const elapsed = Math.max(0, this.ctx.currentTime - latency - this.anchor.ctxTime);
    const t = this.anchor.time + secondsToMicros(elapsed);
    if (t >= this.lastTime) {
      this.set({ time: this.lastTime });
      this.pause();
      return;
    }
    this.set({ time: t });
    this.streamFrames(t);
    this.raf = requestAnimationFrame(this.tick);
  };

  private streamFrames(t: Micros): void {
    for (const { clip, sourceTime } of activeClips(this.getProject(), t)) {
      if (this.advancing.has(clip.assetId)) continue;
      this.advancing.add(clip.assetId);
      this.frames
        .advance(clip.assetId, sourceTime, PLAYBACK_LOOKAHEAD * clip.speed)
        .catch((e: unknown) => console.warn("Frame decode failed", e))
        .finally(() => this.advancing.delete(clip.assetId));
    }
  }

  private fetchExact(t: Micros): void {
    for (const { clip, sourceTime } of activeClips(this.getProject(), t)) {
      if (this.frames.hasExactFrame(clip.assetId, sourceTime)) continue;
      this.frames
        .request(clip.assetId, sourceTime)
        .then(() => !this.disposed && this.set({ frameVersion: this.state.frameVersion + 1 }))
        .catch((e: unknown) => console.warn("Frame decode failed", e));
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.audio?.dispose();
    void this.ctx?.close();
    this.listeners.clear();
  }
}
