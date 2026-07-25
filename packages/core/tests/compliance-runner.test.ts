import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
	runDictionaryStoreComplianceTests,
	runEventStoreComplianceTests,
	runFormStoreComplianceTests,
	runObjectStoreComplianceTests,
	runStoreComplianceTests,
} from "../src/adapters/storage/compliance";
import {
	clearMockIndexedDB,
	clearMockLocalStorage,
	installBrowserMocks,
} from "../src/adapters/storage/shared/test-mocks";
import {
	type BackendType,
	createRepo,
	type RepoAdapter,
} from "../src/adapters/storage/shared/unified-repo";

type StoreSection = "filter" | "form" | "object" | "event";

const sectionStoreKeys: Record<
	StoreSection,
	[keyof RepoAdapter, keyof RepoAdapter]
> = {
	filter: ["sessionFilter", "persistentFilter"],
	form: ["sessionForm", "persistentForm"],
	object: ["sessionObject", "persistentObject"],
	event: ["sessionEvent", "persistentEvent"],
};

function makePairFactories(
	section: StoreSection,
	type: BackendType,
	target?: string,
): {
	createSessionStore: () => Promise<any>;
	createPersistentStore: () => Promise<any>;
} {
	const [sessionKey, persistentKey] = sectionStoreKeys[section];
	return {
		createSessionStore: async () => {
			const adapter = await createRepo({
				[section]: { session: { type, target }, persistent: { type, target } },
			});
			return adapter[sessionKey];
		},
		createPersistentStore: async () => {
			const adapter = await createRepo({
				[section]: { session: { type, target }, persistent: { type, target } },
			});
			return adapter[persistentKey];
		},
	};
}

function makeDictFactories(
	type: BackendType,
	target?: string,
): {
	createSessionStore: () => Promise<any>;
	createPersistentStore: () => Promise<any>;
} {
	return {
		createSessionStore: async () => {
			const adapter = await createRepo({ concept: { type, target } });
			return adapter.conceptStore;
		},
		createPersistentStore: async () => {
			const adapter = await createRepo({ expression: { type, target } });
			return adapter.persistentExpressionStore;
		},
	};
}

describe("Storage Compliance Test Runner", () => {
	beforeAll(() => {
		installBrowserMocks();
	});

	// 1. Filter Store Compliance
	describe("Filter Store Compliance", () => {
		const jsonlTmpDir = path.resolve(__dirname, "../scratch/compliance-jsonl");
		const jsonlSessPath = path.join(jsonlTmpDir, "session.jsonl");
		const jsonlGlobPath = path.join(jsonlTmpDir, "global.jsonl");
		const sqliteTmpDir = path.resolve(
			__dirname,
			"../scratch/compliance-sqlite",
		);
		const sqliteDbPath = path.join(sqliteTmpDir, "test.db");

		const backends: {
			name: string;
			factories: {
				createSessionStore: () => Promise<any>;
				createPersistentStore: () => Promise<any>;
			};
			setup?: () => void;
			cleanup?: () => void;
		}[] = [
			{
				name: "Memory Store",
				factories: makePairFactories("filter", "memory"),
			},
			{
				name: "JSONL Store",
				factories: makePairFactories("filter", "jsonl", jsonlSessPath),
				setup: () => {
					if (!fs.existsSync(jsonlTmpDir))
						fs.mkdirSync(jsonlTmpDir, { recursive: true });
					if (fs.existsSync(jsonlSessPath)) fs.unlinkSync(jsonlSessPath);
					if (fs.existsSync(jsonlGlobPath)) fs.unlinkSync(jsonlGlobPath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(jsonlSessPath)) fs.unlinkSync(jsonlSessPath);
						if (fs.existsSync(jsonlGlobPath)) fs.unlinkSync(jsonlGlobPath);
						if (fs.existsSync(jsonlTmpDir)) fs.rmdirSync(jsonlTmpDir);
					} catch (_) {}
				},
			},
			{
				name: "SQLite Store",
				factories: makePairFactories("filter", "sqlite", sqliteDbPath),
				setup: () => {
					if (!fs.existsSync(sqliteTmpDir))
						fs.mkdirSync(sqliteTmpDir, { recursive: true });
					if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(sqliteDbPath)) fs.unlinkSync(sqliteDbPath);
					} catch (_) {}
				},
			},
			{
				name: "LocalStorage Store",
				factories: {
					createSessionStore: async () => {
						clearMockLocalStorage();
						const adapter = await createRepo({
							filter: {
								session: { type: "localstorage" },
								persistent: { type: "localstorage" },
							},
						});
						return adapter.sessionFilter;
					},
					createPersistentStore: async () => {
						clearMockLocalStorage();
						const adapter = await createRepo({
							filter: {
								session: { type: "localstorage" },
								persistent: { type: "localstorage" },
							},
						});
						return adapter.persistentFilter;
					},
				},
			},
			{
				name: "IndexedDB Store",
				factories: {
					createSessionStore: async () => {
						clearMockIndexedDB("states", "aliases");
						const adapter = await createRepo({
							filter: {
								session: { type: "indexeddb", target: "test-compliance-db" },
								persistent: { type: "indexeddb", target: "test-compliance-db" },
							},
						});
						return adapter.sessionFilter;
					},
					createPersistentStore: async () => {
						clearMockIndexedDB("states");
						const adapter = await createRepo({
							filter: {
								session: { type: "indexeddb", target: "test-compliance-db" },
								persistent: { type: "indexeddb", target: "test-compliance-db" },
							},
						});
						return adapter.persistentFilter;
					},
				},
			},
		];

		for (const backend of backends) {
			describe(backend.name, () => {
				if (backend.setup) beforeAll(backend.setup);
				if (backend.cleanup) afterAll(backend.cleanup);
				runStoreComplianceTests({
					name: backend.name,
					test,
					expect,
					...backend.factories,
				});
			});
		}
	});

	// 2. Form Store Compliance
	describe("Form Store Compliance", () => {
		const formSessPath = path.resolve(
			__dirname,
			"../scratch/compliance-form-sess.jsonl",
		);
		const formGlobPath = path.resolve(
			__dirname,
			"../scratch/compliance-form-glob.jsonl",
		);
		const formSqlitePath = path.resolve(
			__dirname,
			"../scratch/compliance-form-sqlite.db",
		);

		const backends: {
			name: string;
			factories: {
				createSessionStore: () => Promise<any>;
				createPersistentStore: () => Promise<any>;
			};
			setup?: () => void;
			cleanup?: () => void;
		}[] = [
			{
				name: "Memory Form Store",
				factories: makePairFactories("form", "memory"),
			},
			{
				name: "JSONL Form Store",
				factories: makePairFactories("form", "jsonl", formSessPath),
				setup: () => {
					if (fs.existsSync(formSessPath)) fs.unlinkSync(formSessPath);
					if (fs.existsSync(formGlobPath)) fs.unlinkSync(formGlobPath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(formSessPath)) fs.unlinkSync(formSessPath);
						if (fs.existsSync(formGlobPath)) fs.unlinkSync(formGlobPath);
					} catch (_) {}
				},
			},
			{
				name: "SQLite Form Store",
				factories: makePairFactories("form", "sqlite", formSqlitePath),
				setup: () => {
					const dir = path.dirname(formSqlitePath);
					if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
					if (fs.existsSync(formSqlitePath)) fs.unlinkSync(formSqlitePath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(formSqlitePath)) fs.unlinkSync(formSqlitePath);
					} catch (_) {}
				},
			},
		];

		for (const backend of backends) {
			describe(backend.name, () => {
				if (backend.setup) beforeAll(backend.setup);
				if (backend.cleanup) afterAll(backend.cleanup);
				runFormStoreComplianceTests({
					name: backend.name,
					test,
					expect,
					...backend.factories,
				});
			});
		}
	});

	// 3. Object Store Compliance
	describe("Object Store Compliance", () => {
		const objSessPath = path.resolve(
			__dirname,
			"../scratch/compliance-obj-sess.jsonl",
		);
		const objGlobPath = path.resolve(
			__dirname,
			"../scratch/compliance-obj-glob.jsonl",
		);

		const backends: {
			name: string;
			factories: {
				createSessionStore: () => Promise<any>;
				createPersistentStore: () => Promise<any>;
			};
			setup?: () => void;
			cleanup?: () => void;
		}[] = [
			{
				name: "Memory Object Store",
				factories: makePairFactories("object", "memory"),
			},
			{
				name: "JSONL Object Store",
				factories: makePairFactories("object", "jsonl", objSessPath),
				setup: () => {
					if (fs.existsSync(objSessPath)) fs.unlinkSync(objSessPath);
					if (fs.existsSync(objGlobPath)) fs.unlinkSync(objGlobPath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(objSessPath)) fs.unlinkSync(objSessPath);
						if (fs.existsSync(objGlobPath)) fs.unlinkSync(objGlobPath);
					} catch (_) {}
				},
			},
		];

		for (const backend of backends) {
			describe(backend.name, () => {
				if (backend.setup) beforeAll(backend.setup);
				if (backend.cleanup) afterAll(backend.cleanup);
				runObjectStoreComplianceTests({
					name: backend.name,
					test,
					expect,
					...backend.factories,
				});
			});
		}
	});

	// 4. Event Store Compliance
	describe("Event Store Compliance", () => {
		const evSessPath = path.resolve(
			__dirname,
			"../scratch/compliance-ev-sess.jsonl",
		);
		const evGlobPath = path.resolve(
			__dirname,
			"../scratch/compliance-ev-glob.jsonl",
		);

		const backends: {
			name: string;
			factories: {
				createSessionStore: () => Promise<any>;
				createPersistentStore: () => Promise<any>;
			};
			setup?: () => void;
			cleanup?: () => void;
		}[] = [
			{
				name: "Memory Event Store",
				factories: makePairFactories("event", "memory"),
			},
			{
				name: "JSONL Event Store",
				factories: makePairFactories("event", "jsonl", evSessPath),
				setup: () => {
					if (fs.existsSync(evSessPath)) fs.unlinkSync(evSessPath);
					if (fs.existsSync(evGlobPath)) fs.unlinkSync(evGlobPath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(evSessPath)) fs.unlinkSync(evSessPath);
						if (fs.existsSync(evGlobPath)) fs.unlinkSync(evGlobPath);
					} catch (_) {}
				},
			},
		];

		for (const backend of backends) {
			describe(backend.name, () => {
				if (backend.setup) beforeAll(backend.setup);
				if (backend.cleanup) afterAll(backend.cleanup);
				runEventStoreComplianceTests({
					name: backend.name,
					test,
					expect,
					...backend.factories,
				});
			});
		}
	});

	// 5. Dictionary Store Compliance
	describe("Dictionary Store Compliance", () => {
		const dictSqlitePath = path.resolve(
			__dirname,
			"../scratch/compliance-dict-sqlite.db",
		);
		const dictConceptsPath = path.resolve(
			__dirname,
			"../scratch/compliance-dict-concepts.jsonl",
		);
		const dictExpressionsPath = path.resolve(
			__dirname,
			"../scratch/compliance-dict-expressions.jsonl",
		);

		const backends: {
			name: string;
			factories: {
				createSessionStore: () => Promise<any>;
				createPersistentStore: () => Promise<any>;
			};
			setup?: () => void;
			cleanup?: () => void;
		}[] = [
			{
				name: "Memory Dictionary Store",
				factories: makeDictFactories("memory"),
			},
			{
				name: "SQLite Dictionary Store",
				factories: makeDictFactories("sqlite", dictSqlitePath),
				setup: () => {
					const dir = path.dirname(dictSqlitePath);
					if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
					if (fs.existsSync(dictSqlitePath)) fs.unlinkSync(dictSqlitePath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(dictSqlitePath)) fs.unlinkSync(dictSqlitePath);
					} catch (_) {}
				},
			},
			{
				name: "JSONL Dictionary Store",
				factories: makeDictFactories("jsonl", dictConceptsPath),
				setup: () => {
					const dir = path.dirname(dictConceptsPath);
					if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
					if (fs.existsSync(dictConceptsPath)) fs.unlinkSync(dictConceptsPath);
					if (fs.existsSync(dictExpressionsPath))
						fs.unlinkSync(dictExpressionsPath);
				},
				cleanup: () => {
					try {
						if (fs.existsSync(dictConceptsPath))
							fs.unlinkSync(dictConceptsPath);
						if (fs.existsSync(dictExpressionsPath))
							fs.unlinkSync(dictExpressionsPath);
					} catch (_) {}
				},
			},
			{
				name: "LocalStorage Dictionary Store",
				factories: {
					createSessionStore: async () => {
						clearMockLocalStorage();
						const adapter = await createRepo({
							concept: { type: "localstorage" },
						});
						return adapter.conceptStore;
					},
					createPersistentStore: async () => {
						const adapter = await createRepo({
							expression: { type: "localstorage" },
						});
						return adapter.persistentExpressionStore;
					},
				},
			},
			{
				name: "IndexedDB Dictionary Store",
				factories: {
					createSessionStore: async () => {
						clearMockIndexedDB("concepts", "namespaces");
						const adapter = await createRepo({
							concept: { type: "indexeddb", target: "test_dict_db" },
						});
						return adapter.conceptStore;
					},
					createPersistentStore: async () => {
						const adapter = await createRepo({
							expression: { type: "indexeddb", target: "test_dict_db" },
						});
						return adapter.persistentExpressionStore;
					},
				},
			},
			{
				name: "OPFS Dictionary Store",
				factories: makeDictFactories("opfs", ":memory:"),
			},
		];

		for (const backend of backends) {
			describe(backend.name, () => {
				if (backend.setup) beforeAll(backend.setup);
				if (backend.cleanup) afterAll(backend.cleanup);
				runDictionaryStoreComplianceTests({
					name: backend.name,
					test,
					expect,
					...backend.factories,
				});
			});
		}
	});
});
