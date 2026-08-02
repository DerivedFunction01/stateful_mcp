import { describe, expect, test } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
} from "@stateful-mcp/core";
import type { CustomExpression } from "@stateful-mcp/core/src/middleware/dictionary/types";
import { CdslParser, type ClinicalParseResult } from "../src/parser/cdsl-parser";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";

async function seedFeverConcept(dictionaryStore: DictionaryStore) {
	const conceptStore = (dictionaryStore as any)["conceptStore"];
	await conceptStore.addNamespace({
		code: "SNOMED",
		description: "SNOMED",
		isPublic: true,
		isExternalPrivate: false,
	});
	await conceptStore.addConcept({
		id: "SNOMED::29857009",
		standardCode: "29857009",
		display: "Fever",
		namespaceCode: "SNOMED",
		active: true,
	});

	const expressions: CustomExpression[] = [
		{
			term: "fever",
			regexPattern: "\\bfever\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
			id: "seed-fever",
		},
	];
	for (const expr of expressions) await dictionaryStore.addExpression(expr);
}

function makeDictionaryStore() {
	return new DictionaryStore(
		new InMemoryConceptResolver(),
		createMemoryConceptStore(),
		createMemoryExpressionStore(),
	);
}

describe("CdslParser detailed parse contract", () => {
	test("parseDetailed returns ClinicalParseResult shape", async () => {
		const profile =
			SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
			SEED_PARSER_PROFILES[0];
		const parser = new CdslParser({
			dictionaryStore: makeDictionaryStore(),
			profile,
		});
		await seedFeverConcept(parser["dictionaryStore"]);

		const result = (await parser.parseDetailed(
			"#observation fever",
		)) as ClinicalParseResult;

		expect(result).toHaveProperty("items");
		expect(result).toHaveProperty("scoredItems");
		expect(Array.isArray(result.items)).toBe(true);
		expect(Array.isArray(result.scoredItems)).toBe(true);
	});

	test("parse wrapper returns only ParsedItem[]", async () => {
		const profile =
			SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
			SEED_PARSER_PROFILES[0];
		const parser = new CdslParser({
			dictionaryStore: makeDictionaryStore(),
			profile,
		});
		await seedFeverConcept(parser["dictionaryStore"]);

		const items = await parser.parse("#observation fever");

		expect(Array.isArray(items)).toBe(true);
		if (items.length > 0) {
			expect(items[0]).toHaveProperty("targetSchema");
		}
	});

	test("parseWithHistoryDetailed returns ClinicalParseResult shape", async () => {
		const profile =
			SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
			SEED_PARSER_PROFILES[0];
		const parser = new CdslParser({
			dictionaryStore: makeDictionaryStore(),
			profile,
		});
		await seedFeverConcept(parser["dictionaryStore"]);

		const result = (await parser.parseWithHistoryDetailed(
			"#observation fever",
		)) as ClinicalParseResult;

		expect(result).toHaveProperty("items");
		expect(result).toHaveProperty("scoredItems");
		expect(Array.isArray(result.items)).toBe(true);
		expect(Array.isArray(result.scoredItems)).toBe(true);
	});

	test("parseWithHistory wrapper returns only ParsedItem[]", async () => {
		const profile =
			SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
			SEED_PARSER_PROFILES[0];
		const parser = new CdslParser({
			dictionaryStore: makeDictionaryStore(),
			profile,
		});
		await seedFeverConcept(parser["dictionaryStore"]);

		const items = await parser.parseWithHistory("#observation fever");

		expect(Array.isArray(items)).toBe(true);
	});

	test("confidence is present when parser produces scored candidates", async () => {
		const profile =
			SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
			SEED_PARSER_PROFILES[0];
		const parser = new CdslParser({
			dictionaryStore: makeDictionaryStore(),
			profile,
		});
		await seedFeverConcept(parser["dictionaryStore"]);

		const result = (await parser.parseDetailed(
			"#observation fever",
		)) as ClinicalParseResult;

		if (result.scoredItems.length > 0) {
			expect(result.confidence).toBeDefined();
			expect(result.confidence?.level).toMatch(/^(high|medium|low)$/);
			expect(typeof result.confidence?.score).toBe("number");
		}
	});

	test("scoredItems preserves candidate and breakdown data", async () => {
		const profile =
			SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
			SEED_PARSER_PROFILES[0];
		const parser = new CdslParser({
			dictionaryStore: makeDictionaryStore(),
			profile,
		});
		await seedFeverConcept(parser["dictionaryStore"]);

		const result = (await parser.parseDetailed(
			"#observation fever",
		)) as ClinicalParseResult;

		for (const scored of result.scoredItems) {
			expect(scored).toHaveProperty("parsedItem");
			expect(scored).toHaveProperty("confidenceScore");
			expect(typeof scored.confidenceScore).toBe("number");
		}
	});
});
