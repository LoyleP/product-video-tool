"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MediaFrameProvider } from "@/engine/decode/media-frame-provider";
import type { Project } from "@/schema/project";
import { getAssetFile } from "@/storage/asset-files";
import { StorageError } from "@/storage/errors";
import { Player, type PlayerState } from "./player";

const IDLE: PlayerState = { time: 0, playing: false, frameVersion: 0 };
const noopSubscribe = () => () => {};

/** Opens the project's media and creates a Player for it. */
export function usePlayer(project: Project): {
  player: Player | null;
  frames: MediaFrameProvider | null;
  error: string | null;
} {
  const [ready, setReady] = useState<{ key: string; player: Player; frames: MediaFrameProvider } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const assetsKey = Object.keys(project.assets).sort().join(",");

  useEffect(() => {
    const frames = new MediaFrameProvider();
    let player: Player | null = null;
    let cancelled = false;
    const fileFor = async (assetId: string) => {
      const asset = projectRef.current.assets[assetId];
      if (!asset) throw new StorageError("This project references a missing video.");
      return getAssetFile(asset);
    };
    (async () => {
      for (const asset of Object.values(projectRef.current.assets)) {
        if (asset.kind === "video") await frames.open(asset.id, await fileFor(asset.id));
      }
      if (cancelled) return;
      player = new Player(frames, fileFor, () => projectRef.current);
      player.seek(0);
      setReady({ key: assetsKey, player, frames });
    })().catch((e: unknown) => {
      console.error(e);
      if (cancelled) return;
      setError(
        e instanceof StorageError ? e.message : "Couldn't open the video for decoding. Try re-exporting it as H.264 MP4.",
      );
    });
    return () => {
      cancelled = true;
      player?.dispose();
      frames.dispose();
    };
  }, [assetsKey]);

  const current = ready?.key === assetsKey ? ready : null;
  return { player: current?.player ?? null, frames: current?.frames ?? null, error };
}

/** Subscribes to player time and state. */
export function usePlayerState(player: Player | null): PlayerState {
  return useSyncExternalStore(
    player?.subscribe ?? noopSubscribe,
    player?.getState ?? (() => IDLE),
    () => IDLE,
  );
}
