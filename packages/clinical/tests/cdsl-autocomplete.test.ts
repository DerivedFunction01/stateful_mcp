import { describe, expect, it } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";
import type {
	ProseParserTemplateStore,
	ProseTemplate,
	StopWordContext,
} from "../src/store/interfaces";

function makeDictionaryStore() {
	return new (require("@stateful-mcp/core").DictionaryStore)(
		new InMemoryConceptResolver(),
		createMemoryConceptStore(),
		createMemoryExpressionStore(),
	);
}

async function seedTestConcepts(dictionaryStore: DictionaryStore) {
	await dictionaryStore.addNamespace({
		code: "SNOMED",
		description: "SNOMED",
		isPublic: true,
		isExternalPrivate: false,
	});
	await dictionaryStore.addConcept({
		id: "SNOMED::29857009",
		standardCode: "29857009",
		display: "Fever",
		namespaceCode: "SNOMED",
		active: true,
	});
}

function makeKvTemplateStore(backend: any): ProseParserTemplateStore {
	const {
		KvProseParserTemplateStore,
	} = require("../src/store/reference/prose-parser-templates/kv-prose-parser-template-store");
	return new KvProseParserTemplateStore(backend);
}
describe("CdslParser.suggestAutocomplete integration", () => {
	it("returns suggestion via CdslParser for typed trigger", async () => {
		const conceptBackend = new MemoryKvBackend();
		const refBackend = new MemoryKvBackend();
		const ds = new DictionaryStore(
			new InMemoryConceptResolver(),
			createMemoryConceptStore(conceptBackend),
			createMemoryExpressionStore(),
		);
		await seedTestConcepts(ds);

		const profile = SEED_PARSER_PROFILES.find((p) => p.profileId === "default");
		const templateStore = makeKvTemplateStore(refBackend);

		const cardioTemplate: ProseTemplate = {
			templateId: "cardio_hpi",
			targetSchema: "ObservationEvent",
			sectionPattern: ".+",
			priority: 80,
			slots: [
				{
					slotName: "chief_complaint",
					slotType: "concept",
					anchorPattern: "presents with (?<chief_complaint>[^.!?\\n]+)",
					targetSchema: "ObservationEvent",
					triggerPattern: "presents with",
					suggestText: "presents with ",
				},
			],
		};
		await templateStore.set(cardioTemplate);

		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: profile!,
			proseTemplateStore: templateStore,
		});

		const results = await parser.suggestAutocomplete("Pt presents with sharp", {
			personnelId: "user1",
		} as StopWordContext);
		expect(results).toHaveLength(1);
		expect(results[0]!.templateId).toBe("cardio_hpi");
		expect(results[0]!.slotName).toBe("chief_complaint");
		expect(results[0]!.insertText).toBe("presents with ");
		expect(results[0]!.cursorOffset).toBe(14);
	});

	it("returns empty when proseTemplateStore is not provided", async () => {
		const conceptBackend = new MemoryKvBackend();
		const ds = createMemoryConceptStore(conceptBackend);
		await seedTestConcepts(ds);

		const profile = SEED_PARSER_PROFILES.find((p) => p.profileId === "default");
		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: profile!,
		});

		const results = await parser.suggestAutocomplete("Pt presents with sharp", {
			personnelId: "user1",
		} as StopWordContext);
		expect(results).toHaveLength(0);
	});
});
