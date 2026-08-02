import { describe, expect, test } from "bun:test";
import { createMemoryExpressionStore } from "../src/adapters/storage/simple/factories";
import { SCHEMA } from "../src/adapters/storage/store-schema";
import { InMemoryConceptResolver } from "../src/middleware/dictionary/resolver";
import type {
	Concept,
	CustomExpression,
} from "../src/middleware/dictionary/types";
import { normalizeLookupTerm } from "../src/middleware/dictionary/types";

const expression = (
	id: string,
	term: string,
	conceptId = "c1",
): CustomExpression => ({
	id,
	term,
	regexPattern: term,
	isCaseInsensitive: true,
	targetAssignment: "MAIN_TERM",
	conceptId,
	priorityWeight: 1,
	active: true,
});

const concept: Concept = {
	id: "c1",
	namespaceCode: "TEST",
	standardCode: "C1",
	display: "Example",
	active: true,
};

describe("dictionary compliance coverage", () => {
	test("normalizes exact and prefix lookup terms deterministically", async () => {
		expect(normalizeLookupTerm("  HEART\u00a0ATTACK ")).toBe("heart attack");
		const store = createMemoryExpressionStore();
		await store.save(expression("e1", "Heart Attack"), { level: "global" });
		const candidates = await store.searchCandidates?.({
			lookupPrefix: "heart",
		});
		expect(candidates?.[0]?.lookupTerm).toBe("heart attack");
	});

	test("does not interpolate untrusted lookup terms into SQL", () => {
		const query = SCHEMA.sqlite.selects.SQL_SEARCH_DICT_EXPRESSIONS!.sql;
		expect(query).toContain("?");
		expect(query).not.toContain("DROP TABLE");
	});

	test("keeps inactive and missing concepts out of executable results", async () => {
		const expressions = [
			expression("e1", "missing", "unknown"),
			expression("e2", "inactive"),
		];
		const inactive: Concept = { ...concept, active: false };
		const result = await new InMemoryConceptResolver().resolve(
			"inactive",
			new Map([[inactive.id, inactive]]),
			expressions,
			[],
		);
		expect(result.status).toBe("NOT_FOUND");
	});

	test("returns freshness and authority metadata for local results", async () => {
		const result = await new InMemoryConceptResolver({
			freshness: "stale",
			authority: "authoritative",
		}).resolve(
			"example",
			new Map([[concept.id, concept]]),
			[expression("e1", "example")],
			[],
		);
		expect(result.results[0]?.freshness).toBe("stale");
		expect(result.results[0]?.authority).toBe("authoritative");
	});
});
