"use client";

import { useEffect, useState } from "react";
import { probeCodecSupport, type Capabilities, type CodecSupport } from "@/lib/capabilities";
import { cn } from "@/lib/utils";

const CAPABILITY_LABELS: Record<keyof Capabilities, string> = {
  videoDecoder: "VideoDecoder",
  videoEncoder: "VideoEncoder",
  audioDecoder: "AudioDecoder",
  audioEncoder: "AudioEncoder",
  offscreenCanvas: "OffscreenCanvas",
  workers: "Web Workers",
  getDisplayMedia: "getDisplayMedia",
  getUserMedia: "getUserMedia",
  webgpu: "WebGPU API",
  opfs: "OPFS",
  indexedDB: "IndexedDB",
  storageEstimate: "storage.estimate",
  clipboardItem: "ClipboardItem",
  finePointer: "Fine pointer",
};

const CODEC_LABELS: Record<keyof CodecSupport, string> = {
  h264_1080p: "H.264 1080p60",
  h264_1440p: "H.264 1440p60",
  h264_2160p: "H.264 4K60",
  vp9_1080p: "VP9 1080p60",
  aac: "AAC",
  opus: "Opus",
  webgpuAdapter: "WebGPU adapter",
};

export function CapabilitiesPanel({ caps }: { caps: Capabilities }) {
  const [codecs, setCodecs] = useState<CodecSupport | null>(null);

  useEffect(() => {
    let cancelled = false;
    probeCodecSupport().then((result) => {
      if (cancelled) return;
      setCodecs(result);
      console.info("[capabilities]", { ...caps, codecs: result });
    });
    return () => {
      cancelled = true;
    };
  }, [caps]);

  return (
    <details open className="group" data-testid="capabilities-panel">
      <summary className="cursor-pointer text-xs font-medium tracking-wide text-muted-foreground uppercase outline-none focus-visible:underline">
        Debug: capabilities
      </summary>
      <CapabilityList title="APIs" labels={CAPABILITY_LABELS} values={caps} />
      <CapabilityList title="Encoders" labels={CODEC_LABELS} values={codecs} />
    </details>
  );
}

function CapabilityList<K extends string>({
  title,
  labels,
  values,
}: {
  title: string;
  labels: Record<K, string>;
  values: Record<K, boolean> | null;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
        {(Object.keys(labels) as K[]).map((key) => {
          const value = values?.[key];
          return (
            <div key={key} className="contents" data-capability={key}>
              <dt className="text-muted-foreground">{labels[key]}</dt>
              <dd
                className={cn(
                  value === undefined ? "text-muted-foreground" : value ? "text-emerald-400" : "text-red-400",
                )}
              >
                {value === undefined ? "…" : value ? "yes" : "no"}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
