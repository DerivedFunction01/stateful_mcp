import type { SqlDialect } from "../../../translation/sql-compiler";
import type { FormState } from "../../../middleware/form/types";
import type { PersistedFormStateDetails } from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { formEntityConfig, formDdlKeys } from "./form-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createFormStore(
  dialect: SqlDialect,
  target: string,
) {
  const backend = await SqlBackend.connect(dialect, target);
  await initSchema(backend, formDdlKeys);
  const store = new GenericSqlEntityStore<FormState, PersistedFormStateDetails>(
    backend,
    formEntityConfig,
  );
  return new SqlRepoStore(store);
}