/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { StreamTarget, type StreamTargetChunk } from "mediabunny";
import { encodeProject, type EncodeProgress, type EncodeRequest } from "./encode-project";
import { EXPORTS_DIR } from "./settings";

interface SyncAccessHandle {
  write(data: BufferSource, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}

let canceled = false;

async function exportsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(EXPORTS_DIR, { create: true });
}

/** Removes finished exports from earlier runs so they don't pile up in browser storage. */
async function clearOldExports(dir: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = [];
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
  await Promise.all(names.map((name) => dir.removeEntry(name).catch(() => {})));
}

const api = {
  /** Encodes the project to an MP4 in OPFS and returns its file name in the exports directory. */
  async run(req: EncodeRequest, onProgress: (p: EncodeProgress) => void): Promise<string> {
    canceled = false;
    const dir = await exportsDirectory();
    await clearOldExports(dir);
    const name = `export-${Date.now()}.mp4`;
    const handle = await dir.getFileHandle(name, { create: true });
    const access = (await (
      handle as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
    ).createSyncAccessHandle()) as SyncAccessHandle;
    access.truncate(0);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      access.flush();
      access.close();
    };
    const writable = new WritableStream<StreamTargetChunk>({
      write(chunk) {
        access.write(chunk.data, { at: chunk.position });
      },
      close,
      abort: close,
    });

    let lastReport = 0;
    try {
      await encodeProject(
        req,
        new StreamTarget(writable, { chunked: true }),
        (p) => {
          const now = performance.now();
          if (now - lastReport > 100 || p.frame === p.totalFrames) {
            lastReport = now;
            onProgress(p);
          }
        },
        () => canceled,
      );
      close();
      return name;
    } catch (error) {
      close();
      await dir.removeEntry(name).catch(() => {});
      if (error instanceof Error && error.name === "AbortError") throw new DOMException("Export canceled.", "AbortError");
      throw error;
    }
  },

  cancel(): void {
    canceled = true;
  },
};

export type ExportWorkerApi = typeof api;

Comlink.expose(api);
