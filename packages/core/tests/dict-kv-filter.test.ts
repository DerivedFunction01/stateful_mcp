import { describe, expect, test } from "bun:test";
import { KvConceptFilterStore } from "../src/adapters/storage/simple/create-concept-filter-store";
import { MemoryKvBackend } from "../src/adapters/storage/simple/memory/backend";
import {
	InMemoryConceptFilterStore,
	isConceptAllowed,
} from "../src/middleware/dictionary/filters";

const whitelist = {
	filterId: "allow",
	conceptId: "c1",
	policy: "whitelist" as const,
	roleName: "role",
};
const blacklist = {
	filterId: "deny",
	conceptId: "c1",
	policy: "blacklist" as const,
	roleName: "role",
};

describe("KV concept filter store", () => {
	test("matches in-memory policy semantics and supports batch lookup", async () => {
		const memory = new InMemoryConceptFilterStore();
		const kv = new KvConceptFilterStore(new MemoryKvBackend());
		await memory.set(whitelist);
		await kv.set(whitelist);
		await memory.set(blacklist);
		await kv.set(blacklist);
		const memoryFilters = await memory.listForConceptRole("c1", "role");
		const kvFilters = await kv.listForConceptRoleBatch(["c1", "c2"], "role");
		expect(kvFilters.get("c1")).toEqual(
			memoryFilters.map((filter) => ({ ...filter, active: true })),
		);
		expect(isConceptAllowed(kvFilters.get("c1")!, "role")).toBe(false);
	});

	test("persists updates and deletes through the KV backend", async () => {
		const backend = new MemoryKvBackend();
		const store = new KvConceptFilterStore(backend);
		await store.set(whitelist);
		expect(await store.get("allow")).toEqual({ ...whitelist, active: true });
		await store.delete("allow");
		expect(await store.get("allow")).toBeNull();
	});
});
