import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project } from "@/schema/project";
import { StorageError } from "./errors";
import { migrateProject } from "./migrations";

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
