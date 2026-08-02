import type { SqlDialect } from "../../../translation/sql-compiler";
import type {
	PersistentVariableStore,
	SessionVariableStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";
import {
	variableDdlKeys,
	variableEntityConfigs,
} from "./variable-entity-config";

export async function createVariableStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionVariableStore & PersistentVariableStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	await initSchema(be, variableDdlKeys);
	const store = new GenericSqlEntityStore(be, variableEntityConfigs[dialect]);
	return new SqlRepoStore(store) as unknown as SessionVariableStore &
		PersistentVariableStore;
}

export async function createSessionVariableStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionVariableStore> {
	return createVariableStore(dialect, target, backend);
}

export async function createPersistentVariableStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<PersistentVariableStore> {
	return createVariableStore(dialect, target, backend);
}
