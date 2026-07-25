import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { createRepo } from "../src/adapters/storage/shared/unified-repo";
import type { EventCommit } from "../src/middleware/event/types";
import type { FilterState } from "../src/middleware/filter/types";
import type { ObjectState } from "../src/middleware/object/types";

const TEST_DIR = path.resolve(process.cwd(), "temp_test_jsonl");

describe("JSONL Persistent Storage Adapters", () => {
	afterAll(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch (_) {}
	});

	test("JsonlSessionFilterStore - persistence, rehydration and prune", async () => {
		const backing = path.join(TEST_DIR, "filter_store");

		const adapter1 = await createRepo({
			filter: {
				session: { type: "jsonl", target: backing },
				persistent: { type: "memory" },
			},
		});
		const store1 = adapter1.sessionFilter!;

		const filterId = await store1.create(
			"session_1",
			{
				parentFilterId: null,
				toolName: "test_tool",
				tableName: "test_table",
				rules: [{ property: "age", operator: "gt", value: 30 }],
				linearDepth: 0,
				gcLock: false,
				createdAt: new Date().toISOString(),
			} as FilterState,
			"main",
		);

		const filterId2 = await store1.create(
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
			} as FilterState,
			"active_users",
		);

		const aliases = await store1.listAliases("session_1");
		expect(aliases.length).toBe(2);

		// Rehydrate from the same file (buildKvBackend appends -session.jsonl)
		const adapter2 = await createRepo({
			filter: {
				session: { type: "jsonl", target: backing },
				persistent: { type: "memory" },
			},
		});
		const store2 = adapter2.sessionFilter!;

		const state = await store2.get("session_1", filterId);
		expect(state).not.toBeNull();
		expect(state!.toolName).toBe("test_tool");

		const aliasVal = await store2.getAlias("session_1", "active_users");
		expect(aliasVal).toBe(filterId2);
	});

	test("JsonlSessionObjectStore - persistence & rehydration", async () => {
		const backing = path.join(TEST_DIR, "object_store");

		const adapter1 = await createRepo({
			object: {
				session: { type: "jsonl", target: backing },
				persistent: { type: "memory" },
			},
		});
		const store1 = adapter1.sessionObject!;

		const objId = await store1.create(
			"session_2",
			{
				objectId: "obj_1",
				parentObjectId: null,
				schemaName: "profile",
				data: { username: "alice" },
				linearDepth: 0,
				gcLock: false,
				createdAt: new Date().toISOString(),
			} as ObjectState,
			"alice_profile",
		);

		const adapter2 = await createRepo({
			object: {
				session: { type: "jsonl", target: backing },
				persistent: { type: "memory" },
			},
		});
		const store2 = adapter2.sessionObject!;

		const state = await store2.get("session_2", objId);
		expect(state).not.toBeNull();
		expect(state!.data.username).toBe("alice");

		const alias = await store2.getAlias("session_2", "alice_profile");
		expect(alias).toBe(objId);
	});

	test("JsonlSessionEventStore - persistence & rehydration", async () => {
		const backing = path.join(TEST_DIR, "event_store");

		const adapter1 = await createRepo({
			event: {
				session: { type: "jsonl", target: backing },
				persistent: { type: "memory" },
			},
		});
		const store1 = adapter1.sessionEvent!;

		const commitId = await store1.create(
			"session_3",
			{
				commitId: "commit_1",
				parentCommitId: null,
				sessionId: "session_3",
				operation: "add",
				mutations: [
					{ event_id: "rec_1", type: "add", data: { name: "apple" } },
				],
				linearDepth: 0,
				gcLock: false,
				createdAt: new Date().toISOString(),
			} as EventCommit,
			"tip",
		);

		const adapter2 = await createRepo({
			event: {
				session: { type: "jsonl", target: backing },
				persistent: { type: "memory" },
			},
		});
		const store2 = adapter2.sessionEvent!;

		const state = await store2.get("session_3", commitId);
		expect(state).not.toBeNull();
		expect(state?.operation).toBe("add");
		expect(state?.mutations?.[0]?.event_id).toBe("rec_1");

		const alias = await store2.getAlias("session_3", "tip");
		expect(alias).toBe(commitId);
	});
});
