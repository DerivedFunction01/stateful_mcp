// import type {
// 	ConceptStore,
// 	PersistentExpressionStore,
// } from "../../../middleware/dictionary/interfaces";

// import type {
// 	PersistentEventStore,
// 	PersistentFilterStore,
// 	PersistentFormStore,
// 	PersistentObjectStore,
// 	SessionEventStore,
// 	SessionFilterStore,
// 	SessionFormStore,
// 	SessionObjectStore,
// } from "../interfaces";
// import {
// 	createConceptStore,
// 	createEventStore,
// 	createExpressionStore,
// 	createFilterStore,
// 	createFormStore,
// 	createObjectStore,
// } from "../simple/factories";
// import type { KvBackend } from "../simple/kv-backend";
// import { MemoryKvBackend } from "../simple/memory/backend";
// import type {
// 	ConceptStoreBackend,
// 	ExpressionStoreBackend,
// } from "../simple/dict-backend";
// import { MemoryConceptStoreBackend, MemoryExpressionStoreBackend } from "../simple/memory/dict-backend";
// import { JsonlKvBackend } from "../simple/jsonl/backend";
// import { JsonlConceptStoreBackend, JsonlExpressionStoreBackend } from "../simple/jsonl/dict-backend";
// import { LocalStorageConceptStoreBackend, LocalStorageExpressionStoreBackend } from "../simple/localstorage/dict-backend";
// import { IndexedDbConceptStoreBackend, IndexedDbExpressionStoreBackend } from "../simple/indexeddb/dict-backend";

// export interface BackendSpec {
// 	type: "memory" | "jsonl" | "localstorage" | "indexeddb" | "memory-concept" | "memory-expression" | "jsonl-concept" | "jsonl-expression" | "localstorage-concept" | "localstorage-expression" | "indexeddb-concept" | "indexeddb-expression";
// 	target?: string;
// }

// export interface RepoConfig {
// 	filter?: {
// 		session?: BackendSpec | BackendSpec[];
// 		persistent?: BackendSpec | BackendSpec[];
// 	};
// 	form?: {
// 		session?: BackendSpec | BackendSpec[];
// 		persistent?: BackendSpec | BackendSpec[];
// 	};
// 	object?: {
// 		session?: BackendSpec | BackendSpec[];
// 		persistent?: BackendSpec | BackendSpec[];
// 	};
// 	event?: {
// 		session?: BackendSpec | BackendSpec[];
// 		persistent?: BackendSpec | BackendSpec[];
// 	};
// 	concept?: BackendSpec | BackendSpec[];
// 	expression?: BackendSpec | BackendSpec[];
// }

// export interface RepoAdapter {
// 	sessionFilter?: SessionFilterStore;
// 	persistentFilter?: PersistentFilterStore;
// 	sessionObject?: SessionObjectStore;
// 	persistentObject?: PersistentObjectStore;
// 	sessionEvent?: SessionEventStore;
// 	persistentEvent?: PersistentEventStore;
// 	sessionForm?: SessionFormStore;
// 	persistentForm?: PersistentFormStore;
// 	conceptStore?: ConceptStore;
// 	persistentExpressionStore?: PersistentExpressionStore;
// }

// function normalize(spec: BackendSpec | BackendSpec[] | undefined): BackendSpec | undefined {
// 	if (!spec) return undefined;
// 	return Array.isArray(spec) ? spec[0] : spec;
// }

// function buildKvBackend(type: string, target?: string): KvBackend {
// 	switch (type) {
// 		case "memory":
// 		case "memory-concept":
// 		case "memory-expression":
// 			return new MemoryKvBackend();
// 		case "jsonl": {
// 			const sessionPath = target ? `${target}-session.jsonl` : undefined;
// 			const persistentPath = target ? `${target}-persistent.jsonl` : undefined;
// 			return new JsonlKvBackend(sessionPath, persistentPath);
// 		}
// 		case "jsonl-concept":
// 		case "jsonl-expression":
// 			return new JsonlKvBackend(undefined, target);
// 		case "localstorage":
// 		case "localstorage-concept":
// 		case "localstorage-expression":
// 		case "indexeddb":
// 		case "indexeddb-concept":
// 		case "indexeddb-expression":
// 		default:
// 			return new MemoryKvBackend();
// 	}
// }

// function buildConceptBackend(type: string, target?: string): ConceptStoreBackend {
// 	switch (type) {
// 		case "memory":
// 		case "memory-concept":
// 			return new MemoryConceptStoreBackend();
// 		case "jsonl":
// 		case "jsonl-concept":
// 			return new JsonlConceptStoreBackend(target || "./concepts.jsonl");
// 		case "localstorage":
// 		case "localstorage-concept":
// 			return new LocalStorageConceptStoreBackend();
// 		case "indexeddb":
// 		case "indexeddb-concept":
// 			return new IndexedDbConceptStoreBackend(target);
// 		default:
// 			return new MemoryConceptStoreBackend();
// 	}
// }

// function buildExpressionBackend(type: string, target?: string): ExpressionStoreBackend {
// 	switch (type) {
// 		case "memory":
// 		case "memory-expression":
// 			return new MemoryExpressionStoreBackend();
// 		case "jsonl":
// 		case "jsonl-expression":
// 			return new JsonlExpressionStoreBackend(target || "./expressions.jsonl");
// 		case "localstorage":
// 		case "localstorage-expression":
// 			return new LocalStorageExpressionStoreBackend();
// 		case "indexeddb":
// 		case "indexeddb-expression":
// 			return new IndexedDbExpressionStoreBackend(target);
// 		default:
// 			return new MemoryExpressionStoreBackend();
// 	}
// }

// export async function createRepo(config: RepoConfig): Promise<RepoAdapter> {
// 	const adapter: RepoAdapter = {};

// 	if (config.filter) {
// 		const sessionSpec = normalize(config.filter.session);
// 		const persistentSpec = normalize(config.filter.persistent);
// 		if (sessionSpec && persistentSpec && sessionSpec.type === persistentSpec.type && sessionSpec.target === persistentSpec.target) {
// 			const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 			const store = await createFilterStore(backend);
// 			adapter.sessionFilter = store as SessionFilterStore;
// 			adapter.persistentFilter = store as PersistentFilterStore;
// 		} else {
// 			if (sessionSpec) {
// 				const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 				adapter.sessionFilter = await createFilterStore(backend) as SessionFilterStore;
// 			}
// 			if (persistentSpec) {
// 				const backend = buildKvBackend(persistentSpec.type, persistentSpec.target);
// 				adapter.persistentFilter = await createFilterStore(backend) as PersistentFilterStore;
// 			}
// 		}
// 	}

// 	if (config.form) {
// 		const sessionSpec = normalize(config.form.session);
// 		const persistentSpec = normalize(config.form.persistent);
// 		if (sessionSpec && persistentSpec && sessionSpec.type === persistentSpec.type && sessionSpec.target === persistentSpec.target) {
// 			const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 			const store = await createFormStore(backend);
// 			adapter.sessionForm = store as SessionFormStore;
// 			adapter.persistentForm = store as PersistentFormStore;
// 		} else {
// 			if (sessionSpec) {
// 				const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 				adapter.sessionForm = await createFormStore(backend) as SessionFormStore;
// 			}
// 			if (persistentSpec) {
// 				const backend = buildKvBackend(persistentSpec.type, persistentSpec.target);
// 				adapter.persistentForm = await createFormStore(backend) as PersistentFormStore;
// 			}
// 		}
// 	}

// 	if (config.object) {
// 		const sessionSpec = normalize(config.object.session);
// 		const persistentSpec = normalize(config.object.persistent);
// 		if (sessionSpec && persistentSpec && sessionSpec.type === persistentSpec.type && sessionSpec.target === persistentSpec.target) {
// 			const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 			const store = await createObjectStore(backend);
// 			adapter.sessionObject = store as SessionObjectStore;
// 			adapter.persistentObject = store as PersistentObjectStore;
// 		} else {
// 			if (sessionSpec) {
// 				const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 				adapter.sessionObject = await createObjectStore(backend) as SessionObjectStore;
// 			}
// 			if (persistentSpec) {
// 				const backend = buildKvBackend(persistentSpec.type, persistentSpec.target);
// 				adapter.persistentObject = await createObjectStore(backend) as PersistentObjectStore;
// 			}
// 		}
// 	}

// 	if (config.event) {
// 		const sessionSpec = normalize(config.event.session);
// 		const persistentSpec = normalize(config.event.persistent);
// 		if (sessionSpec && persistentSpec && sessionSpec.type === persistentSpec.type && sessionSpec.target === persistentSpec.target) {
// 			const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 			const store = await createEventStore(backend);
// 			adapter.sessionEvent = store as SessionEventStore;
// 			adapter.persistentEvent = store as PersistentEventStore;
// 		} else {
// 			if (sessionSpec) {
// 				const backend = buildKvBackend(sessionSpec.type, sessionSpec.target);
// 				adapter.sessionEvent = await createEventStore(backend) as SessionEventStore;
// 			}
// 			if (persistentSpec) {
// 				const backend = buildKvBackend(persistentSpec.type, persistentSpec.target);
// 				adapter.persistentEvent = await createEventStore(backend) as PersistentEventStore;
// 			}
// 		}
// 	}

// 	if (config.concept) {
// 		const spec = normalize(config.concept);
// 		if (spec) {
// 			const backend = buildConceptBackend(spec.type, spec.target);
// 			adapter.conceptStore = createConceptStore(backend);
// 		}
// 	}

// 	if (config.expression) {
// 		const spec = normalize(config.expression);
// 		if (spec) {
// 			const backend = buildExpressionBackend(spec.type, spec.target);
// 			adapter.persistentExpressionStore = createExpressionStore(backend);
// 		}
// 	}

// 	return adapter;
// }

// export function registerSimpleRepoAdapters(): void {
// }
