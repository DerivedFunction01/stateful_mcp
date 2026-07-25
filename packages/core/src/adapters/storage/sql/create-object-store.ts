import type { SqlDialect } from "../../../translation/sql-compiler";
import type { ObjectState } from "../../../middleware/object/types";
import type { PersistedObjectState } from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { objectEntityConfigs, objectDdlKeys } from "./object-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createObjectStore(
  dialect: SqlDialect,
  target: string,
) {
  const backend = await SqlBackend.connect(dialect, target);
  await initSchema(backend, objectDdlKeys);
  const store = new GenericSqlEntityStore<ObjectState, PersistedObjectState>(
    backend,
    objectEntityConfigs[dialect],
  );
  return new SqlRepoStore(store);
}