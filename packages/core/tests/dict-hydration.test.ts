import { describe, expect, test } from "bun:test";
import {
	ConceptHydrationResolver,
	type DictionaryStoredRecord,
} from "../src/adapters/storage/sql/dict-hydration";
import type { Concept } from "../src/middleware/dictionary/types";

const concept = (id: string): Concept => ({
	id,
	namespaceCode: "TEST",
	standardCode: id,
	display: id,
	active: true,
});
const stored = (
	value: Concept,
	sourceId: string,
	deadline?: string,
): DictionaryStoredRecord<Concept> => ({
	value,
	sourceId,
	authority: sourceId === "hospital-pg" ? "authoritative" : "derived",
	sourceRevision: "2",
	freshnessDeadline: deadline,
});

describe("dictionary authoritative read-through hydration", () => {
	test("uses fresh local records without querying the authoritative source", async () => {
		let authoritativeCalls = 0;
		const resolver = new ConceptHydrationResolver({
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [
					stored(concept("c1"), "local-sqlite", "2099-01-01T00:00:00Z"),
				],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => {
					authoritativeCalls++;
					return [];
				},
			},
		});
		const result = await resolver.hydrate(["c1"], {
			requireFresh: true,
			now: "2026-01-01T00:00:00Z",
		});
		expect(result.records).toHaveLength(1);
		expect(authoritativeCalls).toBe(0);
	});

	test("falls back in one batch and caches authoritative concepts locally", async () => {
		let requested: string[] = [];
		let cached: string[] = [];
		const resolver = new ConceptHydrationResolver({
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async (ids) => {
					requested = ids;
					return ids.map((id) => stored(concept(id), "hospital-pg"));
				},
			},
			cache: {
				sourceId: "local-sqlite",
				write: async (records) => {
					cached = records.map((record) => record.value.id);
					return { writtenIds: cached, skippedIds: [] };
				},
			},
		});
		const result = await resolver.hydrate(["c1", "c2"], { requireFresh: true });
		expect(requested).toEqual(["c1", "c2"]);
		expect(cached).toEqual(["c1", "c2"]);
		expect(result.records.map((record) => record.id)).toEqual(["c1", "c2"]);
		expect(result.sources).toEqual(["local-sqlite", "hospital-pg"]);
	});

	test("returns authoritative results when a read-only cache skips writes", async () => {
		const result = await new ConceptHydrationResolver({
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => [stored(concept("c1"), "hospital-pg")],
			},
			cache: {
				sourceId: "local-sqlite",
				write: async () => ({ writtenIds: [], skippedIds: ["c1"] }),
			},
		}).hydrate(["c1"]);
		expect(result.records).toHaveLength(1);
		expect(result.cacheWriteSkipped).toBe(true);
		expect(result.degraded).toBe(true);
	});

	test("refreshes stale local records when fresh data is required", async () => {
		let authoritativeCalls = 0;
		const result = await new ConceptHydrationResolver({
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [
					stored(concept("c1"), "local-sqlite", "2020-01-01T00:00:00Z"),
				],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => {
					authoritativeCalls++;
					return [stored(concept("c1"), "hospital-pg", "2099-01-01T00:00:00Z")];
				},
			},
		}).hydrate(["c1"], {
			requireFresh: true,
			now: "2026-01-01T00:00:00Z",
		});
		expect(authoritativeCalls).toBe(1);
		expect(result.sources).toEqual(["local-sqlite", "hospital-pg"]);
		expect(result.staleIds).toEqual(["c1"]);
	});

	test("uses the read-through cache on the next lookup", async () => {
		let localRecords: DictionaryStoredRecord<Concept>[] = [];
		let authoritativeCalls = 0;
		const resolver = new ConceptHydrationResolver({
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => localRecords,
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => {
					authoritativeCalls++;
					return [stored(concept("c1"), "hospital-pg", "2099-01-01T00:00:00Z")];
				},
			},
			cache: {
				sourceId: "local-sqlite",
				write: async (records) => {
					localRecords = records;
					return {
						writtenIds: records.map((record) => record.value.id),
						skippedIds: [],
					};
				},
			},
		});
		await resolver.hydrate(["c1"], {
			requireFresh: true,
			now: "2026-01-01T00:00:00Z",
		});
		const second = await resolver.hydrate(["c1"], {
			requireFresh: true,
			now: "2026-01-01T00:00:00Z",
		});
		expect(authoritativeCalls).toBe(1);
		expect(second.sources).toEqual(["local-sqlite"]);
	});
});
