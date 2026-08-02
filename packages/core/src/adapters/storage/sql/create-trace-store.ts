import type { SqlDialect } from "../../../translation/sql-compiler";
import type { PersistentTraceStore, SessionTraceStore } from "../interfaces";
import { SqlBackend } from "./backend";
import { GenericSqlEntityStore } from "./entity-store";
import { initSchema } from "./init-schema";
import { SqlRepoStore } from "./sql-repo-store";
import { traceDdlKeys, traceEntityConfigs } from "./trace-entity-config";

export async function createTraceStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionTraceStore & PersistentTraceStore> {
	const be = backend ?? (await SqlBackend.connect(dialect, target));
	await initSchema(be, traceDdlKeys);
	const store = new GenericSqlEntityStore(be, traceEntityConfigs[dialect]);
	return new SqlRepoStore(store) as SessionTraceStore & PersistentTraceStore;
}

export async function createSessionTraceStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<SessionTraceStore> {
	return createTraceStore(dialect, target, backend);
}

export async function createPersistentTraceStore(
	dialect: SqlDialect,
	target: string,
	backend?: SqlBackend,
): Promise<PersistentTraceStore> {
	return createTraceStore(dialect, target, backend);
}
