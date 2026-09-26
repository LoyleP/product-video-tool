"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { chooseRecordingFormat, Recorder, RecordingError, type RecordingOptions } from "@/engine/record/recorder";
import { formatTime } from "@/lib/format-time";
import { StorageError } from "@/storage/errors";
import { createAssetWritable, deleteAssetFile, ensureSpaceFor } from "@/storage/opfs";
import { useProjectStore } from "@/store/project-store";
import { useCapabilities } from "../use-capabilities";
import { projectFromRecording } from "./finish-recording";

type Status =
  | { kind: "idle" }
  | { kind: "setup" }
  | { kind: "starting" }
  | { kind: "recording"; recorder: Recorder; path: string }
  | { kind: "finishing" }
  | { kind: "error"; message: string };

/** Room to reserve before recording: roughly 10 minutes at 1080p. */
const RECORDING_RESERVE_BYTES = 800_000_000;

interface Devices {
  microphones: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  /** False until the user grants access; device labels are hidden before that. */
  labeled: boolean;
}

async function listDevices(): Promise<Devices> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const microphones = all.filter((d) => d.kind === "audioinput" && d.deviceId);
  const cameras = all.filter((d) => d.kind === "videoinput" && d.deviceId);
  return { microphones, cameras, labeled: all.some((d) => d.label) };
}

/** Screen recording straight into a new project (BUILD.md Phase 5). */
export function RecordPanel() {
  const caps = useCapabilities();
  const router = useRouter();
  const setProject = useProjectStore((s) => s.setProject);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const finish = useCallback(
    async (recorder: Recorder, path: string) => {
      setStatus({ kind: "finishing" });
      try {
        const result = await recorder.stop();
        const name = `Recording ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
        const project = await projectFromRecording(path, result, name);
        setProject(project);
        router.push(`/editor/${project.id}`);
      } catch (error) {
        console.error(error);
        await deleteAssetFile(path).catch(() => {});
        setStatus({ kind: "error", message: "The recording couldn't be saved. Try again, or record a shorter clip." });
      }
    },
    [router, setProject],
  );

  if (!caps) return null;
  if (!caps.getDisplayMedia) {
    return (
      <p className="text-sm text-muted-foreground">
        Screen recording isn&apos;t available in this browser. Use Chrome, Edge or Firefox on a computer, or import a file.
      </p>
    );
  }

  const start = async (options: RecordingOptions) => {
    setStatus({ kind: "starting" });
    const format = await chooseRecordingFormat();
    if (!format) {
      setStatus({ kind: "error", message: "This browser can't encode video for recording. Use a recent Chrome or Edge." });
      return;
    }
    let path: string | null = null;
    try {
      await ensureSpaceFor(RECORDING_RESERVE_BYTES);
      const file = await createAssetWritable(crypto.randomUUID(), format.container);
      path = file.path;
      const recorder = await Recorder.start(options, file.writable, format);
      const recordingPath = file.path;
      recorder.onEnded(() => void finish(recorder, recordingPath));
      recorder.onError((error) => {
        void recorder.cancel();
        setStatus({ kind: "error", message: error.message });
      });
      setStatus({ kind: "recording", recorder, path: recordingPath });
    } catch (error) {
      if (path) await deleteAssetFile(path).catch(() => {});
      console.warn(error);
      const message =
        error instanceof RecordingError || error instanceof StorageError ? error.message : "Recording couldn't start.";
      setStatus({ kind: "error", message });
    }
  };

  switch (status.kind) {
    case "idle":
    case "error":
      return (
        <div className="flex flex-col items-center gap-3">
          <Button variant="outline" onClick={() => setStatus({ kind: "setup" })}>
            <CircleIcon className="fill-red-500 text-red-500" />
            Record screen
          </Button>
          {status.kind === "error" && (
            <p role="alert" className="max-w-md text-center text-sm text-red-400">
              {status.message}
            </p>
          )}
        </div>
      );
    case "setup":
    case "starting":
      return (
        <RecordSetup
          busy={status.kind === "starting"}
          onCancel={() => setStatus({ kind: "idle" })}
          onStart={(options) => void start(options)}
        />
      );
    case "recording":
      return <RecordingView recorder={status.recorder} onStop={() => void finish(status.recorder, status.path)} />;
    case "finishing":
      return <p className="text-sm text-muted-foreground">Saving the recording…</p>;
  }
}

function RecordSetup({
  busy,
  onStart,
  onCancel,
}: {
  busy: boolean;
  onStart: (options: RecordingOptions) => void;
  onCancel: () => void;
}) {
  const [devices, setDevices] = useState<Devices | null>(null);
  const [microphoneId, setMicrophoneId] = useState<string>("");
  const [webcamId, setWebcamId] = useState<string>("");
  const [systemAudio, setSystemAudio] = useState(true);
  const [resolution, setResolution] = useState<RecordingOptions["resolution"]>("1080p");
  const [fps, setFps] = useState<RecordingOptions["fps"]>(30);
  const micId = useId();
  const camId = useId();
  const resId = useId();
  const fpsId = useId();
  const sysId = useId();

  const refresh = useCallback(async () => {
    const list = await listDevices();
    setDevices(list);
    setMicrophoneId((current) => current || list.microphones[0]?.deviceId || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    listDevices()
      .then((list) => {
        if (cancelled) return;
        setDevices(list);
        setMicrophoneId((current) => current || list.microphones[0]?.deviceId || "");
      })
      .catch(() => !cancelled && setDevices({ microphones: [], cameras: [], labeled: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  const allowAccess = async () => {
    // Ask separately so a missing camera doesn't block the microphone.
    for (const constraints of [{ audio: true }, { video: true }] as MediaStreamConstraints[]) {
      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => null);
      stream?.getTracks().forEach((t) => t.stop());
    }
    await refresh();
  };

  const select =
    "rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

  return (
    <section aria-label="Recording setup" className="w-full max-w-2xl space-y-5 rounded-2xl border p-6">
      <h2 className="text-base font-semibold">Record your screen</h2>
      {devices && !devices.labeled && (devices.microphones.length > 0 || devices.cameras.length > 0) && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => void allowAccess()}>
            Allow access
          </Button>
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
        <Label htmlFor={micId}>Microphone</Label>
        <select id={micId} className={select} value={microphoneId} disabled={busy} onChange={(e) => setMicrophoneId(e.target.value)}>
          <option value="">No microphone</option>
          {devices?.microphones.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
        <Label htmlFor={camId}>Camera</Label>
        <select id={camId} className={select} value={webcamId} disabled={busy} onChange={(e) => setWebcamId(e.target.value)}>
          <option value="">No camera</option>
          {devices?.cameras.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
        <Label htmlFor={resId}>Quality</Label>
        <select
          id={resId}
          className={select}
          value={resolution}
          disabled={busy}
          onChange={(e) => setResolution(e.target.value as RecordingOptions["resolution"])}
        >
          <option value="1080p">Up to 1080p</option>
          <option value="1440p">Up to 1440p</option>
          <option value="native">Full screen resolution</option>
        </select>
        <Label htmlFor={fpsId}>Frame rate</Label>
        <select
          id={fpsId}
          className={select}
          value={fps}
          disabled={busy}
          onChange={(e) => setFps(Number(e.target.value) as RecordingOptions["fps"])}
        >
          <option value={30}>30 fps</option>
          <option value={60}>60 fps</option>
        </select>
        <Label htmlFor={sysId}>Tab or system audio</Label>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input id={sysId} type="checkbox" checked={systemAudio} disabled={busy} onChange={(e) => setSystemAudio(e.target.checked)} />
          On
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            onStart({
              microphoneId: microphoneId || null,
              webcamId: webcamId || null,
              systemAudio,
              resolution,
              fps,
            })
          }
        >
          {busy ? "Starting…" : "Choose screen and start"}
        </Button>
      </div>
    </section>
  );
}

function RecordingView({ recorder, onStop }: { recorder: Recorder; onStop: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const title = document.title;
    const timer = setInterval(() => {
      const ms = recorder.elapsedMs;
      setElapsed(ms);
      document.title = `● ${formatTime(ms * 1000).split(".")[0]} Recording`;
    }, 250);
    return () => {
      clearInterval(timer);
      document.title = title;
    };
  }, [recorder]);

  useEffect(() => {
    if (videoRef.current && recorder.webcamStream) videoRef.current.srcObject = recorder.webcamStream;
  }, [recorder]);

  return (
    <section aria-label="Recording" className="flex w-full max-w-2xl flex-col items-center gap-5 rounded-2xl border border-red-500/40 p-8">
      <p className="flex items-center gap-2 text-sm font-medium" role="status">
        <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        Recording
        <span className="font-mono tabular-nums" data-testid="recording-time">
          {formatTime(elapsed * 1000)}
        </span>
      </p>
      {recorder.webcamStream && (
        <video ref={videoRef} autoPlay muted playsInline className="size-32 -scale-x-100 rounded-full object-cover" aria-label="Camera preview" />
      )}
      <Button size="lg" variant="destructive" onClick={onStop}>
        <SquareIcon className="fill-current" />
        Stop and edit
      </Button>
    </section>
  );
}
