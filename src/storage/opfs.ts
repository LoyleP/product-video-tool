import { StorageError } from "./errors";

const ASSETS_DIR = "assets";

async function assetsDirectory(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    throw new StorageError("This browser doesn't support local file storage (OPFS). Use a recent Chrome, Edge or Safari.");
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ASSETS_DIR, { create: true });
}

function fileName(path: string): string {
  const name = path.startsWith(`${ASSETS_DIR}/`) ? path.slice(ASSETS_DIR.length + 1) : "";
  if (!name || name.includes("/")) throw new StorageError(`Invalid asset path: ${path}`);
  return name;
}

/** Throws a readable error when the origin's storage quota can't fit `bytes` more (BUILD.md 13.5). */
export async function ensureSpaceFor(bytes: number): Promise<void> {
  if (!navigator.storage?.estimate) return;
  const { quota, usage } = await navigator.storage.estimate();
  if (quota === undefined || usage === undefined) return;
  const free = quota - usage;
  if (free < bytes * 1.1) {
    const mb = (n: number) => `${Math.round(n / 1_000_000)} MB`;
    throw new StorageError(
      `Not enough browser storage: this file needs ${mb(bytes)} and only ${mb(Math.max(0, free))} is free. Free up disk space or delete old projects.`,
    );
  }
}

/** Copies a file into OPFS and returns its storage path. */
export async function writeAssetFile(assetId: string, file: Blob, extension: string): Promise<string> {
  const path = `${ASSETS_DIR}/${assetId}.${extension}`;
  const dir = await assetsDirectory();
  const handle = await dir.getFileHandle(fileName(path), { create: true });
  if (!("createWritable" in handle)) {
    throw new StorageError("This browser can't write files to local storage. Use a recent Chrome, Edge or Safari.");
  }
  try {
    const writable = await handle.createWritable();
    await file.stream().pipeTo(writable);
  } catch (error) {
    await dir.removeEntry(fileName(path)).catch(() => {});
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new StorageError("Browser storage is full. Free up disk space or delete old projects.", { cause: error });
    }
    throw new StorageError("Couldn't save the video to browser storage.", { cause: error });
  }
  return path;
}

export async function readAssetFile(path: string): Promise<File> {
  const dir = await assetsDirectory();
  try {
    const handle = await dir.getFileHandle(fileName(path));
    return await handle.getFile();
  } catch (error) {
    throw new StorageError(
      "The video for this project is no longer in browser storage. It may have been cleared; import it again.",
      { cause: error },
    );
  }
}

export async function deleteAssetFile(path: string): Promise<void> {
  const dir = await assetsDirectory();
  await dir.removeEntry(fileName(path)).catch(() => {});
}

/**
 * Opens a new OPFS file for writing as it is produced (live recording). The browser accepts the
 * `{ type: "write", position, data }` chunks that Mediabunny's StreamTarget emits.
 */
export async function createAssetWritable(
  assetId: string,
  extension: string,
): Promise<{ path: string; writable: WritableStream<{ type: "write"; data: Uint8Array; position: number }> }> {
  const path = `${ASSETS_DIR}/${assetId}.${extension}`;
  const dir = await assetsDirectory();
  const handle = await dir.getFileHandle(fileName(path), { create: true });
  if (!("createWritable" in handle)) {
    throw new StorageError("This browser can't write recordings to local storage. Use a recent Chrome or Edge.");
  }
  const writable = await handle.createWritable();
  return { path, writable: writable as unknown as WritableStream<{ type: "write"; data: Uint8Array; position: number }> };
}
