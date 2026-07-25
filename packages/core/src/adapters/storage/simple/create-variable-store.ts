import type {
	PersistentVariableStore,
	SessionVariableStore,
} from "../interfaces";
import { GenericSimpleEntityStore } from "./entity-store";
import type { KvBackend } from "./kv-backend";
import { SimpleRepoStore } from "./simple-repo-store";
import {
	type PersistedVariableRecord,
	type VariableRecord,
	variableSimpleEntityConfig,
} from "./variable-entity-config";

export async function createVariableStore(
	backend: KvBackend,
): Promise<SessionVariableStore & PersistentVariableStore> {
	await backend.load();
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<VariableRecord, PersistedVariableRecord>(
			backend,
			variableSimpleEntityConfig,
		),
	) as unknown as SessionVariableStore & PersistentVariableStore;
}
