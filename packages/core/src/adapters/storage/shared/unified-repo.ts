import type { DictionarySqlQueryRunner } from "@stateful-mcp/core/adapters/storage/sql/dict-executor";
import { executeDictionaryPlan } from "@stateful-mcp/core/adapters/storage/sql/dict-executor";
import { SqlConceptFilterStore } from "@stateful-mcp/core/adapters/storage/sql/dict-filter-store";
import {
	DictionaryQueryPlanner,
	type DictionaryStorageTopology,
} from "@stateful-mcp/core/adapters/storage/sql/dict-planner";
import { registerAdapter } from "@stateful-mcp/core/config/loader";
import type { StorageRuntimeConfig } from "@stateful-mcp/core/config/types";
import { validateStorageRuntimeConfig } from "@stateful-mcp/core/config/validator";
import type {
	ConceptFilterStore,
	ConceptStore,
	PersistentExpressionStore,
} from "@stateful-mcp/core/middleware/dictionary/interfaces";
import {
	InMemoryConceptResolver,
	matchCustomExpression,
} from "@stateful-mcp/core/middleware/dictionary/resolver";
import { DictionaryStore } from "@stateful-mcp/core/middleware/dictionary/store";
import { normalizeLookupTerm } from "@stateful-mcp/core/middleware/dictionary/types";
import type {
	EffectiveStorePolicy,
	SchemaInitializationMode,
	StoreBinding,
	StoreCapabilities,
	StorePermissions,
} from "@stateful-mcp/core/storage/contracts";
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
import { PermissionedSimpleKvBackend } from "../simple/permissioned-kv-backend";
import { SqlBackend } from "../sql/backend";
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
	capabilities?: StoreCapabilities;
	permissions?: StorePermissions;
	schemaMode?: SchemaInitializationMode;
}

export interface RepoConfig {
	storageRuntime?: StorageRuntimeConfig;
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
	storageRuntime?: StorageRuntimeConfig;
	dictionaryStore?: DictionaryStore;
	dictionaryQueryPlanner?: DictionaryQueryPlanner;
	dictionaryStorageTopology?: DictionaryStorageTopology;
	conceptFilterStore?: ConceptFilterStore;
	dictionarySqlQueryRunner?: DictionarySqlQueryRunner;
	dictionarySqlQueryRunners?: Partial<
		Record<"concepts" | "expressions" | "filters", DictionarySqlQueryRunner>
	>;
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

function policyFor(spec?: BackendSpec): EffectiveStorePolicy {
	return {
		capabilities: spec?.capabilities,
		permissions: spec?.permissions,
		schemaMode: spec?.schemaMode,
	};
}

function buildKvBackend(
	type: string,
	target?: string,
	policy: EffectiveStorePolicy = {},
): KvBackend {
	let backend: KvBackend;
	switch (type) {
		case "jsonl": {
			const sessionPath = target ? `${target}-session.jsonl` : undefined;
			const persistentPath = target ? `${target}-persistent.jsonl` : undefined;
			backend = new JsonlKvBackend(sessionPath, persistentPath);
			break;
		}
		case "indexeddb":
			backend = new IndexedDbKvBackend(target || "stateful_mcp_kv");
			break;
		default:
			backend = new MemoryKvBackend();
			break;
	}
	return new PermissionedSimpleKvBackend(backend, policy);
}

function connectSql(spec: BackendSpec): Promise<SqlBackend> {
	return SqlBackend.connect(
		dialectFor(spec.type),
		spec.target || "",
		policyFor(spec),
	);
}

function bindingToSpec(binding: StoreBinding, context: string): BackendSpec {
	if (binding.locator._type !== "adapter") {
		throw new Error(
			`${context} must use an adapter locator for repository construction.`,
		);
	}
	const options = binding.locator.options ?? {};
	const target =
		(options as any).path ??
		(options as any).dbName ??
		(options as any).connectionString ??
		(options as any).connection;
	return {
		type: binding.locator.name as BackendType,
		target: target === undefined ? undefined : String(target),
		capabilities: binding.capabilities,
		permissions: binding.permissions,
		schemaMode: binding.permissions?.write === false ? "read_only" : undefined,
	};
}

function routeBinding(
	route: { source?: StoreBinding; projection?: StoreBinding } | undefined,
	context: string,
): BackendSpec | undefined {
	const binding = route?.projection ?? route?.source;
	return binding ? bindingToSpec(binding, context) : undefined;
}

function applyStorageRuntime(config: RepoConfig): RepoConfig {
	if (!config.storageRuntime) return config;
	const result: RepoConfig = { ...config };
	const runtime = config.storageRuntime as any;
	for (const domain of [
		"filter",
		"form",
		"object",
		"event",
		"trace",
		"variable",
	] as const) {
		const section = runtime[domain];
		if (!section) continue;
		const existing = (result as any)[domain] ?? {};
		const session = section.session?.route;
		const global = section.persistent?.scope?.global;
		const user = section.persistent?.scope?.user;
		if (global && user && JSON.stringify(global) !== JSON.stringify(user)) {
			throw new Error(
				`storage_runtime.${domain} requires one backend for global and user persistence.`,
			);
		}
		(result as any)[domain] = {
			...existing,
			session:
				existing.session ??
				routeBinding(session, `storage_runtime.${domain}.session`),
			persistent:
				existing.persistent ??
				routeBinding(global ?? user, `storage_runtime.${domain}.persistent`),
		};
	}
	const dictionary = runtime.dictionary;
	if (dictionary) {
		const concept = routeBinding(
			dictionary.concepts,
			"storage_runtime.dictionary.concepts",
		);
		const expression = routeBinding(
			dictionary.expressions,
			"storage_runtime.dictionary.expressions",
		);
		if (!(result as any).concept && concept) (result as any).concept = concept;
		if (!(result as any).expression && expression)
			(result as any).expression = expression;
	}
	return result;
}

function dictionaryTopology(
	runtime: StorageRuntimeConfig,
): DictionaryStorageTopology | undefined {
	const dictionary = runtime.dictionary;
	if (!dictionary?.concepts || !dictionary.expressions || !dictionary.filters)
		return undefined;
	const location = (
		domain: "concepts" | "expressions" | "filters",
		route: any,
	) => {
		const binding = route.projection ?? route.source;
		const locator = binding?.locator;
		const name = locator?.name;
		const backendKind = ["sqlite", "postgres", "duckdb", "opfs"].includes(name)
			? "sql"
			: name === "remote_url"
				? "remote"
				: name === "memory"
					? "memory"
					: "kv";
		const options = locator?.options ?? {};
		const connectionId = String(
			options.connectionString ??
				options.connection ??
				options.path ??
				options.dbName ??
				name ??
				domain,
		);
		const dialect = isSql(name) ? dialectFor(name) : undefined;
		return {
			domain,
			backendKind: backendKind as "sql" | "kv" | "memory" | "remote",
			connectionId,
			...(dialect ? { dialect } : {}),
			read: binding.permissions?.read !== false,
			write: binding.permissions?.write !== false,
			syncWrite: binding.permissions?.syncWrite !== false,
		};
	};
	return {
		concepts: location("concepts", dictionary.concepts),
		expressions: location("expressions", dictionary.expressions),
		filters: location("filters", dictionary.filters),
	};
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
	if (config.storageRuntime)
		validateStorageRuntimeConfig(config.storageRuntime);
	config = applyStorageRuntime(config);
	const adapter: RepoAdapter = { storageRuntime: config.storageRuntime };

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
				const store = await sqlFactory(
					dialect,
					sessionSpec.target || "",
					await connectSql(sessionSpec),
				);
				result.session = store;
				result.persistent = store;
			} else {
				const backend = buildKvBackend(
					sessionSpec.type,
					sessionSpec.target,
					policyFor(sessionSpec),
				);
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
				result.session = await sqlFactory(
					dialect,
					sessionSpec.target,
					await connectSql(sessionSpec),
				);
			} else {
				const backend = buildKvBackend(
					sessionSpec.type,
					sessionSpec.target,
					policyFor(sessionSpec),
				);
				result.session = await kvFactory(backend);
			}
		}

		if (persistentSpec) {
			if (isSql(persistentSpec.type)) {
				const dialect = dialectFor(persistentSpec.type);
				result.persistent = await sqlFactory(
					dialect,
					persistentSpec.target,
					await connectSql(persistentSpec),
				);
			} else {
				const backend = buildKvBackend(
					persistentSpec.type,
					persistentSpec.target,
					policyFor(persistentSpec),
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
			const backend = await connectSql(conceptSpec);
			adapter.dictionarySqlQueryRunner ??= backend;
			if (!adapter.dictionarySqlQueryRunners)
				adapter.dictionarySqlQueryRunners = {};
			adapter.dictionarySqlQueryRunners.concepts = backend;
			adapter.conceptStore = await sqlFactories.createConceptStore(
				dialect,
				conceptSpec.target!,
				backend,
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
			const backend = await connectSql(expressionSpec);
			adapter.dictionarySqlQueryRunner ??= backend;
			if (!adapter.dictionarySqlQueryRunners)
				adapter.dictionarySqlQueryRunners = {};
			adapter.dictionarySqlQueryRunners.expressions = backend;
			adapter.persistentExpressionStore =
				await sqlFactories.createExpressionStore(
					dialect,
					expressionSpec.target!,
					backend,
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
	const dictionaryFilterRoute = config.storageRuntime?.dictionary?.filters;
	const dictionaryFilterSpec = dictionaryFilterRoute
		? routeBinding(dictionaryFilterRoute, "storage_runtime.dictionary.filters")
		: undefined;
	if (dictionaryFilterSpec) {
		if (isSql(dictionaryFilterSpec.type)) {
			const filterBackend = await connectSql(dictionaryFilterSpec);
			adapter.dictionarySqlQueryRunner ??= filterBackend;
			if (!adapter.dictionarySqlQueryRunners)
				adapter.dictionarySqlQueryRunners = {};
			adapter.dictionarySqlQueryRunners.filters = filterBackend;
			const filterStore = new SqlConceptFilterStore(filterBackend);
			await filterStore.initialize();
			adapter.conceptFilterStore = filterStore;
		} else if (dictionaryFilterSpec.type === "memory") {
			const backend = buildKvBackend(
				dictionaryFilterSpec.type,
				dictionaryFilterSpec.target,
				policyFor(dictionaryFilterSpec),
			);
			adapter.conceptFilterStore =
				await kvFactories.createConceptFilterStore(backend);
		} else {
			const backend = buildKvBackend(
				dictionaryFilterSpec.type,
				dictionaryFilterSpec.target,
				policyFor(dictionaryFilterSpec),
			);
			adapter.conceptFilterStore =
				await kvFactories.createConceptFilterStore(backend);
		}
	}
	if (config.storageRuntime) {
		const topology = dictionaryTopology(config.storageRuntime);
		if (topology) {
			adapter.dictionaryStorageTopology = topology;
			adapter.dictionaryQueryPlanner = new DictionaryQueryPlanner();
		}
	}
	let optimizedResolver:
		| ((term: string, context?: Record<string, any>) => Promise<any>)
		| undefined;
	const configuredConceptStore = adapter.conceptStore;
	const configuredExpressionStore = adapter.persistentExpressionStore;
	if (
		adapter.dictionaryQueryPlanner &&
		adapter.dictionaryStorageTopology &&
		(adapter.dictionarySqlQueryRunners?.expressions ??
			adapter.dictionarySqlQueryRunner) &&
		configuredConceptStore &&
		configuredExpressionStore
	) {
		optimizedResolver = async (term, context) => {
			if (context?.user_id || context?.workspace_id) return null;
			try {
				const plan = adapter.dictionaryQueryPlanner!.plan(
					adapter.dictionaryStorageTopology!,
					{
						lookupTerm: normalizeLookupTerm(term),
						roleName: context?.roleName ?? context?.role_name,
						limit: 50,
					},
				);
				const result = await executeDictionaryPlan(
					plan,
					{ roleName: context?.roleName ?? context?.role_name },
					{
						sql:
							adapter.dictionarySqlQueryRunners?.expressions ??
							adapter.dictionarySqlQueryRunner,
						concepts: configuredConceptStore.getByIds
							? {
									getByIds: configuredConceptStore.getByIds.bind(
										configuredConceptStore,
									),
								}
							: undefined,
						filters:
							adapter.conceptFilterStore &&
							"listForConceptRoleBatch" in adapter.conceptFilterStore
								? (adapter.conceptFilterStore as any)
								: undefined,
					},
				);
				const results = result.candidates.flatMap((candidate) => {
					if (!candidate.concept) return [];
					const expression =
						typeof candidate.row.data === "string"
							? JSON.parse(candidate.row.data)
							: candidate.row.data;
					if (
						!expression ||
						!matchCustomExpression(expression, term, true).matched
					)
						return [];
					return [
						{
							conceptId: candidate.concept.id,
							concept: candidate.concept,
							score: Number(candidate.row.priority_weight ?? 0),
							matchedTerms: expression?.term ? [expression.term] : [term],
							sources: result.hydration?.sources ?? ["local"],
						},
					];
				});
				return {
					status: results.length ? "FOUND" : "NOT_FOUND",
					sources: result.hydration?.sources ?? ["local"],
					results,
				};
			} catch {
				return null;
			}
		};
	}
	if (adapter.conceptStore && adapter.persistentExpressionStore) {
		adapter.dictionaryStore = new DictionaryStore(
			new InMemoryConceptResolver({ filterStore: adapter.conceptFilterStore }),
			adapter.conceptStore,
			adapter.persistentExpressionStore,
			optimizedResolver,
			adapter.conceptFilterStore,
		);
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
			const targetConfig = {
				path: dbPath,
				schema: options.schema || options.views || options.tables || undefined,
			};
			return createRepo(buildConfig("duckdb", JSON.stringify(targetConfig)));
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
