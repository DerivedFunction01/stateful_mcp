import type { TraceForm } from "../../../middleware/trace/types";
import type {
	PersistedTraceState,
	PersistentTraceStore,
	SessionTraceStore,
} from "../interfaces";
import { GenericSimpleEntityStore } from "./entity-store";
import type { KvBackend } from "./kv-backend";
import { SimpleRepoStore } from "./simple-repo-store";
import { traceSimpleEntityConfig } from "./trace-entity-config";

export async function createTraceStore(
	backend: KvBackend,
): Promise<SessionTraceStore & PersistentTraceStore> {
	await backend.load();
	return new SimpleRepoStore(
		new GenericSimpleEntityStore<TraceForm, PersistedTraceState>(
			backend,
			traceSimpleEntityConfig,
		),
	) as SessionTraceStore & PersistentTraceStore;
}
