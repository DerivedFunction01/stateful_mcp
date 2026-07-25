import type { FilterState } from "../../../middleware/filter/types";
import type {
	PersistedFilterState,
	PersistentFilterStore,
	SessionFilterStore,
} from "../interfaces";
import type { KvBackend } from "./backend";
import { GenericSimpleEntityStore } from "./entity-store";
import { filterSimpleEntityConfig } from "./filter-entity-config";
import { SimpleRepoStore } from "./simple-repo-store";

export async function createFilterStore(
	backend: KvBackend,
): Promise<SessionFilterStore & PersistentFilterStore> {
	await backend.load();
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<FilterState, PersistedFilterState>(
			backend,
			filterSimpleEntityConfig,
		),
	);
}
