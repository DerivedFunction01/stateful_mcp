import type { SqlDialect } from "../../../translation/sql-compiler";
import type { FilterState } from "../../../middleware/filter/types";
import type {
  PersistedFilterState,
  SessionFilterStore,
  PersistentFilterStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { filterEntityConfigs, filterDdlKeys } from "./filter-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createFilterStore(
  dialect: SqlDialect,
  target: string,
): Promise<SessionFilterStore & PersistentFilterStore> {
  const backend = await SqlBackend.connect(dialect, target);
  await initSchema(backend, filterDdlKeys);
  const store = new GenericSqlEntityStore<FilterState, PersistedFilterState>(
    backend,
    filterEntityConfigs[dialect],
  );
  return new SqlRepoStore(store);
}