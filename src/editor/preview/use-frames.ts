"use client";

import { useEffect, useRef, useState } from "react";
import { MediaFrameProvider } from "@/engine/decode/media-frame-provider";
import type { Micros } from "@/engine/time";
import { clipAt, sourceTimeAt } from "@/engine/timeline";
import type { Project } from "@/schema/project";
import { getAssetFile } from "@/storage/asset-files";
import { StorageError } from "@/storage/errors";

interface FramesState {
  /** Ready provider for the current set of assets, or null while opening. */
  provider: MediaFrameProvider | null;
  /** Increments whenever a new frame lands in the cache, so the preview redraws. */
  version: number;
  error: string | null;
}

/** Opens a frame provider for the project's video assets and decodes the frames needed at `time`. */
export function useFrames(project: Project, time: Micros): FramesState {
  const [opened, setOpened] = useState<{ key: string; provider: MediaFrameProvider } | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const assetsKey = Object.keys(project.assets).sort().join(",");

  useEffect(() => {
    const provider = new MediaFrameProvider();
    let cancelled = false;
    (async () => {
      for (const asset of Object.values(projectRef.current.assets)) {
        if (asset.kind !== "video") continue;
        await provider.open(asset.id, await getAssetFile(asset));
      }
      if (!cancelled) setOpened({ key: assetsKey, provider });
    })().catch((e: unknown) => {
      console.error(e);
      if (cancelled) return;
      setError(
        e instanceof StorageError ? e.message : "Couldn't open the video for decoding. Try re-exporting it as H.264 MP4.",
      );
    });
    return () => {
      cancelled = true;
      provider.dispose();
    };
  }, [assetsKey]);

  const provider = opened?.key === assetsKey ? opened.provider : null;
  const tracks = project.videoTracks;

  useEffect(() => {
    if (!provider) return;
    for (const track of tracks) {
      if (track.hidden) continue;
      const clip = clipAt(track, time);
      if (!clip) continue;
      const sourceTime = sourceTimeAt(clip, time);
      if (provider.getFrame(clip.assetId, sourceTime)) continue;
      provider
        .request(clip.assetId, sourceTime)
        .then(() => setVersion((v) => v + 1))
        .catch((e: unknown) => {
          console.error(e);
          setError("Couldn't decode this video. Try re-exporting it as H.264 MP4.");
        });
    }
  }, [provider, tracks, time]);

  return { provider, version, error };
}
