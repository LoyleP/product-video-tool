import { MediaProbeError, probeVideo } from "@/engine/decode/probe";
import { createProjectFromVideo } from "@/schema/defaults";
import type { MediaAsset, Project } from "@/schema/project";
import { rememberAssetFile } from "@/storage/asset-files";
import { StorageError } from "@/storage/errors";
import { deleteAssetFile, ensureSpaceFor, writeAssetFile } from "@/storage/opfs";
import { saveProject } from "@/storage/projects";

export const ACCEPTED_EXTENSIONS = ["mp4", "m4v", "mov", "webm"] as const;
export const ACCEPT_ATTRIBUTE = ".mp4,.m4v,.mov,.webm,video/mp4,video/quicktime,video/webm";

/** An import failure whose message can be shown to the user as is. */
export class ImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImportError";
  }
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1]!.toLowerCase() : "";
}

/** Stores a video file in OPFS and reads its metadata. */
export async function importAsset(file: File): Promise<{ asset: MediaAsset; averageFps: number }> {
  const extension = extensionOf(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ImportError("That file type isn't supported. Drop an MP4, MOV or WebM video.");
  }
  if (typeof VideoDecoder === "undefined") {
    throw new ImportError("This browser can't decode video (WebCodecs is missing). Use a recent Chrome, Edge or Safari.");
  }

  const assetId = crypto.randomUUID();
  let path: string | null = null;
  try {
    await ensureSpaceFor(file.size);
    const [probe, storedPath] = await Promise.all([probeVideo(file), writeAssetFile(assetId, file, extension)]);
    path = storedPath;
    rememberAssetFile(assetId, file);
    return {
      asset: {
        id: assetId,
        kind: "video",
        name: file.name,
        storage: { type: "opfs", path },
        width: probe.width,
        height: probe.height,
        duration: probe.duration,
        hasAudio: probe.hasAudio,
        codec: probe.codec,
        isVariableFrameRate: probe.isVariableFrameRate,
      },
      averageFps: probe.averageFps,
    };
  } catch (error) {
    await deleteAssetFile(path ?? `assets/${assetId}.${extension}`).catch(() => {});
    if (error instanceof MediaProbeError || error instanceof StorageError) {
      throw new ImportError(error.message, { cause: error });
    }
    throw new ImportError("Something went wrong while importing this video. Try again, or re-export it as H.264 MP4.", {
      cause: error,
    });
  }
}

/** Stores the file, reads its metadata and creates a project around it. */
export async function importVideo(file: File): Promise<Project> {
  const { asset, averageFps } = await importAsset(file);
  const project = createProjectFromVideo({
    id: crypto.randomUUID(),
    now: new Date().toISOString(),
    asset,
    sourceFps: averageFps,
    newId: () => crypto.randomUUID(),
  });
  try {
    await saveProject(project);
  } catch (error) {
    await deleteAssetFile(asset.storage.type === "opfs" ? asset.storage.path : "").catch(() => {});
    throw new ImportError(error instanceof StorageError ? error.message : "Couldn't save the new project.", {
      cause: error,
    });
  }
  return project;
}
