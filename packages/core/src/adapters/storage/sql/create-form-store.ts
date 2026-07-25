import type { FormState } from "../../../middleware/form/types";
import type { SqlDialect } from "../../../translation/sql-compiler";
import type {
	PersistedFormStateDetails,
	PersistentFormStore,
	SessionFormStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { formDdlKeys, formEntityConfigs } from "./form-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createFormStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionFormStore & PersistentFormStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	if (!backend) await initSchema(be, formDdlKeys);
	const store = new GenericSqlEntityStore<FormState, PersistedFormStateDetails>(
		be,
		formEntityConfigs[dialect],
	);
	return new SqlRepoStore(store);
}

export async function createSessionFormStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionFormStore> {
	return createFormStore(dialect, target, backend);
}

export async function createPersistentFormStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<PersistentFormStore> {
	return createFormStore(dialect, target, backend);
}
