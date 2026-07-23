import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import {
	JsonlEntityStore,
	JsonlSessionEventStore,
	JsonlSessionFilterStore,
	JsonlSessionObjectStore,
	PgEntityStore,
} from "../src";

const TEST_DIR = path.resolve(process.cwd(), "temp_test_jsonl");

describe("JSONL Persistent Storage Adapters", () => {
	afterAll(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch (_) {}
	});

	test("JsonlSessionFilterStore - persistence, rehydration and prune", async () => {
		const filePath = path.join(TEST_DIR, "filter_store.jsonl");
		const store = new JsonlSessionFilterStore(filePath);

		// 1. Create states & aliases
		const filterId = await store.create(
			"session_1",
			{
				parentFilterId: null,
				toolName: "test_tool",
				tableName: "test_table",
				rules: [{ property: "age", operator: "gt", value: 30 }],
				linearDepth: 0,
				gcLock: false,
				createdAt: new Date().toISOString(),
			},
			"main",
		);

		const filterId2 = await store.create(
			"session_1",
			{
				parentFilterId: filterId,
				toolName: "test_tool",
				tableName: "test_table",
				rules: [
					{ property: "age", operator: "gt", value: 30 },
					{ property: "status", operator: "eq", value: "active" },
				],
				linearDepth: 1,
				gcLock: false,
				createdAt: new Date().toISOString(),
			},
			"active_users",
		);

		// Verify aliases list
		const aliases = await store.listAliases("session_1");
		expect(aliases.length).toBe(2);

		// 2. Read raw file lines
		const raw = await fs.readFile(filePath, "utf-8");
		const lines = raw.trim().split("\n");
		expect(lines.length).toBe(4); // 2 states + 2 alias appends

		// 3. Rehydrate a new store instance from same file
		const store2 = new JsonlSessionFilterStore(filePath);
		await store2.init();

		const state = await store2.get("session_1", filterId);
		expect(state).not.toBeNull();
		expect(state!.toolName).toBe("test_tool");

		const aliasVal = await store2.getAlias("session_1", "active_users");
		expect(aliasVal).toBe(filterId2);

		// 4. Prune unused states
		await store2.pruneUnusedStates("session_1", [filterId2]);
		const finalRaw = await fs.readFile(filePath, "utf-8");
		const parsedEntries = finalRaw
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));

		// Pruned state filterId, so only state filterId2 and its aliases survive
		const hasFilterIdState = parsedEntries.some(
			(e) => e.type === "state" && e.data.filterId === filterId,
		);
		const hasFilterId2State = parsedEntries.some(
			(e) => e.type === "state" && e.data.filterId === filterId2,
		);

		expect(hasFilterIdState).toBe(false);
		expect(hasFilterId2State).toBe(true);
	});

	test("JsonlSessionObjectStore - persistence & rehydration", async () => {
		const filePath = path.join(TEST_DIR, "object_store.jsonl");
		const store = new JsonlSessionObjectStore(filePath);

		const objId = await store.create(
			"session_2",
			{
				parentObjectId: null,
				schemaName: "profile",
				data: { username: "alice" },
				linearDepth: 0,
				gcLock: false,
				createdAt: new Date().toISOString(),
			},
			"alice_profile",
		);

		const store2 = new JsonlSessionObjectStore(filePath);
		await store2.init();

		const state = await store2.get("session_2", objId);
		expect(state).not.toBeNull();
		expect(state!.data.username).toBe("alice");

		const alias = await store2.getAlias("session_2", "alice_profile");
		expect(alias).toBe(objId);
	});

	test("JsonlSessionEventStore - persistence & rehydration", async () => {
		const filePath = path.join(TEST_DIR, "event_store.jsonl");
		const store = new JsonlSessionEventStore(filePath);

		const commitId = await store.create(
			"session_3",
			{
				parentCommitId: null,
				sessionId: "session_3",
				operation: "add",
				mutations: [
					{ event_id: "rec_1", type: "add", data: { name: "apple" } },
				],
				linearDepth: 0,
				gcLock: false,
				createdAt: new Date().toISOString(),
			},
			"tip",
		);

		const store2 = new JsonlSessionEventStore(filePath);
		await store2.init();

		const state = await store2.get("session_3", commitId);
		expect(state).not.toBeNull();
		expect(state?.operation).toBe("add");
		expect(state?.mutations?.[0]?.event_id).toBe("rec_1");

		const alias = await store2.getAlias("session_3", "tip");
		expect(alias).toBe(commitId);
	});

	test("JsonlEntityStore - generic CRUD and rehydration", async () => {
		const filePath = path.join(TEST_DIR, "generic_entity_store.jsonl");
		const store = new JsonlEntityStore<{ name: string; age: number }>(filePath);

		// Test set & get
		await store.set("user_1", { name: "Alice", age: 30 });
		const val1 = await store.get("user_1");
		expect(val1).toEqual({ name: "Alice", age: 30 });

		// Test list
		await store.set("user_2", { name: "Bob", age: 25 });
		const list1 = await store.list();
		expect(list1.length).toBe(2);
		expect(list1).toContainEqual({ name: "Alice", age: 30 });
		expect(list1).toContainEqual({ name: "Bob", age: 25 });

		// Test rehydration
		const store2 = new JsonlEntityStore<{ name: string; age: number }>(
			filePath,
		);
		const val2 = await store2.get("user_1");
		expect(val2).toEqual({ name: "Alice", age: 30 });

		// Test delete
		await store2.delete("user_1");
		const val3 = await store2.get("user_1");
		expect(val3).toBeNull();
		const list2 = await store2.list();
		expect(list2.length).toBe(1);
	});

	test("PgEntityStore - generic CRUD using mocked PG Pool", async () => {
		const queries: Array<{ sql: string; params?: any[] }> = [];
		const mockRows: any[] = [];

		const mockPool: any = {
			async connect() {
				return {
					async query(sql: string, params?: any[]) {
						queries.push({ sql, params });
						return { rows: mockRows };
					},
					release() {},
				};
			},
			async query(sql: string, params?: any[]) {
				queries.push({ sql, params });
				return { rows: mockRows };
			},
		};

		const store = new PgEntityStore<{ id: string; name: string }>(
			mockPool,
			"test_entities",
		);

		// Test set
		await store.set("entity_1", { id: "entity_1", name: "Entity One" });
		expect(
			queries.some((q) => q.sql.includes("INSERT INTO test_entities")),
		).toBe(true);

		// Test get
		mockRows.push({ data: { id: "entity_1", name: "Entity One" } });
		const entity = await store.get("entity_1");
		expect(entity).toEqual({ id: "entity_1", name: "Entity One" });
		expect(
			queries.some((q) =>
				q.sql.includes("SELECT data FROM test_entities WHERE id = $1"),
			),
		).toBe(true);

		// Test list
		const list = await store.list();
		expect(list.length).toBe(1);
		expect(
			queries.some((q) => q.sql.includes("SELECT data FROM test_entities")),
		).toBe(true);

		// Test delete
		await store.delete("entity_1");
		expect(
			queries.some((q) =>
				q.sql.includes("DELETE FROM test_entities WHERE id = $1"),
			),
		).toBe(true);
	});
});
