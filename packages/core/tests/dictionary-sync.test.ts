import { describe, expect, test } from "bun:test";
import {
	InMemoryConceptFilterStore,
	isConceptAllowed,
} from "../src/middleware/dictionary/filters";
import { InMemoryScopedStore } from "../src/storage/scoped-store";

describe("dictionary scope and policy primitives", () => {
	test("isolates sessions and excludes them from sync by default", async () => {
		const store = new InMemoryScopedStore<{ id: string; sessionId?: string }>({
			ttlMs: 60_000,
		});
		await store.set({ id: "x" }, { level: "global" });
		await store.set({ id: "x" }, { level: "global" }, "session-a");
		expect(await store.get("x", { level: "global" })).toEqual({ id: "x" });
		expect(await store.get("x", { level: "global" }, "session-b")).toBeNull();
		expect(
			(await store.syncRecords()).every(
				(record) => !record.payload || !(record.payload as any).sessionId,
			),
		).toBe(true);
	});

	test("allows explicitly configured session synchronization", async () => {
		const store = new InMemoryScopedStore<{ id: string; sessionId?: string }>({
			syncEnabled: true,
		});
		await store.set({ id: "x" }, { level: "global" }, "session-a");
		const records = await store.syncRecords();
		expect(records[0]?.recordId).toBe("session-a:x");
		expect((records[0]!.payload as any).sessionId).toBe("session-a");
	});

	test("blacklists override whitelists", () => {
		expect(
			isConceptAllowed(
				[{ filterId: "w", conceptId: "c", policy: "whitelist", roleName: "r" }],
				"r",
			),
		).toBe(true);
		expect(
			isConceptAllowed(
				[
					{ filterId: "w", conceptId: "c", policy: "whitelist", roleName: "r" },
					{ filterId: "b", conceptId: "c", policy: "blacklist", roleName: "r" },
				],
				"r",
			),
		).toBe(false);
	});

	test("stores concept filters independently", async () => {
		const store = new InMemoryConceptFilterStore();
		await store.set({
			filterId: "f",
			conceptId: "c",
			policy: "whitelist",
			roleName: "r",
		});
		expect(await store.listForConceptRole("c", "r")).toHaveLength(1);
	});
});
