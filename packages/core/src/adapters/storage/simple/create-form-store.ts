import type { FormState } from "../../../middleware/form/types";
import type {
	PersistedFormStateDetails,
	PersistentFormStore,
	SessionFormStore,
} from "../interfaces";
import type { KvBackend } from "./backend";
import { GenericSimpleEntityStore } from "./entity-store";
import { formSimpleEntityConfig } from "./form-entity-config";
import { SimpleRepoStore } from "./simple-repo-store";

export function createFormStore(
	backend: KvBackend,
): SessionFormStore & PersistentFormStore {
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<FormState, PersistedFormStateDetails>(
			backend,
			formSimpleEntityConfig,
		),
	);
}
