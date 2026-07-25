import { registerAdapter } from "@stateful-mcp/core/config/loader";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "../../../middleware/dictionary/interfaces";
import type { SqlDialect } from "../../../translation/sql-compiler";

import type {
	PersistentEventStore,
	PersistentFilterStore,
	PersistentFormStore,
	PersistentObjectStore,
	SessionEventStore,
	SessionFilterStore,
	SessionFormStore,
	SessionObjectStore,
} from "../interfaces";
import { SqlBackend } from "./backend";
import {
	createConceptStore,
	createEventStore,
	createExpressionStore,
	createFilterStore,
	createFormStore,
	createObjectStore,
} from "./factories";

export interface BackendSpec {
	type: "sqlite" | "postgres" | "duckdb" | "memory" | "jsonl";
	target: string;
}

export interface RepoConfig {
	filter?: {
		session?: BackendSpec | BackendSpec[];
		persistent?: BackendSpec | BackendSpec[];
	};
	form?: {
		session?: BackendSpec | BackendSpec[];
		persistent?: BackendSpec | BackendSpec[];
	};
	object?: {
		session?: BackendSpec | BackendSpec[];
		persistent?: BackendSpec | BackendSpec[];
	};
	event?: {
		session?: BackendSpec | BackendSpec[];
		persistent?: BackendSpec | BackendSpec[];
	};
	concept?: BackendSpec | BackendSpec[];
	expression?: BackendSpec | BackendSpec[];
}

export interface RepoAdapter {
	sessionFilter?: SessionFilterStore;
	persistentFilter?: PersistentFilterStore;
	sessionObject?: SessionObjectStore;
	persistentObject?: PersistentObjectStore;
	sessionEvent?: SessionEventStore;
	persistentEvent?: PersistentEventStore;
	sessionForm?: SessionFormStore;
	persistentForm?: PersistentFormStore;
	conceptStore?: ConceptStore;
	persistentExpressionStore?: PersistentExpressionStore;
}

function normalize(
	spec: BackendSpec | BackendSpec[] | undefined,
): BackendSpec | undefined {
	if (!spec) return undefined;
	return Array.isArray(spec) ? spec[0] : spec;
}

function sameBackend(
	a: BackendSpec | undefined,
	b: BackendSpec | undefined,
): boolean {
	if (!a || !b) return false;
	return a.type === b.type && a.target === b.target;
}

function dialectFor(type: string): SqlDialect {
	switch (type) {
		case "sqlite":
			return "sqlite";
		case "postgres":
			return "postgres";
		case "duckdb":
			return "duckdb";
		default:
			throw new Error(`Unsupported SQL dialect: ${type}`);
	}
}

export async function createRepo(config: RepoConfig): Promise<RepoAdapter> {
	const adapter: RepoAdapter = {};

	if (config.filter) {
		const sessionSpec = normalize(config.filter.session);
		const persistentSpec = normalize(config.filter.persistent);
		if (
			sessionSpec &&
			persistentSpec &&
			sameBackend(sessionSpec, persistentSpec)
		) {
			const dialect = dialectFor(sessionSpec.type);
			const backend = await SqlBackend.connect(dialect, sessionSpec.target);
			const store = await createFilterStore(
				dialect,
				sessionSpec.target,
				backend,
			);
			adapter.sessionFilter = store;
			adapter.persistentFilter = store;
		} else {
			if (sessionSpec) {
				const dialect = dialectFor(sessionSpec.type);
				adapter.sessionFilter = await createFilterStore(
					dialect,
					sessionSpec.target,
				);
			}
			if (persistentSpec) {
				const dialect = dialectFor(persistentSpec.type);
				adapter.persistentFilter = await createFilterStore(
					dialect,
					persistentSpec.target,
				);
			}
		}
	}

	if (config.form) {
		const sessionSpec = normalize(config.form.session);
		const persistentSpec = normalize(config.form.persistent);
		if (
			sessionSpec &&
			persistentSpec &&
			sameBackend(sessionSpec, persistentSpec)
		) {
			const dialect = dialectFor(sessionSpec.type);
			const backend = await SqlBackend.connect(dialect, sessionSpec.target);
			const store = await createFormStore(dialect, sessionSpec.target, backend);
			adapter.sessionForm = store;
			adapter.persistentForm = store;
		} else {
			if (sessionSpec) {
				const dialect = dialectFor(sessionSpec.type);
				adapter.sessionForm = await createFormStore(
					dialect,
					sessionSpec.target,
				);
			}
			if (persistentSpec) {
				const dialect = dialectFor(persistentSpec.type);
				adapter.persistentForm = await createFormStore(
					dialect,
					persistentSpec.target,
				);
			}
		}
	}

	if (config.object) {
		const sessionSpec = normalize(config.object.session);
		const persistentSpec = normalize(config.object.persistent);
		if (
			sessionSpec &&
			persistentSpec &&
			sameBackend(sessionSpec, persistentSpec)
		) {
			const dialect = dialectFor(sessionSpec.type);
			const backend = await SqlBackend.connect(dialect, sessionSpec.target);
			const store = await createObjectStore(
				dialect,
				sessionSpec.target,
				backend,
			);
			adapter.sessionObject = store;
			adapter.persistentObject = store;
		} else {
			if (sessionSpec) {
				const dialect = dialectFor(sessionSpec.type);
				adapter.sessionObject = await createObjectStore(
					dialect,
					sessionSpec.target,
				);
			}
			if (persistentSpec) {
				const dialect = dialectFor(persistentSpec.type);
				adapter.persistentObject = await createObjectStore(
					dialect,
					persistentSpec.target,
				);
			}
		}
	}

	if (config.event) {
		const sessionSpec = normalize(config.event.session);
		const persistentSpec = normalize(config.event.persistent);
		if (
			sessionSpec &&
			persistentSpec &&
			sameBackend(sessionSpec, persistentSpec)
		) {
			const dialect = dialectFor(sessionSpec.type);
			const backend = await SqlBackend.connect(dialect, sessionSpec.target);
			const store = await createEventStore(
				dialect,
				sessionSpec.target,
				backend,
			);
			adapter.sessionEvent = store;
			adapter.persistentEvent = store;
		} else {
			if (sessionSpec) {
				const dialect = dialectFor(sessionSpec.type);
				adapter.sessionEvent = await createEventStore(
					dialect,
					sessionSpec.target,
				);
			}
			if (persistentSpec) {
				const dialect = dialectFor(persistentSpec.type);
				adapter.persistentEvent = await createEventStore(
					dialect,
					persistentSpec.target,
				);
			}
		}
	}

	if (config.concept) {
		const spec = normalize(config.concept);
		if (spec) {
			const dialect = dialectFor(spec.type);
			adapter.conceptStore = await createConceptStore(dialect, spec.target);
		}
	}

	if (config.expression) {
		const spec = normalize(config.expression);
		if (spec) {
			const dialect = dialectFor(spec.type);
			adapter.persistentExpressionStore = await createExpressionStore(
				dialect,
				spec.target,
			);
		}
	}

	return adapter;
}

export function registerSqlAdapters(): void {
	registerAdapter("sqlite", {
		create: async (options: Record<string, unknown>) => {
			const dbPath = String(options.path || "./sqlite.db");
			return createRepo({
				filter: {
					session: { type: "sqlite", target: dbPath },
					persistent: { type: "sqlite", target: dbPath },
				},
				form: {
					session: { type: "sqlite", target: dbPath },
					persistent: { type: "sqlite", target: dbPath },
				},
				object: {
					session: { type: "sqlite", target: dbPath },
					persistent: { type: "sqlite", target: dbPath },
				},
				event: {
					session: { type: "sqlite", target: dbPath },
					persistent: { type: "sqlite", target: dbPath },
				},
				concept: { type: "sqlite", target: dbPath },
				expression: { type: "sqlite", target: dbPath },
			});
		},
	});

	registerAdapter("postgres", {
		create: async (options: Record<string, unknown>) => {
			const connStr = String(
				options.connection ||
					options.connectionString ||
					"postgresql://localhost:5432/postgres",
			);
			return createRepo({
				filter: {
					session: { type: "postgres", target: connStr },
					persistent: { type: "postgres", target: connStr },
				},
				form: {
					session: { type: "postgres", target: connStr },
					persistent: { type: "postgres", target: connStr },
				},
				object: {
					session: { type: "postgres", target: connStr },
					persistent: { type: "postgres", target: connStr },
				},
				event: {
					session: { type: "postgres", target: connStr },
					persistent: { type: "postgres", target: connStr },
				},
				concept: { type: "postgres", target: connStr },
				expression: { type: "postgres", target: connStr },
			});
		},
	});

	registerAdapter("duckdb", {
		create: async (options: Record<string, unknown>) => {
			const dbPath = String(options.path || "./duckdb.db");
			return createRepo({
				filter: {
					session: { type: "duckdb", target: dbPath },
					persistent: { type: "duckdb", target: dbPath },
				},
				form: {
					session: { type: "duckdb", target: dbPath },
					persistent: { type: "duckdb", target: dbPath },
				},
				object: {
					session: { type: "duckdb", target: dbPath },
					persistent: { type: "duckdb", target: dbPath },
				},
				event: {
					session: { type: "duckdb", target: dbPath },
					persistent: { type: "duckdb", target: dbPath },
				},
				concept: { type: "duckdb", target: dbPath },
				expression: { type: "duckdb", target: dbPath },
			});
		},
	});
}

registerSqlAdapters();
