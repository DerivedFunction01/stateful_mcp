import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
	IndexedDbConceptStore,
	IndexedDbPersistentExpressionStore,
	IndexedDbPersistentStore,
	IndexedDbSessionStore,
	LocalStorageConceptStore,
	LocalStoragePersistentExpressionStore,
	LocalStoragePersistentStore,
	LocalStorageSessionStore,
} from "../src/adapters/storage/browser-repo";
import {
	runDictionaryStoreComplianceTests,
	runEventStoreComplianceTests,
	runFormStoreComplianceTests,
	runObjectStoreComplianceTests,
	runStoreComplianceTests,
} from "../src/adapters/storage/compliance";
import {
	JsonlConceptStore,
	JsonlPersistentEventStore,
	JsonlPersistentExpressionStore,
	JsonlPersistentFilterStore,
	JsonlPersistentFormStore,
	JsonlPersistentObjectStore,
	JsonlSessionEventStore,
	JsonlSessionFilterStore,
	JsonlSessionFormStore,
	JsonlSessionObjectStore,
} from "../src/adapters/storage/jsonl-repo";
import {
	MemoryPersistentEventStore,
	MemoryPersistentFilterStore,
	MemoryPersistentFormStore,
	MemoryPersistentObjectStore,
	MemorySessionEventStore,
	MemorySessionFilterStore,
	MemorySessionFormStore,
	MemorySessionObjectStore,
} from "../src/adapters/storage/memory-repo";
import {
	OpfsConceptStore,
	OpfsPersistentExpressionStore,
} from "../src/adapters/storage/opfs-repo";
import {
	SqliteConceptStore,
	SqliteFilterStore,
	SqliteFormStore,
	SqlitePersistentExpressionStore,
} from "../src/adapters/storage/sqlite-repo";
import {
	InMemoryConceptStore,
	InMemoryPersistentExpressionStore,
} from "../src/middleware/dictionary/store";

// Mock global browser variables for browser store tests
const mockLocalStorage: any = {
	store: new Map<string, string>(),
	getItem(key: string) {
		return this.store.get(key) || null;
	},
	setItem(key: string, value: string) {
		this.store.set(key, value);
	},
	removeItem(key: string) {
		this.store.delete(key);
	},
	key(index: number) {
		return Array.from(this.store.keys())[index] || null;
	},
	get length() {
		return this.store.size;
	},
};

const mockIndexedDBStore = new Map<string, Map<string, any>>();
mockIndexedDBStore.set("states", new Map());
mockIndexedDBStore.set("aliases", new Map());
mockIndexedDBStore.set("concepts", new Map());
mockIndexedDBStore.set("namespaces", new Map());
mockIndexedDBStore.set("expressions", new Map());

const mockIndexedDB: any = {
	open(dbName: string) {
		const dbResult = {
			objectStoreNames: {
				contains(name: string) {
					return true;
				},
			},
			transaction(storeName: string, mode: string) {
				const storeMap = mockIndexedDBStore.get(storeName)!;
				return {
					objectStore() {
						return {
							get(key: string) {
								const req: any = {};
								setTimeout(() => {
									req.result = storeMap.get(key);
									if (req.onsuccess) req.onsuccess();
								}, 0);
								return req;
							},
							put(value: any, key: string) {
								const req: any = {};
								setTimeout(() => {
									storeMap.set(key, value);
									if (req.onsuccess) req.onsuccess();
								}, 0);
								return req;
							},
							delete(key: string) {
								const req: any = {};
								setTimeout(() => {
									storeMap.delete(key);
									if (req.onsuccess) req.onsuccess();
								}, 0);
								return req;
							},
							getAllKeys() {
								const req: any = {};
								setTimeout(() => {
									req.result = Array.from(storeMap.keys());
									if (req.onsuccess) req.onsuccess();
								}, 0);
								return req;
							},
							getAll() {
								const req: any = {};
								setTimeout(() => {
									req.result = Array.from(storeMap.values());
									if (req.onsuccess) req.onsuccess();
								}, 0);
								return req;
							},
							openCursor() {
								const req: any = {};
								const keys = Array.from(storeMap.keys());
								const values = Array.from(storeMap.values());
								let idx = 0;
								setTimeout(() => {
									const trigger = () => {
										if (idx < keys.length) {
											req.result = {
												key: keys[idx],
												value: values[idx],
												continue() {
													idx++;
													trigger();
												},
											};
											if (req.onsuccess) {
												req.onsuccess({ target: { result: req.result } });
											}
										} else {
											req.result = null;
											if (req.onsuccess) {
												req.onsuccess({ target: { result: null } });
											}
										}
									};
									trigger();
								}, 0);
								return req;
							},
						};
					},
				};
			},
		};
		const request: any = {
			result: dbResult,
		};
		setTimeout(() => {
			if (request.onsuccess) request.onsuccess();
		}, 0);
		return request;
	},
};

describe("Storage Compliance Test Runner", () => {
	beforeAll(() => {
		(globalThis as any).window = {
			localStorage: mockLocalStorage,
			indexedDB: mockIndexedDB,
		};
	});

	// 1. Memory Repo Compliance
	describe("Memory Store", () => {
		runStoreComplianceTests({
			name: "Memory Store",
			test,
			expect,
			createSessionStore: async () => new MemorySessionFilterStore(),
			createPersistentStore: async () => new MemoryPersistentFilterStore(),
		});
	});

	// 2. JSONL Repo Compliance
	describe("JSONL Store", () => {
		const tmpDir = path.resolve(__dirname, "../scratch/compliance-jsonl");
		if (!fs.existsSync(tmpDir)) {
			fs.mkdirSync(tmpDir, { recursive: true });
		}
		const sessPath = path.join(tmpDir, "session.jsonl");
		const globPath = path.join(tmpDir, "global.jsonl");

		afterAll(() => {
			try {
				if (fs.existsSync(sessPath)) fs.unlinkSync(sessPath);
				if (fs.existsSync(globPath)) fs.unlinkSync(globPath);
				if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
			} catch (_) {}
		});

		runStoreComplianceTests({
			name: "JSONL Store",
			test,
			expect,
			createSessionStore: async () => {
				if (fs.existsSync(sessPath)) fs.unlinkSync(sessPath);
				return new JsonlSessionFilterStore(sessPath);
			},
			createPersistentStore: async () => {
				if (fs.existsSync(globPath)) fs.unlinkSync(globPath);
				return new JsonlPersistentFilterStore(globPath);
			},
		});
	});

	// 3. SQLite Repo Compliance
	describe("SQLite Store", () => {
		const tmpDir = path.resolve(__dirname, "../scratch/compliance-sqlite");
		if (!fs.existsSync(tmpDir)) {
			fs.mkdirSync(tmpDir, { recursive: true });
		}
		const dbPath = path.join(tmpDir, "test.db");

		afterAll(() => {
			try {
				if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
				if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
			} catch (_) {}
		});

		runStoreComplianceTests({
			name: "SQLite Store",
			test,
			expect,
			createSessionStore: async () => {
				if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
				return new SqliteFilterStore(dbPath);
			},
			createPersistentStore: async () => {
				return new SqliteFilterStore(dbPath);
			},
		});
	});

	// 4. LocalStorage Repo Compliance
	describe("LocalStorage Store", () => {
		runStoreComplianceTests({
			name: "LocalStorage Store",
			test,
			expect,
			createSessionStore: async () => {
				mockLocalStorage.store.clear();
				return new LocalStorageSessionStore();
			},
			createPersistentStore: async () => {
				mockLocalStorage.store.clear();
				return new LocalStoragePersistentStore();
			},
		});
	});

	// 5. IndexedDB Repo Compliance
	describe("IndexedDB Store", () => {
		runStoreComplianceTests({
			name: "IndexedDB Store",
			test,
			expect,
			createSessionStore: async () => {
				mockIndexedDBStore.get("states")!.clear();
				mockIndexedDBStore.get("aliases")!.clear();
				return new IndexedDbSessionStore("test-compliance-db");
			},
			createPersistentStore: async () => {
				mockIndexedDBStore.get("states")!.clear();
				return new IndexedDbPersistentStore("test-compliance-db");
			},
		});
	});

	// 6. Specialized Form Store Compliance
	describe("Form Store Compliance", () => {
		describe("Memory Form Store", () => {
			runFormStoreComplianceTests({
				name: "Memory Form Store",
				test,
				expect,
				createSessionStore: async () => new MemorySessionFormStore(),
				createPersistentStore: async () => new MemoryPersistentFormStore(),
			});
		});

		describe("JSONL Form Store", () => {
			const formSess = path.resolve(
				__dirname,
				"../scratch/compliance-form-sess.jsonl",
			);
			const formGlob = path.resolve(
				__dirname,
				"../scratch/compliance-form-glob.jsonl",
			);
			afterAll(() => {
				try {
					if (fs.existsSync(formSess)) fs.unlinkSync(formSess);
					if (fs.existsSync(formGlob)) fs.unlinkSync(formGlob);
				} catch (_) {}
			});
			runFormStoreComplianceTests({
				name: "JSONL Form Store",
				test,
				expect,
				createSessionStore: async () => {
					if (fs.existsSync(formSess)) fs.unlinkSync(formSess);
					return new JsonlSessionFormStore(formSess);
				},
				createPersistentStore: async () => {
					if (fs.existsSync(formGlob)) fs.unlinkSync(formGlob);
					return new JsonlPersistentFormStore(formGlob);
				},
			});
		});

		describe("SQLite Form Store", () => {
			const dbPath = path.resolve(
				__dirname,
				"../scratch/compliance-form-sqlite.db",
			);
			afterAll(() => {
				try {
					if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
				} catch (_) {}
			});
			runFormStoreComplianceTests({
				name: "SQLite Form Store",
				test,
				expect,
				createSessionStore: async () => {
					if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
					return new SqliteFormStore(dbPath);
				},
				createPersistentStore: async () => {
					return new SqliteFormStore(dbPath);
				},
			});
		});
	});

	// 7. Specialized Object Store Compliance
	describe("Object Store Compliance", () => {
		describe("Memory Object Store", () => {
			runObjectStoreComplianceTests({
				name: "Memory Object Store",
				test,
				expect,
				createSessionStore: async () => new MemorySessionObjectStore(),
				createPersistentStore: async () => new MemoryPersistentObjectStore(),
			});
		});

		describe("JSONL Object Store", () => {
			const objSess = path.resolve(
				__dirname,
				"../scratch/compliance-obj-sess.jsonl",
			);
			const objGlob = path.resolve(
				__dirname,
				"../scratch/compliance-obj-glob.jsonl",
			);
			afterAll(() => {
				try {
					if (fs.existsSync(objSess)) fs.unlinkSync(objSess);
					if (fs.existsSync(objGlob)) fs.unlinkSync(objGlob);
				} catch (_) {}
			});
			runObjectStoreComplianceTests({
				name: "JSONL Object Store",
				test,
				expect,
				createSessionStore: async () => {
					if (fs.existsSync(objSess)) fs.unlinkSync(objSess);
					return new JsonlSessionObjectStore(objSess);
				},
				createPersistentStore: async () => {
					if (fs.existsSync(objGlob)) fs.unlinkSync(objGlob);
					return new JsonlPersistentObjectStore(objGlob);
				},
			});
		});
	});

	// 8. Specialized Event Store Compliance
	describe("Event Store Compliance", () => {
		describe("Memory Event Store", () => {
			runEventStoreComplianceTests({
				name: "Memory Event Store",
				test,
				expect,
				createSessionStore: async () => new MemorySessionEventStore(),
				createPersistentStore: async () => new MemoryPersistentEventStore(),
			});
		});

		describe("JSONL Event Store", () => {
			const evSess = path.resolve(
				__dirname,
				"../scratch/compliance-ev-sess.jsonl",
			);
			const evGlob = path.resolve(
				__dirname,
				"../scratch/compliance-ev-glob.jsonl",
			);
			afterAll(() => {
				try {
					if (fs.existsSync(evSess)) fs.unlinkSync(evSess);
					if (fs.existsSync(evGlob)) fs.unlinkSync(evGlob);
				} catch (_) {}
			});
			runEventStoreComplianceTests({
				name: "JSONL Event Store",
				test,
				expect,
				createSessionStore: async () => {
					if (fs.existsSync(evSess)) fs.unlinkSync(evSess);
					return new JsonlSessionEventStore(evSess);
				},
				createPersistentStore: async () => {
					if (fs.existsSync(evGlob)) fs.unlinkSync(evGlob);
					return new JsonlPersistentEventStore(evGlob);
				},
			});
		});
	});

	// 9. Specialized Dictionary Store Compliance
	describe("Dictionary Store Compliance", () => {
		describe("Memory Dictionary Store", () => {
			runDictionaryStoreComplianceTests({
				name: "Memory Dictionary Store",
				test,
				expect,
				createSessionStore: async () => new InMemoryConceptStore(),
				createPersistentStore: async () =>
					new InMemoryPersistentExpressionStore(),
			});
		});

		describe("SQLite Dictionary Store", () => {
			const dbPath = path.resolve(
				__dirname,
				"../scratch/compliance-dict-sqlite.db",
			);
			afterAll(() => {
				try {
					if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
				} catch (_) {}
			});
			runDictionaryStoreComplianceTests({
				name: "SQLite Dictionary Store",
				test,
				expect,
				createSessionStore: async () => {
					if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
					return new SqliteConceptStore(dbPath);
				},
				createPersistentStore: async () => {
					return new SqlitePersistentExpressionStore(dbPath);
				},
			});
		});

		describe("JSONL Dictionary Store", () => {
			const conceptsPath = path.resolve(
				__dirname,
				"../scratch/compliance-dict-concepts.jsonl",
			);
			const expressionsPath = path.resolve(
				__dirname,
				"../scratch/compliance-dict-expressions.jsonl",
			);
			afterAll(() => {
				try {
					if (fs.existsSync(conceptsPath)) fs.unlinkSync(conceptsPath);
					if (fs.existsSync(expressionsPath)) fs.unlinkSync(expressionsPath);
				} catch (_) {}
			});
			runDictionaryStoreComplianceTests({
				name: "JSONL Dictionary Store",
				test,
				expect,
				createSessionStore: async () => {
					if (fs.existsSync(conceptsPath)) fs.unlinkSync(conceptsPath);
					return new JsonlConceptStore(conceptsPath);
				},
				createPersistentStore: async () => {
					if (fs.existsSync(expressionsPath)) fs.unlinkSync(expressionsPath);
					return new JsonlPersistentExpressionStore(expressionsPath);
				},
			});
		});

		describe("LocalStorage Dictionary Store", () => {
			beforeAll(() => {
				mockLocalStorage.store.clear();
			});
			runDictionaryStoreComplianceTests({
				name: "LocalStorage Dictionary Store",
				test,
				expect,
				createSessionStore: async () =>
					new LocalStorageConceptStore("test_dict_concepts:"),
				createPersistentStore: async () =>
					new LocalStoragePersistentExpressionStore("test_dict_expressions:"),
			});
		});

		describe("IndexedDB Dictionary Store", () => {
			beforeAll(() => {
				mockIndexedDBStore.get("concepts")?.clear();
				mockIndexedDBStore.get("namespaces")?.clear();
				mockIndexedDBStore.get("expressions")?.clear();
			});
			runDictionaryStoreComplianceTests({
				name: "IndexedDB Dictionary Store",
				test,
				expect,
				createSessionStore: async () =>
					new IndexedDbConceptStore("test_dict_db"),
				createPersistentStore: async () =>
					new IndexedDbPersistentExpressionStore("test_dict_db"),
			});
		});

		describe("OPFS Dictionary Store", () => {
			runDictionaryStoreComplianceTests({
				name: "OPFS Dictionary Store",
				test,
				expect,
				createSessionStore: async () => new OpfsConceptStore(),
				createPersistentStore: async () => new OpfsPersistentExpressionStore(),
			});
		});
	});
});
