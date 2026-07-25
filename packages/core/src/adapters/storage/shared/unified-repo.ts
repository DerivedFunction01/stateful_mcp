import { registerAdapter } from "@stateful-mcp/core/config/loader";
import type {
	ConceptStore,
	PersistentExpressionStore,
} from "@stateful-mcp/core/middleware/dictionary/interfaces";
import type { SqlDialect } from "@stateful-mcp/core/translation/sql-compiler";
import type {
	PersistentEventStore,
	PersistentFilterStore,
	PersistentFormStore,
	PersistentObjectStore,
	PersistentTraceStore,
	PersistentVariableStore,
	SessionEventStore,
	SessionFilterStore,
	SessionFormStore,
	SessionObjectStore,
	SessionTraceStore,
	SessionVariableStore,
} from "../interfaces";
import type {
	ConceptStoreBackend,
	ExpressionStoreBackend,
} from "../simple/dict-backend";
import * as kvFactories from "../simple/factories";
import { IndexedDbKvBackend } from "../simple/indexeddb/backend";
import {
	IndexedDbConceptStoreBackend,
	IndexedDbExpressionStoreBackend,
} from "../simple/indexeddb/dict-backend";
import { JsonlKvBackend } from "../simple/jsonl/backend";
import {
	JsonlConceptStoreBackend,
	JsonlExpressionStoreBackend,
} from "../simple/jsonl/dict-backend";
import type { KvBackend } from "../simple/kv-backend";
import {
	LocalStorageConceptStoreBackend,
	LocalStorageExpressionStoreBackend,
} from "../simple/localstorage/dict-backend";
import { MemoryKvBackend } from "../simple/memory/backend";
import {
	MemoryConceptStoreBackend,
	MemoryExpressionStoreBackend,
} from "../simple/memory/dict-backend";
import * as sqlFactories from "../sql/factories";

export type BackendType =
	| "sqlite"
	| "postgres"
	| "duckdb"
	| "opfs"
	| "memory"
	| "jsonl"
	| "localstorage"
	| "indexeddb";

export interface BackendSpec {
	type: BackendType;
	target?: string;
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
	trace?: {
		session?: BackendSpec | BackendSpec[];
		persistent?: BackendSpec | BackendSpec[];
	};
	variable?: {
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
	sessionTrace?: SessionTraceStore;
	persistentTrace?: PersistentTraceStore;
	sessionVariable?: SessionVariableStore;
	persistentVariable?: PersistentVariableStore;
	conceptStore?: ConceptStore;
	persistentExpressionStore?: PersistentExpressionStore;
}

// --- Helpers ---

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

function isSql(type: string): boolean {
	return ["sqlite", "postgres", "duckdb", "opfs"].includes(type);
}

function dialectFor(type: string): SqlDialect {
	switch (type) {
		case "sqlite":
		case "opfs":
			return "sqlite";
		case "postgres":
			return "postgres";
		case "duckdb":
			return "duckdb";
		default:
			throw new Error(`Unsupported SQL dialect: ${type}`);
	}
}

function buildKvBackend(type: string, target?: string): KvBackend {
	switch (type) {
		case "jsonl": {
			const sessionPath = target ? `${target}-session.jsonl` : undefined;
			const persistentPath = target ? `${target}-persistent.jsonl` : undefined;
			return new JsonlKvBackend(sessionPath, persistentPath);
		}
		case "indexeddb":
			return new IndexedDbKvBackend(target || "stateful_mcp_kv");
		default:
			return new MemoryKvBackend();
	}
}

function buildConceptBackend(
	type: string,
	target?: string,
): ConceptStoreBackend {
	switch (type) {
		case "memory":
			return new MemoryConceptStoreBackend();
		case "jsonl":
			return new JsonlConceptStoreBackend(target || "./concepts.jsonl");
		case "localstorage":
			return new LocalStorageConceptStoreBackend();
		case "indexeddb":
			return new IndexedDbConceptStoreBackend(target);
		default:
			return new MemoryConceptStoreBackend();
	}
}

function buildExpressionBackend(
	type: string,
	target?: string,
): ExpressionStoreBackend {
	switch (type) {
		case "memory":
			return new MemoryExpressionStoreBackend();
		case "jsonl":
			return new JsonlExpressionStoreBackend(target || "./expressions.jsonl");
		case "localstorage":
			return new LocalStorageExpressionStoreBackend();
		case "indexeddb":
			return new IndexedDbExpressionStoreBackend(target);
		default:
			return new MemoryExpressionStoreBackend();
	}
}

// --- Main unified factory ---

export async function createRepo(config: RepoConfig): Promise<RepoAdapter> {
	const adapter: RepoAdapter = {};

	// Helper to resolve generic pair configuration (form, filter, object, event)
	const resolvePair = async <T>(
		configSection:
			| {
					session?: BackendSpec | BackendSpec[];
					persistent?: BackendSpec | BackendSpec[];
			  }
			| undefined,
		sqlFactory: Function,
		kvFactory: Function,
	): Promise<{ session?: T; persistent?: T }> => {
		if (!configSection) return {};

		const sessionSpec = normalize(configSection.session);
		const persistentSpec = normalize(configSection.persistent);
		const result: { session?: T; persistent?: T } = {};

		// Case 1: Shared Backend
		if (
			sessionSpec &&
			persistentSpec &&
			sameBackend(sessionSpec, persistentSpec)
		) {
			if (isSql(sessionSpec.type)) {
				const dialect = dialectFor(sessionSpec.type);
				const store = await sqlFactory(dialect, sessionSpec.target || "");
				result.session = store;
				result.persistent = store;
			} else {
				const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
				const store = await kvFactory(backend);
				result.session = store;
				result.persistent = store;
			}
			return result;
		}

		// Case 2: Distinct Backends
		if (sessionSpec) {
			if (isSql(sessionSpec.type)) {
				const dialect = dialectFor(sessionSpec.type);
				result.session = await sqlFactory(dialect, sessionSpec.target);
			} else {
				const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
				result.session = await kvFactory(backend);
			}
		}

		if (persistentSpec) {
			if (isSql(persistentSpec.type)) {
				const dialect = dialectFor(persistentSpec.type);
				result.persistent = await sqlFactory(dialect, persistentSpec.target);
			} else {
				const backend = buildKvBackend(
					persistentSpec.type,
					persistentSpec.target,
				);
				result.persistent = await kvFactory(backend);
			}
		}

		return result;
	};

	// 1. Resolve Data Stores
	const filterStores = await resolvePair<
		SessionFilterStore & PersistentFilterStore
	>(
		config.filter,
		sqlFactories.createFilterStore,
		kvFactories.createFilterStore,
	);
	adapter.sessionFilter = filterStores.session;
	adapter.persistentFilter = filterStores.persistent;

	const formStores = await resolvePair<SessionFormStore & PersistentFormStore>(
		config.form,
		sqlFactories.createFormStore,
		kvFactories.createFormStore,
	);
	adapter.sessionForm = formStores.session;
	adapter.persistentForm = formStores.persistent;

	const objectStores = await resolvePair<
		SessionObjectStore & PersistentObjectStore
	>(
		config.object,
		sqlFactories.createObjectStore,
		kvFactories.createObjectStore,
	);
	adapter.sessionObject = objectStores.session;
	adapter.persistentObject = objectStores.persistent;

	const eventStores = await resolvePair<
		SessionEventStore & PersistentEventStore
	>(config.event, sqlFactories.createEventStore, kvFactories.createEventStore);
	adapter.sessionEvent = eventStores.session;
	adapter.persistentEvent = eventStores.persistent;

	const traceStores = await resolvePair<
		SessionTraceStore & PersistentTraceStore
	>(config.trace, sqlFactories.createTraceStore, kvFactories.createTraceStore);
	adapter.sessionTrace = traceStores.session;
	adapter.persistentTrace = traceStores.persistent;

	const variableStores = await resolvePair<
		SessionVariableStore & PersistentVariableStore
	>(
		config.variable,
		sqlFactories.createVariableStore,
		kvFactories.createVariableStore,
	);
	adapter.sessionVariable = variableStores.session;
	adapter.persistentVariable = variableStores.persistent;

	// 2. Resolve Dictionary/Concept Stores
	const conceptSpec = normalize(config.concept);
	if (conceptSpec) {
		if (isSql(conceptSpec.type)) {
			const dialect = dialectFor(conceptSpec.type);
			adapter.conceptStore = await sqlFactories.createConceptStore(
				dialect,
				conceptSpec.target!,
			);
		} else {
			const backend = buildConceptBackend(conceptSpec.type, conceptSpec.target);
			adapter.conceptStore = kvFactories.createConceptStore(backend);
		}
	}

	const expressionSpec = normalize(config.expression);
	if (expressionSpec) {
		if (isSql(expressionSpec.type)) {
			const dialect = dialectFor(expressionSpec.type);
			adapter.persistentExpressionStore =
				await sqlFactories.createExpressionStore(
					dialect,
					expressionSpec.target!,
				);
		} else {
			const backend = buildExpressionBackend(
				expressionSpec.type,
				expressionSpec.target,
			);
			adapter.persistentExpressionStore =
				kvFactories.createExpressionStore(backend);
		}
	}

	return adapter;
}

// --- Adapter Registrations ---

export function registerAdapters(): void {
	// SQL Adapters
	registerAdapter("sqlite", {
		create: async (options: Record<string, unknown>) => {
			const dbPath = String(options.path || "./sqlite.db");
			return createRepo(buildConfig("sqlite", dbPath));
		},
	});

	registerAdapter("postgres", {
		create: async (options: Record<string, unknown>) => {
			const connStr = String(
				options.connection ||
					options.connectionString ||
					"postgresql://localhost:5432/postgres",
			);
			return createRepo(buildConfig("postgres", connStr));
		},
	});

	registerAdapter("duckdb", {
		create: async (options: Record<string, unknown>) => {
			const dbPath = String(options.path || "./duckdb.db");
			return createRepo(buildConfig("duckdb", dbPath));
		},
	});

	registerAdapter("opfs", {
		create: async (options: Record<string, unknown>) => {
			const dbPath = String(options.path || options.dbName || "./opfs.sqlite3");
			return createRepo(buildConfig("opfs", dbPath));
		},
	});

	// KV / Memory Adapters
	registerAdapter("memory", {
		create: async () => createRepo(buildConfig("memory")),
	});

	registerAdapter("jsonl", {
		create: async (options: Record<string, unknown>) => {
			const dbPath = String(options.path || "data");
			return createRepo(buildConfig("jsonl", dbPath));
		},
	});

	registerAdapter("localstorage", {
		create: async () => createRepo(buildConfig("localstorage")),
	});

	registerAdapter("indexeddb", {
		create: async (options: Record<string, unknown>) => {
			const dbName = String(options.dbName || "app-db");
			return createRepo(buildConfig("indexeddb", dbName));
		},
	});
}

// Helper for generating standard config setups
function buildConfig(type: BackendType, target?: string): RepoConfig {
	const spec: BackendSpec = target ? { type, target } : { type };
	return {
		filter: { session: spec, persistent: spec },
		form: { session: spec, persistent: spec },
		object: { session: spec, persistent: spec },
		event: { session: spec, persistent: spec },
		trace: { session: spec, persistent: spec },
		variable: { session: spec, persistent: spec },
		concept: spec,
		expression: spec,
	};
}

registerAdapters();
