import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { AutocompleteSessionStateMapper } from "../src/parser/utils/autocomplete-state-mapper";
import { ProseTemplateSuggester } from "../src/parser/prose-template-suggester";
import type { ParsedItem } from "../src/parser/schema-parsers";
import type { ProseTemplate } from "../src/store/reference/prose-parser-templates/prose-template";

describe("Autocomplete Bridge State Mapper Integration", () => {
	it("maps parsed items into slot state mapping for gating suggestions", async () => {
		// 1. Arrange ProseTemplate configuration
		const template: ProseTemplate = {
			templateId: "tpl_hpi_pain",
			targetSchema: "ObservationEvent",
			sectionPattern: ".+",
			slots: [
				{
					slotName: "symptom",
					slotType: "concept",
					anchorPattern: "pain",
					triggerPattern: "presents with pain",
					targetSchema: "ObservationEvent",
					fieldPath: "concept", // Fallback maps concept display
				},
				{
					slotName: "severity",
					slotType: "attribute",
					anchorPattern: "severe",
					targetSchema: "ObservationEvent",
					fieldPath: "severity",
				},
				{
					slotName: "radiation",
					slotType: "attribute",
					anchorPattern: "radiating",
					targetSchema: "ObservationEvent",
					fieldPath: "radiation",
					conditions: {
						pipeline: [
							{ op: "eq", args: [{ $var: "symptom" }, "Chest Pain"] },
						],
					},
				},
			],
		};

		// 2. Prepare Parsed Items
		const parsedItems: ParsedItem[] = [
			{
				targetSchema: "ObservationEvent",
				tag: "#observation",
				rawText: "#observation Chest Pain",
				concept: [{ conceptId: "SNOMED::423341008", display: "Chest Pain" }],
				attributes: { severity: "moderate" },
				extractedData: { severity: "moderate" },
			},
		];

		// 3. Act: Map parsed items to session filledSlots state
		const filledSlots = AutocompleteSessionStateMapper.mapParsedItemsToSlots(
			parsedItems,
			template,
		);

		// Assert values mapped correctly
		expect(filledSlots.symptom).toBe("Chest Pain");
		expect(filledSlots.severity).toBe("moderate");

		// 4. Verify Autocomplete Suggester honors mapped gates
		const {
			KvProseParserTemplateStore,
		} = require("../src/store/reference/prose-parser-templates/kv-prose-parser-template-store");
		const store = new KvProseParserTemplateStore(new MemoryKvBackend());
		await store.set(template);

		const suggester = new ProseTemplateSuggester(store);

		// Test A: If symptom is Chest Pain, radiation next hint is enabled
		const resultsWithChestPain = await suggester.suggest("presents with pain", {
			personnelId: "user1",
			filledSlots,
		});
		expect(resultsWithChestPain).toHaveLength(1);
		const hintsWithChestPain = resultsWithChestPain[0]!.nextHints ?? [];
		expect(hintsWithChestPain.find((h) => h.slotName === "radiation")).toBeDefined();

		// Test B: If symptom is Headache, radiation hint is gated out
		const resultsWithHeadache = await suggester.suggest("presents with pain", {
			personnelId: "user1",
			filledSlots: { symptom: "Headache" },
		});
		expect(resultsWithHeadache).toHaveLength(1);
		const hintsWithHeadache = resultsWithHeadache[0]!.nextHints ?? [];
		expect(hintsWithHeadache.find((h) => h.slotName === "radiation")).toBeUndefined();
	});
});
