import { describe, expect, test } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { CustomExpression } from "@stateful-mcp/core/src/middleware/dictionary/types";
import { CdslParser } from "../src/parser/cdsl-parser";
import type { SharedFieldAnchorRule } from "../src/parser/field-shared/shared-field-anchor";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";
import type { ParserSyntaxProfile } from "../src/store/interfaces";
import { KvSharedFieldAnchorStore } from "../src/store/parser/anchors/kv-shared-field-anchor-store";
import { SqlSharedFieldAnchorStore } from "../src/store/parser/anchors/sql-shared-field-anchor-store";

function makeDictionaryStore() {
	return new DictionaryStore(
		new InMemoryConceptResolver(),
		createMemoryConceptStore(),
		createMemoryExpressionStore(),
	);
}

async function seedTestConcepts(dictionaryStore: DictionaryStore) {
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
			id: "1",
		},
	];
	for (const expr of expressions) await dictionaryStore.addExpression(expr);
}

describe("Shared Field Anchor Stores", () => {
	test("KV Store CRUD operations", async () => {
		const backend = new MemoryKvBackend();
		const store = new KvSharedFieldAnchorStore(backend);

		const rule: SharedFieldAnchorRule = {
			ruleId: "rule-1",
			targetSchema: "ObservationEvent",
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: "dateRange",
					relation: "duration",
				},
			],
			workspaceId: "ws-1",
			personnelId: "user-1",
		};

		await store.set(rule);
		const got = await store.get("rule-1");
		expect(got).not.toBeNull();
		expect(got!.targetSchema).toBe("ObservationEvent");
		expect(got!.anchors.length).toBe(1);

		const bySchema = await store.listBySchema("ObservationEvent");
		expect(bySchema.length).toBe(1);

		const byContext = await store.listForContext({
			workspaceId: "ws-1",
			personnelId: "user-1",
		});
		expect(byContext.length).toBe(1);

		await store.delete("rule-1");
		const gotAfterDelete = await store.get("rule-1");
		expect(gotAfterDelete).toBeNull();
	});

	test("SQL Store CRUD operations", async () => {
		const backend = await SqlBackend.connect("sqlite", ":memory:");
		const executor = new SqlExecutor(backend);
		const store = new SqlSharedFieldAnchorStore("sqlite", executor);

		const rule: SharedFieldAnchorRule = {
			ruleId: "rule-2",
			targetSchema: "ObservationEvent",
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: "dateRange",
					relation: "duration",
				},
			],
			workspaceId: "ws-2",
			personnelId: "user-2",
		};

		// SQLite connection is async and ensureTable runs in constructor
		await new Promise((r) => setTimeout(r, 50));

		await store.set(rule);
		const got = await store.get("rule-2");
		expect(got).not.toBeNull();
		expect(got!.targetSchema).toBe("ObservationEvent");
		expect(got!.anchors.length).toBe(1);

		const bySchema = await store.listBySchema("ObservationEvent");
		expect(bySchema.length).toBe(1);

		await store.delete("rule-2");
		const gotAfterDelete = await store.get("rule-2");
		expect(gotAfterDelete).toBeNull();
	});
});

describe("CdslParser Shared Field Anchoring Enrichment", () => {
	test("anchors a date range to an observation event based on proximity", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "test-anchoring-profile",
			personnelId: "test-user",
			isDefault: true,
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
		};

		const kvBackend = new MemoryKvBackend();
		const anchorStore = new KvSharedFieldAnchorStore(kvBackend);

		// Rule: Map ClinicalDateRange to ObservationEvent.dateRange
		await anchorStore.set({
			ruleId: "obs-date-anchor",
			targetSchema: "ObservationEvent",
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: "dateRange",
					relation: "duration",
					distance: {
						maxRight: 3,
						unit: "items",
					},
				},
			],
		});

		const parser = new CdslParser(
			ds,
			profile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			anchorStore,
		);

		// Parse observation + date range
		const parsed = await parser.parse(
			"#observation fever || #clinicaldaterange 3 weeks ago",
		);

		// The dateRange item should be filtered out from the main return because it is anchored
		expect(parsed.length).toBe(1);

		const obs = parsed[0]!;
		expect(obs).toBeDefined();
		expect(obs.targetSchema).toBe("ObservationEvent");
		expect(obs.extractedData.dateRange).toBeDefined();
		expect(obs.extractedData.dateRange.relativeEstimate).toBeDefined();
	});

	test("does not anchor date range if anchorPattern does not match", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "test-anchoring-profile",
			personnelId: "test-user",
			isDefault: true,
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
		};

		const kvBackend = new MemoryKvBackend();
		const anchorStore = new KvSharedFieldAnchorStore(kvBackend);

		await anchorStore.set({
			ruleId: "obs-date-anchor-pattern",
			targetSchema: "ObservationEvent",
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: "dateRange",
					relation: "duration",
					anchorPattern: "\\bfor\\b", // only anchors if "for" is in the gap
					distance: {
						maxRight: 3,
						unit: "items",
					},
				},
			],
		});

		const parser = new CdslParser(
			ds,
			profile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			anchorStore,
		);

		// gap contains "||", not "for"
		const parsed = await parser.parse(
			"#observation fever || #clinicaldaterange 3 weeks ago",
		);

		// Both items are returned because the anchor failed (gap text did not match "for")
		expect(parsed.length).toBe(2);

		const obs = parsed.find(
			(item) => item.targetSchema === "ObservationEvent",
		)!;
		expect(obs).toBeDefined();
		expect(obs.extractedData.dateRange).toBeUndefined();
	});

	test("evaluates conditional pipelines during anchoring", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "test-anchoring-profile",
			personnelId: "test-user",
			isDefault: true,
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
		};

		const kvBackend = new MemoryKvBackend();
		const anchorStore = new KvSharedFieldAnchorStore(kvBackend);

		await anchorStore.set({
			ruleId: "obs-date-conditional",
			targetSchema: "ObservationEvent",
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: "dateRange",
					relation: "duration",
					distance: {
						maxRight: 3,
						unit: "items",
					},
					condition: {
						pipeline: [
							// Only allow if source.relativeEstimate.direction is "retrospective"
							{
								op: "get",
								args: [{ $init: "source" }, "relativeEstimate", "direction"],
								return_var: "dir",
							},
							{
								op: "eq",
								args: [{ $var: "dir" }, "retrospective"],
							},
						],
					},
				},
			],
		});

		const parser = new CdslParser(
			ds,
			profile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			anchorStore,
		);

		// Test 1: past date -> should anchor
		const parsedPast = await parser.parse(
			"#observation fever || #clinicaldaterange 3 weeks ago",
		);
		expect(parsedPast.length).toBe(1);
		expect(parsedPast[0]!.extractedData.dateRange).toBeDefined();

		// Test 2: future date -> should NOT anchor
		const parsedFuture = await parser.parse(
			"#observation fever || #clinicaldaterange in 1 week",
		);
		expect(parsedFuture.length).toBe(2);
		const obsFuture = parsedFuture.find(
			(item) => item.targetSchema === "ObservationEvent",
		)!;
		expect(obsFuture).toBeDefined();
		expect(obsFuture.extractedData.dateRange).toBeUndefined();
	});

	test("respects sentence boundaries and does not cross periods by default", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const profile: ParserSyntaxProfile = {
			...(SEED_PARSER_PROFILES.find((p) => p.profileId === "default") ??
				SEED_PARSER_PROFILES[0]),
			profileId: "test-boundary-profile",
			personnelId: "test-user",
			isDefault: true,
			boundaryDelimiter: "\\.",
			transitionalWords: ["also", "and", "then"],
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
		};

		const kvBackend = new MemoryKvBackend();
		const anchorStore = new KvSharedFieldAnchorStore(kvBackend);

		// Rule: Map ClinicalDateRange to ObservationEvent.dateRange
		await anchorStore.set({
			ruleId: "obs-date-boundary",
			targetSchema: "ObservationEvent",
			anchors: [
				{
					source: "ClinicalDateRange",
					targetField: "dateRange",
					relation: "duration",
					distance: {
						maxLeft: 5,
						maxRight: 5,
						unit: "words",
						// crossBoundaries: false is default
					},
				},
			],
		});

		const parser = new CdslParser(
			ds,
			profile,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			anchorStore,
		);

		// Sentence structure:
		// "Person has fever. Since yesterday, also have fever."
		const parsed = await parser.parse(
			"#observation fever || . || #clinicaldaterange 1 day ago || #observation fever",
		);
		// Note: The input has "fever. || 1 day ago". The gap text is ". || 1 day ago".
		// We want the delimiter to match "\.\s+[A-Z]" so we need:
		// "#observation fever. || #clinicaldaterange 1 day ago" -> gap is ". || #clinicaldaterange 1 day ago"
		// The tag "#clinicaldaterange" starts with a non-capital letter, so let's adjust the test boundary regex or the test string so it matches.
		// Let's modify the profile boundaryDelimiter in this test to match "fever." followed by split separators.
		// Actually, let's use:
		// boundaryDelimiter: "\\." (just a period) to make it language and capitalization independent.
		// That is much simpler and more robust!

		// Let's inspect the parsed items
		expect(parsed.length).toBe(2); // The anchored dateRange item should be filtered out

		const firstFever = parsed[0]!;
		const secondFever = parsed[1]!;

		expect(firstFever).toBeDefined();
		expect(secondFever).toBeDefined();

		expect(firstFever.extractedData.dateRange).toBeUndefined();
		expect(secondFever.extractedData.dateRange).toBeDefined();
	});
});

