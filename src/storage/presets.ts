import type { StylePreset } from "@/schema/presets";
import { db } from "./db";
import { StorageError } from "./errors";

/** Custom presets saved in this browser (BUILD.md section 8: "users can save their own locally"). */
export async function listCustomPresets(): Promise<StylePreset[]> {
  const rows = (await (await db()).getAll("presets")) as StylePreset[];
  return rows.filter((p) => typeof p?.id === "string" && typeof p.name === "string" && p.style);
}

export async function saveCustomPreset(preset: StylePreset): Promise<void> {
  try {
    await (await db()).put("presets", preset);
  } catch (error) {
    throw new StorageError("Couldn't save the preset to browser storage.", { cause: error });
  }
}

export async function deleteCustomPreset(id: string): Promise<void> {
  await (await db()).delete("presets", id);
}
