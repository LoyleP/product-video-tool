import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, type WrappedAudioBuffer } from "mediabunny";
import { microsToSeconds, type Micros } from "../time";

/** Decodes the primary audio track of a media file into Web Audio `AudioBuffer`s. Main thread only. */
export class AudioTrackReader {
  private constructor(
    private readonly input: Input,
    private readonly sink: AudioBufferSink,
  ) {}

  /** Returns null when the file has no audio track the browser can decode. */
  static async open(blob: Blob): Promise<AudioTrackReader | null> {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) {
        input.dispose();
        return null;
      }
      return new AudioTrackReader(input, new AudioBufferSink(track));
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  /** Buffers covering [start, end) in source time. */
  buffers(start: Micros, end: Micros): AsyncGenerator<WrappedAudioBuffer, void, unknown> {
    return this.sink.buffers(microsToSeconds(start), microsToSeconds(end));
  }

  dispose(): void {
    this.input.dispose();
  }
}
