import type { ObjectState } from "../../../middleware/object/types";
import type { SqlDialect } from "../../../translation/sql-compiler";
import type {
	PersistedObjectState,
	PersistentObjectStore,
	SessionObjectStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { initSchema } from "./init-schema";
import { objectDdlKeys, objectEntityConfigs } from "./object-entity-config";
import { SqlRepoStore } from "./sql-repo-store";

export async function createObjectStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionObjectStore & PersistentObjectStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	if (!backend) await initSchema(be, objectDdlKeys);
	const store = new GenericSqlEntityStore<ObjectState, PersistedObjectState>(
		be,
		objectEntityConfigs[dialect],
	);
	return new SqlRepoStore(store);
}

export async function createSessionObjectStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionObjectStore> {
	return createObjectStore(dialect, target, backend);
}

export async function createPersistentObjectStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<PersistentObjectStore> {
	return createObjectStore(dialect, target, backend);
}
