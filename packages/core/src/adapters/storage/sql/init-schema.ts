import { SCHEMA } from "../store-schema";
import { SqlBackend } from "./backend";

export async function initSchema(
  backend: SqlBackend,
  keys: { ddl: string[]; ddlIndexes: string[] },
): Promise<void> {
  const schema = SCHEMA[backend.dialect];
  if (backend.dialect === "sqlite") {
    await backend.exec(schema.pragma);
  }
  for (const key of keys.ddl) {
    await backend.exec(schema.ddl[key]!.sql);
  }
  for (const key of keys.ddlIndexes) {
    await backend.exec(schema.ddlIndexes[key]!.sql);
  }
}