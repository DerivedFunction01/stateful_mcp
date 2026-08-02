import type { FilterState } from "../../../middleware/filter/types";
import type { SqlDialect } from "../../../translation/sql-compiler";
import type {
	PersistedFilterState,
	PersistentFilterStore,
	SessionFilterStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { filterDdlKeys, filterEntityConfigs } from "./filter-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createFilterStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionFilterStore & PersistentFilterStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	await initSchema(be, filterDdlKeys);
	const store = new GenericSqlEntityStore<FilterState, PersistedFilterState>(
		be,
		filterEntityConfigs[dialect],
	);
	return new SqlRepoStore(store);
}

export async function createSessionFilterStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionFilterStore> {
	return createFilterStore(dialect, target, backend);
}

export async function createPersistentFilterStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<PersistentFilterStore> {
	return createFilterStore(dialect, target, backend);
}
