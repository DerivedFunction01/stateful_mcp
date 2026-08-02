import { describe, expect, test } from "bun:test";
import {
	type DictionaryStoredRecord,
	materializeDictionaryBatch,
} from "../src/adapters/storage/sql/dict-hydration";
import type {
	Concept,
	ConceptFilter,
	CustomExpression,
} from "../src/middleware/dictionary/types";

const concept = (id: string): Concept => ({
	id,
	namespaceCode: "TEST",
	standardCode: id,
	display: id,
	active: true,
});
const stored = <T>(value: T): DictionaryStoredRecord<T> => ({
	value,
	sourceId: "hospital-pg",
	authority: "authoritative",
	sourceRevision: "1",
});

describe("dictionary dependency-ordered materialization", () => {
	test("writes concepts before expressions and filters", async () => {
		const order: string[] = [];
		const expression: CustomExpression = {
			id: "e1",
			term: "example",
			regexPattern: "example",
			isCaseInsensitive: true,
			conceptId: "c1",
			priorityWeight: 1,
			active: true,
		};
		const filter: ConceptFilter = {
			filterId: "f1",
			conceptId: "c1",
			policy: "whitelist",
			roleName: "role",
		};
		const result = await materializeDictionaryBatch(
			{
				concepts: [stored(concept("c1"))],
				expressions: [stored(expression)],
				filters: [stored(filter)],
			},
			{
				concepts: {
					sourceId: "local",
					write: async (records) => {
						order.push(`concept:${records[0]!.value.id}`);
						return { writtenIds: ["c1"], skippedIds: [] };
					},
				},
				expressions: {
					sourceId: "local",
					write: async () => {
						order.push("expression:e1");
						return { writtenIds: ["e1"], skippedIds: [] };
					},
				},
				filters: {
					sourceId: "local",
					write: async () => {
						order.push("filter:f1");
						return { writtenIds: ["f1"], skippedIds: [] };
					},
				},
			},
		);
		expect(order).toEqual(["concept:c1", "expression:e1", "filter:f1"]);
		expect(result.unresolvedExpressionIds).toEqual([]);
	});

	test("does not insert dependents when their concept is not in the materialization batch", async () => {
		let expressionWrites = 0;
		const expression: CustomExpression = {
			id: "e1",
			term: "orphan",
			regexPattern: "orphan",
			isCaseInsensitive: true,
			conceptId: "missing",
			priorityWeight: 1,
			active: true,
		};
		const result = await materializeDictionaryBatch(
			{ concepts: [], expressions: [stored(expression)] },
			{
				concepts: {
					sourceId: "local",
					write: async () => ({ writtenIds: [], skippedIds: [] }),
				},
				expressions: {
					sourceId: "local",
					write: async () => {
						expressionWrites++;
						return { writtenIds: ["e1"], skippedIds: [] };
					},
				},
			},
		);
		expect(expressionWrites).toBe(0);
		expect(result.unresolvedExpressionIds).toEqual(["e1"]);
	});
});
