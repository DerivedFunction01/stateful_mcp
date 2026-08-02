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
const record = (
	id: string,
	sourceId: string,
	tenantId?: string,
): DictionaryStoredRecord<Concept> => ({
	value: concept(id),
	sourceId,
	tenantId,
	authority: "derived",
	sourceRevision: "2",
});

describe("dictionary source-key identity policy", () => {
	test("accepts matching authoritative source identity", async () => {
		const result = await new ConceptHydrationResolver({
			identityPolicy: {
				mode: "preserve_source_key",
				sourceId: "hospital-pg",
				tenantId: "tenant-a",
			},
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [record("c1", "hospital-pg", "tenant-a")],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => [],
			},
		}).hydrate(["c1"], { tenantId: "tenant-a" });
		expect(result.records[0]?.id).toBe("c1");
		expect(result.identityConflicts).toEqual([]);
	});

	test("rejects same-key records from another source", async () => {
		const result = await new ConceptHydrationResolver({
			identityPolicy: {
				mode: "preserve_source_key",
				sourceId: "hospital-pg",
				rejectCollisions: true,
			},
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [record("c1", "other-source")],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => [record("c1", "hospital-pg")],
			},
		}).hydrate(["c1"], { requireFresh: true });
		expect(result.records).toHaveLength(0);
		expect(result.identityConflicts).toEqual(["c1"]);
	});

	test("rejects records from another tenant", async () => {
		const result = await new ConceptHydrationResolver({
			identityPolicy: {
				mode: "preserve_source_key",
				sourceId: "hospital-pg",
				tenantId: "tenant-a",
			},
			local: {
				sourceId: "local-sqlite",
				authority: "derived",
				getByIds: async () => [],
			},
			authoritative: {
				sourceId: "hospital-pg",
				authority: "authoritative",
				getByIds: async () => [record("c1", "hospital-pg", "tenant-b")],
			},
		}).hydrate(["c1"], { tenantId: "tenant-a" });
		expect(result.records).toHaveLength(0);
		expect(result.missingIds).toEqual(["c1"]);
	});
});
