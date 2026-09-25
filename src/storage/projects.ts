import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project } from "@/schema/project";
import { StorageError } from "./errors";
import { migrateProject } from "./migrations";
import { deleteAssetFile } from "./opfs";

interface StudioDB extends DBSchema {
  projects: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

function db(): Promise<IDBPDatabase<StudioDB>> {
  dbPromise ??= openDB<StudioDB>("studio", 1, {
    upgrade(database) {
      database.createObjectStore("projects", { keyPath: "id" });
    },
  });
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  try {
    await (await db()).put("projects", project);
  } catch (error) {
    throw new StorageError("Couldn't save the project to browser storage.", { cause: error });
  }
}

/** Loads and migrates a project, or returns null if it doesn't exist. */
export async function loadProject(id: string): Promise<Project | null> {
  const raw = await (await db()).get("projects", id);
  return raw === undefined ? null : migrateProject(raw);
}

/** Every stored project that can still be opened, most recently edited first. */
export async function listProjects(): Promise<Project[]> {
  const rows = await (await db()).getAll("projects");
  const projects: Project[] = [];
  for (const row of rows) {
    try {
      projects.push(migrateProject(row));
    } catch (error) {
      console.warn("Skipping unreadable project", error);
    }
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Deletes a project and the media files it stored. */
export async function deleteProject(project: Project): Promise<void> {
  for (const asset of Object.values(project.assets)) {
    if (asset.storage.type === "opfs") await deleteAssetFile(asset.storage.path);
  }
  await (await db()).delete("projects", project.id);
}
