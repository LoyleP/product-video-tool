import * as Comlink from "comlink";
import type { EncodeProgress, EncodeRequest } from "./encode-project";
import type { ExportWorkerApi } from "./export.worker";
import { EXPORTS_DIR } from "./settings";

/** Runs an export in a dedicated worker. Resolves with the finished file from OPFS. */
export async function exportInWorker(
  req: EncodeRequest,
  onProgress: (p: EncodeProgress) => void,
  signal: AbortSignal,
): Promise<File> {
  const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<ExportWorkerApi>(worker);
  const cancel = () => void api.cancel();
  signal.addEventListener("abort", cancel);
  try {
    const transfers = req.audio ? req.audio.channels.map((c) => c.buffer as ArrayBuffer) : [];
    const name = await api.run(Comlink.transfer(req, transfers), Comlink.proxy(onProgress));
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(EXPORTS_DIR);
    return await (await dir.getFileHandle(name)).getFile();
  } finally {
    signal.removeEventListener("abort", cancel);
    api[Comlink.releaseProxy]();
    worker.terminate();
  }
}
