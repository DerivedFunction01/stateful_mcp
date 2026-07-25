import type { EventCommit } from "../../../middleware/event/types";
import type {
	PersistedEventState,
	PersistentEventStore,
	SessionEventStore,
} from "../interfaces";
import type { KvBackend } from "./backend";
import { GenericSimpleEntityStore } from "./entity-store";
import { eventSimpleEntityConfig } from "./event-entity-config";
import { SimpleRepoStore } from "./simple-repo-store";

export function createEventStore(
	backend: KvBackend,
): SessionEventStore & PersistentEventStore {
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<EventCommit, PersistedEventState>(
			backend,
			eventSimpleEntityConfig,
		),
	);
}
