import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface StudioDB extends DBSchema {
  projects: { key: string; value: unknown };
  presets: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

/** The app's IndexedDB database. Version 2 adds custom presets. */
export function db(): Promise<IDBPDatabase<StudioDB>> {
  dbPromise ??= openDB<StudioDB>("studio", 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore("projects", { keyPath: "id" });
      if (oldVersion < 2) database.createObjectStore("presets", { keyPath: "id" });
    },
  });
  return dbPromise;
}
