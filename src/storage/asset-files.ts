import type { MediaAsset } from "@/schema/project";
import { StorageError } from "./errors";
import { readAssetFile } from "./opfs";

/** Files imported in this tab, so opening the editor right after import doesn't re-read OPFS. */
const inMemory = new Map<string, Blob>();

export function rememberAssetFile(assetId: string, file: Blob): void {
  inMemory.set(assetId, file);
}

export async function getAssetFile(asset: MediaAsset): Promise<Blob> {
  const cached = inMemory.get(asset.id);
  if (cached) return cached;
  if (asset.storage.type !== "opfs") throw new StorageError("Cloud assets aren't supported yet.");
  const file = await readAssetFile(asset.storage.path);
  inMemory.set(asset.id, file);
  return file;
}
