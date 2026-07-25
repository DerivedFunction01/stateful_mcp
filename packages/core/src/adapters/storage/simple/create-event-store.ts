import type { EventCommit } from "../../../middleware/event/types";
import type {
	PersistedEventState,
	PersistentEventStore,
	SessionEventStore,
} from "../interfaces";
import { GenericSimpleEntityStore } from "./entity-store";
import { eventSimpleEntityConfig } from "./event-entity-config";
import type { KvBackend } from "./kv-backend";
import { SimpleRepoStore } from "./simple-repo-store";

export async function createEventStore(
	backend: KvBackend,
): Promise<SessionEventStore & PersistentEventStore> {
	await backend.load();
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<EventCommit, PersistedEventState>(
			backend,
			eventSimpleEntityConfig,
		),
	);
}
