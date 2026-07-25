import type { ObjectState } from "../../../middleware/object/types";
import type {
	PersistedObjectState,
	PersistentObjectStore,
	SessionObjectStore,
} from "../interfaces";
import type { KvBackend } from "./backend";
import { GenericSimpleEntityStore } from "./entity-store";
import { objectSimpleEntityConfig } from "./object-entity-config";
import { SimpleRepoStore } from "./simple-repo-store";

export function createObjectStore(
	backend: KvBackend,
): SessionObjectStore & PersistentObjectStore {
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<ObjectState, PersistedObjectState>(
			backend,
			objectSimpleEntityConfig,
		),
	);
}
