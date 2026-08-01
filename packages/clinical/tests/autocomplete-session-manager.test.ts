import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import type { ParsedItem } from "../src/parser/schema-parsers";
import { AutocompleteSessionManager } from "../src/parser/utils/autocomplete-session-manager";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";
import { KvNgramStore } from "../src/store/learning/autocomplete/kv-ngram-store";
import type { ProseTemplate } from "../src/store/reference/prose-parser-templates/prose-template";

describe("AutocompleteSessionManager", () => {
	function makeParser(): CdslParser {
		const profile = SEED_PARSER_PROFILES.find(
			(p) => p.profileId === "default",
		)!;
		return new CdslParser({
			dictionaryStore: {
				addExpression: async () => {},
				addRelation: async () => {},
				getExpressions: async () => [],
				getRelations: async () => [],
				search: async () => [],
				getAllowedTargetAssignments: () => undefined,
			} as any,
			profile,
		});
	}

	it("returns empty array for empty text without stores", async () => {
		const parser = makeParser();
		const manager = new AutocompleteSessionManager(parser);
		const results = await manager.suggest("");
		expect(results).toEqual([]);
	});

	it("preserves initial session state", () => {
		const parser = makeParser();
		const manager = new AutocompleteSessionManager(
			parser,
			undefined,
			undefined,
			"user1",
		);
		const state = manager.getState();
		expect(state.activeTemplateId).toBeNull();
		expect(state.filledSlots).toEqual({});
		expect(state.recentTargetSchemas).toEqual([]);
	});

	it("selecting a prose suggestion sets activeTemplateId", () => {
		const parser = makeParser();
		const manager = new AutocompleteSessionManager(parser);
		manager.select({
			kind: "prose",
			templateId: "tpl_hpi",
			slotName: "symptom",
			triggerPattern: "presents with",
			insertText: "presents with ",
			cursorOffset: 14,
			rankScore: 0.9,
		});
		const state = manager.getState();
		expect(state.activeTemplateId).toBe("tpl_hpi");
	});

	it("selecting a tag suggestion does not set activeTemplateId", () => {
		const parser = makeParser();
		const manager = new AutocompleteSessionManager(parser);
		manager.select({
			kind: "tag",
			templateId: "command:tag",
			slotName: "observation",
			triggerPattern: "#",
			insertText: "#observation ",
			cursorOffset: 13,
			rankScore: 0.8,
		});
		const state = manager.getState();
		expect(state.activeTemplateId).toBeNull();
	});

	it("resetSession clears all state", () => {
		const parser = makeParser();
		const manager = new AutocompleteSessionManager(parser);
		manager.select({
			kind: "prose",
			templateId: "tpl_hpi",
			slotName: "symptom",
			triggerPattern: "presents with",
			insertText: "presents with ",
			cursorOffset: 14,
			rankScore: 0.9,
		});
		manager.resetSession();
		const state = manager.getState();
		expect(state.activeTemplateId).toBeNull();
		expect(state.filledSlots).toEqual({});
	});

	it("updateFromParse tracks recent schemas", async () => {
		const parser = makeParser();
		const manager = new AutocompleteSessionManager(parser);
		const items: ParsedItem[] = [
			{
				targetSchema: "ObservationEvent",
				tag: "#observation",
				rawText: "Chest Pain",
				concept: [{ conceptId: "SNOMED::123", display: "Chest Pain" }],
				attributes: {},
				extractedData: {},
			},
		];
		await manager.updateFromParse(items);
		const state = manager.getState();
		expect(state.recentTargetSchemas).toEqual(["ObservationEvent"]);
	});

	it("updateFromParse maps template slots to filledSlots", async () => {
		const parser = makeParser();
		const template: ProseTemplate = {
			templateId: "tpl_hpi",
			targetSchema: "ObservationEvent",
			sectionPattern: ".+",
			slots: [
				{
					slotName: "symptom",
					slotType: "concept",
					anchorPattern: "pain",
					targetSchema: "ObservationEvent",
					fieldPath: "concept",
				},
			],
		};
		const { KvProseParserTemplateStore } = await import(
			"../src/store/reference/prose-parser-templates/kv-prose-parser-template-store"
		);
		const { MemoryKvBackend } = await import("@stateful-mcp/core");
		const templateStore = new KvProseParserTemplateStore(new MemoryKvBackend());
		await templateStore.set(template);

		const manager = new AutocompleteSessionManager(parser, templateStore);
		manager.select({
			kind: "prose",
			templateId: "tpl_hpi",
			slotName: "symptom",
			triggerPattern: "presents with",
			insertText: "presents with ",
			cursorOffset: 14,
			rankScore: 0.9,
		});

		const items: ParsedItem[] = [
			{
				targetSchema: "ObservationEvent",
				tag: "#observation",
				rawText: "Chest Pain",
				concept: [{ conceptId: "SNOMED::123", display: "Chest Pain" }],
				attributes: {},
				extractedData: {},
			},
		];
		await manager.updateFromParse(items);
		const state = manager.getState();
		expect(state.filledSlots.symptom).toBe("Chest Pain");
	});

	it("falls back to n-gram suggestions when primary returns empty", async () => {
		const parser = makeParser();
		const ngramStore = new KvNgramStore(new MemoryKvBackend());
		await ngramStore.increment("shoulder pain", 2, "prose");
		await ngramStore.increment("sharp pain", 2, "prose");

		const manager = new AutocompleteSessionManager(
			parser,
			undefined,
			undefined,
			"user1",
			ngramStore,
		);

		const results = await manager.suggest("sh");
		expect(results.length).toBeGreaterThan(0);
		expect(results.every((r) => r.kind === "prose")).toBe(true);
	});

	it("updateFromParse feeds n-grams into store", async () => {
		const parser = makeParser();
		const ngramStore = new KvNgramStore(new MemoryKvBackend());

		const manager = new AutocompleteSessionManager(
			parser,
			undefined,
			undefined,
			"user1",
			ngramStore,
		);

		const items: ParsedItem[] = [
			{
				targetSchema: "ObservationEvent",
				tag: "#observation",
				rawText: "sharp chest pain",
				concept: [{ conceptId: "SNOMED::123", display: "Chest Pain" }],
				attributes: {},
				extractedData: {},
			},
		];
		await manager.updateFromParse(items);

		const results = await ngramStore.suggest("sh");
		expect(results.length).toBeGreaterThan(0);
		// "sharp" should be present as a uni-gram
		expect(results.some((r) => r.ngram === "sharp")).toBe(true);
	});
});
