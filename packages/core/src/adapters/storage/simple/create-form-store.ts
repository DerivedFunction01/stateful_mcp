import type { FormState } from "../../../middleware/form/types";
import type {
	PersistedFormStateDetails,
	PersistentFormStore,
	SessionFormStore,
} from "../interfaces";
import { GenericSimpleEntityStore } from "./entity-store";
import { formSimpleEntityConfig } from "./form-entity-config";
import type { KvBackend } from "./kv-backend";
import { SimpleRepoStore } from "./simple-repo-store";

export async function createFormStore(
	backend: KvBackend,
): Promise<SessionFormStore & PersistentFormStore> {
	await backend.load();
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<FormState, PersistedFormStateDetails>(
			backend,
			formSimpleEntityConfig,
		),
	);
}
