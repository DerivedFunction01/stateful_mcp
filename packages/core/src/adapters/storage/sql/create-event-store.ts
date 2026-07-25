import type { EventCommit } from "../../../middleware/event/types";
import type { SqlDialect } from "../../../translation/sql-compiler";
import type {
	PersistedEventState,
	PersistentEventStore,
	SessionEventStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { eventDdlKeys, eventEntityConfigs } from "./event-entity-config";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";

export async function createEventStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionEventStore & PersistentEventStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	if (!backend) await initSchema(be, eventDdlKeys);
	const store = new GenericSqlEntityStore<EventCommit, PersistedEventState>(
		be,
		eventEntityConfigs[dialect],
	);
	return new SqlRepoStore(store);
}

export async function createSessionEventStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionEventStore> {
	return createEventStore(dialect, target, backend);
}

export async function createPersistentEventStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<PersistentEventStore> {
	return createEventStore(dialect, target, backend);
}
