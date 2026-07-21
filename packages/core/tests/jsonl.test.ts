import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import {
	JsonlSessionEventStore,
	JsonlSessionFilterStore,
	JsonlSessionObjectStore,
} from "../src/adapters/storage/jsonl-repo";

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
});
