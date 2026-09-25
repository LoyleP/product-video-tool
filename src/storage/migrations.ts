import { CURRENT_SCHEMA_VERSION, projectSchema, type Project } from "@/schema/project";

/** One entry per schema bump: migrations[n] upgrades a version-n project to version n + 1. */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export class ProjectMigrationError extends Error {}

/** Upgrades a persisted project to the current schema and validates it. */
export function migrateProject(raw: unknown): Project {
  if (typeof raw !== "object" || raw === null) throw new ProjectMigrationError("Project data is not an object.");
  let data = raw as Record<string, unknown>;
  let version = data.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new ProjectMigrationError("Project has no valid schemaVersion.");
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new ProjectMigrationError("This project was saved by a newer version of the app. Reload the page.");
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new ProjectMigrationError(`No migration from schema version ${version}.`);
    data = migrate(data);
    version += 1;
  }
  const result = projectSchema.safeParse(data);
  if (!result.success) throw new ProjectMigrationError(`Project data is invalid: ${result.error.message}`);
  return result.data;
}
