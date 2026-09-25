import { AudioTrackReader } from "@/engine/audio/audio-track-reader";
import { placeBuffer } from "@/engine/audio/schedule";
import { microsToSeconds, secondsToMicros, type Micros } from "@/engine/time";
import { clipEnd } from "@/engine/timeline";
import type { Project } from "@/schema/project";

/** Keep this much audio scheduled ahead of the playhead. */
const SCHEDULE_AHEAD_S = 1.5;

/**
 * Streams the project's audio into an AudioContext from a timeline time. The context clock then drives
 * video playback, which keeps picture and sound in sync.
 */
export class AudioPlayback {
  private readonly readers = new Map<string, Promise<AudioTrackReader | null>>();
  private readonly nodes = new Set<AudioBufferSourceNode>();
  private generation = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly getFile: (assetId: string) => Promise<Blob>,
  ) {}

  private reader(assetId: string): Promise<AudioTrackReader | null> {
    let reader = this.readers.get(assetId);
    if (!reader) {
      reader = this.getFile(assetId).then((file) => AudioTrackReader.open(file));
      this.readers.set(assetId, reader);
    }
    return reader;
  }

  /** Starts audio for timeline time `from`, with `from` heard at context time `ctxStart`. */
  start(project: Project, from: Micros, ctxStart: number): void {
    this.stop();
    const generation = this.generation;
    for (const track of project.videoTracks) {
      for (const clip of track.clips) {
        if (clip.muted || !project.assets[clip.assetId]?.hasAudio || clipEnd(clip) <= from) continue;
        void this.scheduleClip(project, clip.id, from, ctxStart, generation).catch((e: unknown) =>
          console.warn("Audio playback failed", e),
        );
      }
    }
  }

  private async scheduleClip(project: Project, clipId: string, from: Micros, ctxStart: number, generation: number) {
    const clip = project.videoTracks.flatMap((t) => t.clips).find((c) => c.id === clipId)!;
    const reader = await this.reader(clip.assetId);
    if (!reader || generation !== this.generation) return;

    const window = { start: from, end: Number.MAX_SAFE_INTEGER };
    const sourceFrom = Math.max(clip.sourceIn, clip.sourceIn + (from - clip.timelineStart) * clip.speed);
    const buffers = reader.buffers(Math.floor(sourceFrom), clip.sourceOut);
    try {
      for await (const wrapped of buffers) {
        if (generation !== this.generation) return;
        const placed = placeBuffer(
          clip,
          { start: secondsToMicros(wrapped.timestamp), duration: secondsToMicros(wrapped.duration) },
          window,
        );
        if (!placed) continue;
        const when = ctxStart + microsToSeconds(placed.at - from);
        const node = this.ctx.createBufferSource();
        node.buffer = wrapped.buffer;
        node.playbackRate.value = clip.speed;
        node.connect(this.ctx.destination);
        node.onended = () => this.nodes.delete(node);
        node.start(Math.max(when, this.ctx.currentTime), microsToSeconds(placed.offset), microsToSeconds(placed.sourceDuration));
        this.nodes.add(node);
        // Throttle decoding so only a short window is scheduled ahead.
        while (when - this.ctx.currentTime > SCHEDULE_AHEAD_S && generation === this.generation) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    } finally {
      await buffers.return(undefined);
    }
  }

  stop(): void {
    this.generation++;
    for (const node of this.nodes) {
      node.onended = null;
      node.stop();
      node.disconnect();
    }
    this.nodes.clear();
  }

  dispose(): void {
    this.stop();
    for (const reader of this.readers.values()) void reader.then((r) => r?.dispose()).catch(() => {});
    this.readers.clear();
  }
}
