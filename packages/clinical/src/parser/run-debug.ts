import { MemoryKvBackend } from "@stateful-mcp/core";
import { KvProseParserTemplateStore } from "../store/reference/prose-parser-templates/kv-prose-parser-template-store";
import { ProseParser } from "./prose-parser";

const mockDictionaryStore = {
	get: async (conceptId: string) => ({
		conceptId,
		display: conceptId,
		namespaces: [],
	}),
	resolve: async (term: string) => {
		console.log("resolve term:", term);
		return [{ conceptId: "SNOMED::2235008", display: term, score: 1.0 }];
	},
} as any;

const mockConceptFieldStore = { list: async () => [] } as any;
const mockProfile = { termTokenizer: "::", schemaNamespaces: {} } as any;
const mockAttributeRules = [
	{
		targetField: "duration",
		targetValue: { magnitude: 3, unit: "day" },
		regexPatterns: ["3 days ago"],
	},
	{
		targetField: "severity",
		targetValue: { score: 8, maxScore: 10 },
		regexPatterns: ["8/10"],
	},
] as any;

const backend = new MemoryKvBackend();
const store = new KvProseParserTemplateStore(backend);

const subjectiveParent = {
	templateId: "subjective_parent",
	targetSchema: "ObservationEvent",
	sectionPattern: "Subjective:[\\s\\S]+?(?=(?:Objective|Plan|$))",
	priority: 10,
	slots: [
		{
			slotName: "hpi_section",
			slotType: "sub_section",
			anchorPattern:
				"History of Present Illness \\(HPI\\):(?<hpi_section>[\\s\\S]+?)(?=(?:Review of Systems|$))",
			delegateTemplateId: "cardio_hpi",
		},
	],
};

const cardioHpi = {
	templateId: "cardio_hpi",
	targetSchema: "ObservationEvent",
	sectionPattern: "History of Present Illness",
	slots: [
		{
			slotName: "chief_complaint",
			slotType: "concept",
			anchorPattern: "presents with (?<chief_complaint>[^\\.]+)",
			fieldPath: "concept",
		},
	],
};

await store.set(subjectiveParent as any);
await store.set(cardioHpi as any);

const parser = new ProseParser(
	mockDictionaryStore,
	mockConceptFieldStore,
	mockAttributeRules,
	store,
	mockProfile,
);

const rawProse = `Subjective:
History of Present Illness (HPI):
The patient presents with sharp back pain that began 3 days ago. The pain is rated as an 8/10. He also reports mild nausea.`;

const res = await parser.parse(rawProse);
console.log("RESULT parsedItems:", JSON.stringify(res.parsedItems, null, 2));
