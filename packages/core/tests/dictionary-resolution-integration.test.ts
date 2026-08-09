import { describe, expect, test } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
} from "../src/adapters/storage/simple/factories";
import { InMemoryConceptFilterStore } from "../src/middleware/dictionary/filters";
import type { DictionarySource } from "../src/middleware/dictionary/interfaces";
import { InMemoryConceptResolver } from "../src/middleware/dictionary/resolver";
import type {
	Concept,
	CustomExpression,
} from "../src/middleware/dictionary/types";

const concept: Concept = {
	id: "c1",
	namespaceCode: "LOCAL",
	standardCode: "C1",
	display: "Example",
	active: true,
};

const expression: CustomExpression = {
	id: "e1",
	term: "example",
	regexPattern: "\\bexample\\b",
	isCaseInsensitive: true,
	conceptId: "c1",
	priorityWeight: 1,
	active: true,
};

describe("dictionary resolver integration", () => {
	test("applies concept filters and batch hydrates concepts", async () => {
		const concepts = createMemoryConceptStore();
		const expressions = createMemoryExpressionStore();
		await concepts.addConcept(concept);
		await expressions.save(expression, { level: "global" });
		const filters = new InMemoryConceptFilterStore();
		await filters.set({
			filterId: "deny",
			conceptId: "c1",
			policy: "blacklist",
			roleName: "ObservationEvent.concept",
		});
		const result = await new InMemoryConceptResolver({
			filterStore: filters,
			filterRole: "ObservationEvent.concept",
		}).resolve("example", concepts, expressions, []);
		expect(result.status).toBe("NOT_FOUND");
	});

	test("shares expressions while whitelisting concepts by role", async () => {
		const concepts = createMemoryConceptStore();
		const expressions = createMemoryExpressionStore();
		await concepts.addConcept(concept);
		await expressions.save(expression, { level: "global" });
		const filters = new InMemoryConceptFilterStore();
		await filters.set({
			filterId: "allow",
			conceptId: "c1",
			policy: "whitelist",
			roleName: "ObservationEvent.concept",
		});

		const result = await new InMemoryConceptResolver({
			filterStore: filters,
			filterRole: "ObservationEvent.concept",
		}).resolve("example", concepts, expressions, []);

		expect(result.status).toBe("FOUND");
		expect(result.results[0]?.conceptId).toBe("c1");
	});

	test("falls back to a dictionary source on local miss", async () => {
		const remote: DictionarySource = {
			lookup: async () => [
				{
					concept,
					expression,
					score: 10,
					matchKind: "exact",
					sourceId: "remote",
				},
			],
		};
		const result = await new InMemoryConceptResolver({
			source: remote,
			sourceId: "remote",
		}).resolve("example", new Map(), [], []);
		expect(result.status).toBe("FOUND");
		expect(result.results[0]?.conceptId).toBe("c1");
	});
});
