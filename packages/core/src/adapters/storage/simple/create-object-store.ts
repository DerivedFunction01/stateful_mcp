import type { ObjectState } from "../../../middleware/object/types";
import type {
	PersistedObjectState,
	PersistentObjectStore,
	SessionObjectStore,
} from "../interfaces";
import { GenericSimpleEntityStore } from "./entity-store";
import type { KvBackend } from "./kv-backend";
import { objectSimpleEntityConfig } from "./object-entity-config";
import { SimpleRepoStore } from "./simple-repo-store";

export async function createObjectStore(
	backend: KvBackend,
): Promise<SessionObjectStore & PersistentObjectStore> {
	await backend.load();
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<ObjectState, PersistedObjectState>(
			backend,
			objectSimpleEntityConfig,
		),
	);
}
