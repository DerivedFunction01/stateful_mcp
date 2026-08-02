import { describe, expect, test } from "bun:test";
import { executeDictionaryPlan } from "../src/adapters/storage/sql/dict-executor";
import type { DictionaryHydrationResolver } from "../src/adapters/storage/sql/dict-hydration";
import {
	DictionaryQueryPlanner,
	type DictionaryStorageTopology,
} from "../src/adapters/storage/sql/dict-planner";
import type { Concept } from "../src/middleware/dictionary/types";

const concept = (id: string, active = true): Concept => ({
	id,
	namespaceCode: "TEST",
	standardCode: id,
	display: id,
	active,
});

const topology = (
	conceptConnection: string,
	filterConnection: string,
): DictionaryStorageTopology => ({
	concepts: {
		domain: "concepts",
		backendKind: "sql",
		connectionId: conceptConnection,
		tenantId: "tenant-a",
		dialect: "postgres",
	},
	expressions: {
		domain: "expressions",
		backendKind: "sql",
		connectionId: "pg-expression",
		tenantId: "tenant-a",
		dialect: "postgres",
	},
	filters: {
		domain: "filters",
		backendKind: "sql",
		connectionId: filterConnection,
		tenantId: "tenant-a",
		dialect: "postgres",
	},
});

describe("dictionary execution plans", () => {
	test("batch hydrates concepts after an expression/filter SQL pair", async () => {
		const plan = new DictionaryQueryPlanner().plan(
			topology("pg-concepts", "pg-expression"),
			{
				lookupPrefix: "short",
				roleName: "subjective.qualifier",
			},
		);
		const calls: string[] = [];
		const result = await executeDictionaryPlan(
			plan,
			{ roleName: "subjective.qualifier" },
			{
				sql: {
					query: async () => [{ id: "e1", concept_id: "c1" }],
				},
				concepts: {
					getByIds: async (ids) => {
						calls.push(ids.join(","));
						return [concept("c1")];
					},
				},
			},
		);
		expect(calls).toEqual(["c1"]);
		expect(result.candidates).toHaveLength(1);
		expect(result.filteredCount).toBe(0);
	});

	test("batch filters reject blacklisted candidates without N+1 reads", async () => {
		const plan = new DictionaryQueryPlanner().plan(
			topology("pg-concepts", "pg-filter"),
			{
				lookupPrefix: "short",
				roleName: "subjective.qualifier",
			},
		);
		let filterCalls = 0;
		const result = await executeDictionaryPlan(
			plan,
			{ roleName: "subjective.qualifier" },
			{
				sql: {
					query: async () => [
						{ id: "e1", concept_id: "c1" },
						{ id: "e2", concept_id: "c2" },
					],
				},
				concepts: { getByIds: async () => [concept("c1"), concept("c2")] },
				filters: {
					listForConceptRoleBatch: async (ids) => {
						filterCalls++;
						return new Map([
							[
								ids[0]!,
								[
									{
										filterId: "deny",
										conceptId: ids[0]!,
										policy: "blacklist",
										roleName: "subjective.qualifier",
									},
								],
							],
						]);
					},
				},
			},
		);
		expect(filterCalls).toBe(1);
		expect(result.candidates).toHaveLength(1);
		expect(result.filteredCount).toBe(1);
	});

	test("drops inactive or missing concepts in bounded hydration", async () => {
		const plan = new DictionaryQueryPlanner().plan(
			topology("pg-concepts", "pg-filter"),
			{ lookupPrefix: "short" },
		);
		const result = await executeDictionaryPlan(
			plan,
			{},
			{
				sql: {
					query: async () => [
						{ id: "e1", concept_id: "c1" },
						{ id: "e2", concept_id: "c2" },
					],
				},
				concepts: { getByIds: async () => [concept("c1", false)] },
			},
		);
		expect(result.candidates).toHaveLength(0);
		expect(result.missingConceptCount).toBe(2);
	});

	test("uses the authoritative read-through hydrator for missing local concepts", async () => {
		const plan = new DictionaryQueryPlanner().plan(
			topology("pg-concepts", "pg-filter"),
			{
				lookupPrefix: "short",
			},
		);
		let hydrationCalls = 0;
		const hydrator = {
			hydrate: async (ids: string[]) => {
				hydrationCalls++;
				return {
					records: ids.map((id) => concept(id)),
					missingIds: [],
					staleIds: [],
					sources: ["hospital-pg"],
					cachedIds: ids,
				};
			},
		} as unknown as DictionaryHydrationResolver<Concept>;
		const result = await executeDictionaryPlan(
			plan,
			{},
			{
				sql: { query: async () => [{ id: "e1", concept_id: "c1" }] },
				conceptHydrator: hydrator,
			},
		);
		expect(hydrationCalls).toBe(1);
		expect(result.hydration?.sources).toEqual(["hospital-pg"]);
		expect(result.candidates[0]?.concept?.id).toBe("c1");
	});
});
