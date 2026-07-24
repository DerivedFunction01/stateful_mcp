import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import type { StorageBackend } from "../src/adapters/storage/backend";
import {
	GenericPersistentStore,
	GenericSessionStore,
} from "../src/adapters/storage/generic-store";
import type { PersistedFilterState } from "../src/adapters/storage/interfaces";
import type { StoreConfig } from "../src/adapters/storage/store-config";
import {
	FILTER_CONFIG,
	OBJECT_CONFIG,
	persistentScopeStrategy,
} from "../src/adapters/storage/store-config";
import type { OwnerScope } from "../src/config/types";
import type { FilterState } from "../src/middleware/filter/types";

const TEST_DIR = path.resolve(process.cwd(), "temp_test_generic_store");

/**
 * Concrete implementation of GenericSessionStore for testing.
 */
class TestSessionStore extends GenericSessionStore<FilterState> {
	protected backend: StorageBackend;
	protected config: StoreConfig;

	constructor(backend: StorageBackend, config: StoreConfig) {
		super();
		this.backend = backend;
		this.config = config;
	}

	async get(sessionId: string, id: string): Promise<FilterState | null> {
		const rows = await this.backend.query(
			`SELECT * FROM ${this.config.tableName} WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'`,
			[sessionId, id],
		);
		return rows[0] ?? null;
	}

	async set(sessionId: string, id: string, state: FilterState): Promise<void> {
		await this.backend.exec(
			`INSERT INTO ${this.config.tableName} (session_id, filter_id, scope_level) VALUES (?, ?, 'session')`,
			[sessionId, id],
		);
	}

	async delete(sessionId: string, id: string): Promise<void> {
		await this.backend.exec(
			`DELETE FROM ${this.config.tableName} WHERE session_id = ? AND filter_id = ? AND scope_level = 'session'`,
			[sessionId, id],
		);
	}

	async listSession(sessionId: string): Promise<string[]> {
		const rows = await this.backend.query(
			`SELECT filter_id FROM ${this.config.tableName} WHERE session_id = ? AND scope_level = 'session'`,
			[sessionId],
		);
		return rows.map((r) => r.filter_id);
	}

	async listChildren(sessionId: string, parentId: string): Promise<string[]> {
		const rows = await this.backend.query(
			`SELECT filter_id FROM ${this.config.tableName} WHERE session_id = ? AND parent_filter_id = ? AND scope_level = 'session'`,
			[sessionId, parentId],
		);
		return rows.map((r) => r.filter_id);
	}
}

/**
 * Concrete implementation of GenericPersistentStore for testing.
 */
class TestPersistentStore extends GenericPersistentStore<PersistedFilterState> {
	protected backend: StorageBackend;
	protected config: StoreConfig;

	constructor(backend: StorageBackend, config: StoreConfig) {
		super();
		this.backend = backend;
		this.config = config;
	}

	async get(
		id: string,
		scope: OwnerScope,
	): Promise<PersistedFilterState | null> {
		const rows = await this.backend.query(
			`SELECT * FROM ${this.config.tableName} WHERE filter_id = ? AND scope_level = ?`,
			[id, scope.level],
		);
		return rows[0] ?? null;
	}

	async set(
		id: string,
		state: PersistedFilterState,
		scope: OwnerScope,
	): Promise<void> {
		await this.backend.exec(
			`INSERT INTO ${this.config.tableName} (filter_id, scope_level) VALUES (?, ?)`,
			[id, scope.level],
		);
	}

	async delete(id: string, scope: OwnerScope): Promise<void> {
		await this.backend.exec(
			`DELETE FROM ${this.config.tableName} WHERE filter_id = ? AND scope_level = ?`,
			[id, scope.level],
		);
	}
}

/**
 * Persistent config for tests (uses persistent scope strategy).
 */
const PERSISTENT_FILTER_CONFIG: StoreConfig = {
	...FILTER_CONFIG,
	scope: persistentScopeStrategy(),
};

/**
 * Mock backend for testing that persists data between exec/query.
 */
function createMockBackend(): StorageBackend {
	const tables = new Map<string, Map<string, any>>();

	function getTable(table: string): Map<string, any> {
		if (!tables.has(table)) tables.set(table, new Map());
		return tables.get(table)!;
	}

	return {
		async exec(sql: string, params: any[]) {
			const insertMatch = sql.match(/INSERT OR REPLACE INTO (\w+)/);
			if (insertMatch) {
				const table = insertMatch[1]!;
				const colMatch = sql.match(/\(([^)]+)\)/);
				const cols = colMatch
					? colMatch[1]!.split(",").map((c) => c.trim())
					: [];
				const row: any = {};
				cols.forEach((col, i) => {
					row[col] = params[i];
				});
				const key = cols[0] ? String(row[cols[0]!]) : JSON.stringify(params);
				getTable(table).set(key, row);
			}

			const simpleInsertMatch = sql.match(/INSERT INTO (\w+)/);
			if (simpleInsertMatch && !insertMatch) {
				const table = simpleInsertMatch[1]!;
				const colMatch = sql.match(/\(([^)]+)\)/);
				const cols = colMatch
					? colMatch[1]!.split(",").map((c) => c.trim())
					: [];
				const row: any = {};
				cols.forEach((col, i) => {
					row[col] = params[i];
				});
				const key = cols[0] ? String(row[cols[0]!]) : JSON.stringify(params);
				getTable(table).set(key, row);
			}

			const deleteMatch = sql.match(/DELETE FROM (\w+)/);
			if (deleteMatch) {
				const table = deleteMatch[1]!;
				if (sql.includes("session_id = ?")) {
					const sessionId = String(params[0]);
					const tbl = getTable(table);
					for (const [key, row] of tbl.entries()) {
						if (String(row.session_id) === sessionId) {
							tbl.delete(key);
						}
					}
				} else if (sql.includes("filter_id = ?")) {
					const id = String(params[0]);
					getTable(table).delete(id);
				}
			}
		},
		async query(sql: string, params: any[]) {
			const fromMatch = sql.match(/FROM (\w+)/);
			if (!fromMatch) return [];
			const table = fromMatch[1]!;
			const map = getTable(table);
			const results: any[] = [];

			for (const row of map.values()) {
				if (sql.includes("session_id = ?") && sql.includes("filter_id = ?")) {
					if (
						String(row.session_id) === String(params[0]) &&
						String(row.filter_id) === String(params[1])
					) {
						results.push(row);
					}
				} else if (
					sql.includes("session_id = ?") &&
					sql.includes("scope_level = 'session'")
				) {
					if (String(row.session_id) === String(params[0])) {
						results.push(row);
					}
				} else if (
					sql.includes("filter_id = ?") &&
					sql.includes("scope_level = ?")
				) {
					if (
						String(row.filter_id) === String(params[0]) &&
						String(row.scope_level) === String(params[1])
					) {
						results.push(row);
					}
				} else if (sql.includes("scope_level = ?")) {
					if (String(row.scope_level) === String(params[0])) {
						results.push(row);
					}
				} else {
					results.push(row);
				}
			}

			return results;
		},
		async transaction<T>(fn: () => Promise<T>) {
			return fn();
		},
		coerceRow(row: any) {
			return row;
		},
	};
}

describe("GenericSessionStore", () => {
	let backend: StorageBackend;
	let sessionStore: TestSessionStore;

	beforeAll(() => {
		backend = createMockBackend();
		sessionStore = new TestSessionStore(backend, FILTER_CONFIG);
	});

	test("create should generate an ID with the correct prefix", async () => {
		const id = await sessionStore.create("sess-1", {
			toolName: "test-tool",
			rules: [],
			parentFilterId: undefined,
			combined_operation: undefined,
			combined_ids: undefined,
			schema_snapshot: undefined,
			createdAt: new Date().toISOString(),
			filterId: undefined,
		} as unknown as FilterState);

		expect(id).toMatch(/^filter_/);
		expect(id.length).toBeGreaterThan(8);
	});

	test("create should accept a provided ID", async () => {
		const id = await sessionStore.create("sess-1", {
			filterId: "my-custom-id",
			toolName: "test-tool",
			rules: [],
			parentFilterId: undefined,
			combined_operation: undefined,
			combined_ids: undefined,
			schema_snapshot: undefined,
			createdAt: new Date().toISOString(),
		} as FilterState);

		expect(id).toBe("my-custom-id");
	});

	test("create should set alias when provided", async () => {
		await sessionStore.create(
			"sess-1",
			{
				toolName: "test-tool",
				rules: [],
				parentFilterId: undefined,
				combined_operation: undefined,
				combined_ids: undefined,
				schema_snapshot: undefined,
				createdAt: new Date().toISOString(),
				filterId: undefined,
			} as unknown as FilterState,
			"my-alias",
		);

		const aliasTarget = await sessionStore.getAlias("sess-1", "my-alias");
		expect(aliasTarget).toBeTruthy();
		expect(aliasTarget?.startsWith("filter_")).toBe(true);
	});

	test("getAlias should return null when no alias table configured", async () => {
		const store = new TestSessionStore(backend, {
			...FILTER_CONFIG,
			aliasTable: undefined,
		});
		const result = await store.getAlias("sess-1", "missing");
		expect(result).toBeNull();
	});

	test("expireSession should delete session records", async () => {
		await sessionStore.create("sess-1", {
			toolName: "test",
			rules: [],
			parentFilterId: undefined,
			combined_operation: undefined,
			combined_ids: undefined,
			schema_snapshot: undefined,
			createdAt: new Date().toISOString(),
			filterId: undefined,
		} as unknown as FilterState);

		await sessionStore.expireSession("sess-1");
		const sessionIds = await sessionStore.listSession("sess-1");
		expect(sessionIds).toHaveLength(0);
	});
});

describe("GenericPersistentStore", () => {
	let persistentStore: TestPersistentStore;

	beforeAll(() => {
		const backend = createMockBackend();
		persistentStore = new TestPersistentStore(
			backend,
			PERSISTENT_FILTER_CONFIG,
		);
	});

	test("findByTag should filter by tag from list results", async () => {
		const backend = createMockBackend();

		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, tags) VALUES (?, ?, ?)",
			["f1", "global", '["important"]'],
		);
		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, tags) VALUES (?, ?, ?)",
			["f2", "global", '["draft"]'],
		);

		const store = new TestPersistentStore(backend, PERSISTENT_FILTER_CONFIG);
		const results = await store.findByTag("important", {
			level: "global",
		} as OwnerScope);

		expect(results).toHaveLength(1);
		expect((results[0] as any).tags).toContain("important");
	});

	test("list should filter by user scope", async () => {
		const backend = createMockBackend();

		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, user_id) VALUES (?, ?, ?)",
			["f1", "user", "user-1"],
		);
		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, user_id) VALUES (?, ?, ?)",
			["f2", "user", "user-2"],
		);
		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, user_id) VALUES (?, ?, ?)",
			["f3", "global", null],
		);

		const store = new TestPersistentStore(backend, PERSISTENT_FILTER_CONFIG);
		const results = await store.list({ level: "user", userId: "user-1" }, true);

		expect(results).toHaveLength(2);
		expect(results.find((r) => r.scope.level === "global")).toBeTruthy();
	});

	test("list should exclude global when includeGlobal is false", async () => {
		const backend = createMockBackend();

		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, user_id) VALUES (?, ?, ?)",
			["f1", "user", "user-1"],
		);
		await backend.exec(
			"INSERT INTO filters (filter_id, scope_level, user_id) VALUES (?, ?, ?)",
			["f3", "global", null],
		);

		const store = new TestPersistentStore(backend, PERSISTENT_FILTER_CONFIG);
		const results = await store.list(
			{ level: "user", userId: "user-1" },
			false,
		);

		expect(results).toHaveLength(1);
		expect(results[0]?.scope?.level).toBe("user");
	});
});

describe("StoreConfig", () => {
	test("FILTER_CONFIG should have correct defaults", () => {
		expect(FILTER_CONFIG.idField).toBe("filterId");
		expect(FILTER_CONFIG.idPrefix).toBe("filter_");
		expect(FILTER_CONFIG.tableName).toBe("filters");
		expect(FILTER_CONFIG.getParentId({})).toBeUndefined();
	});

	test("OBJECT_CONFIG should have correct defaults", () => {
		expect(OBJECT_CONFIG.idField).toBe("objectId");
		expect(OBJECT_CONFIG.idPrefix).toBe("obj_");
		expect(OBJECT_CONFIG.tableName).toBe("objects");
		expect(OBJECT_CONFIG.getParentId({})).toBeUndefined();
	});
});

beforeAll(async () => {
	await fs.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
	try {
		await fs.rm(TEST_DIR, { recursive: true, force: true });
	} catch (_) {}
});
