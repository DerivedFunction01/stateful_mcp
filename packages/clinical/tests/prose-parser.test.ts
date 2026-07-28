import { describe, expect, it } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
	MemoryKvBackend,
} from "@stateful-mcp/core";
import type { CustomExpression } from "@stateful-mcp/core/src/middleware/dictionary/types";
import { ProseParser } from "../src/parser/prose-parser";
import type { ProseTemplate } from "../src/schemas/prose-template";
import type {
	AttributeParserRule,
	ParserSyntaxProfile,
} from "../src/store/interfaces";
import { KvProseParserTemplateStore } from "../src/store/reference/prose-parser-templates/kv-prose-parser-template-store";

// Set up a real seeded Dictionary Store
async function makeSeededDictionaryStore() {
	const ds = new DictionaryStore(
		new InMemoryConceptResolver(),
		createMemoryConceptStore(),
		createMemoryExpressionStore(),
	);
	const conceptStore = (ds as any)["conceptStore"];

	await conceptStore.addNamespace({
		code: "LOINC",
		description: "LOINC",
		isPublic: true,
		isExternalPrivate: false,
	});
	await conceptStore.addNamespace({
		code: "SNOMED",
		description: "SNOMED",
		isPublic: true,
		isExternalPrivate: false,
	});
	await conceptStore.addNamespace({
		code: "RxNorm",
		description: "RxNorm",
		isPublic: true,
		isExternalPrivate: false,
	});

	await conceptStore.addConcept({
		id: "SNOMED::2235008",
		standardCode: "2235008",
		display: "Low back pain",
		namespaceCode: "SNOMED",
		active: true,
	});
	await conceptStore.addConcept({
		id: "LOINC::8310-5",
		standardCode: "8310-5",
		display: "Body temperature",
		namespaceCode: "LOINC",
		active: true,
	});
	await conceptStore.addConcept({
		id: "SNOMED::19213003",
		standardCode: "19213003",
		display: "Diaphoresis",
		namespaceCode: "SNOMED",
		active: true,
	});
	await conceptStore.addConcept({
		id: "SNOMED::80436009",
		standardCode: "80436009",
		display: "Palpitations",
		namespaceCode: "SNOMED",
		active: true,
	});
	await conceptStore.addConcept({
		id: "SNOMED::422587007",
		standardCode: "422587007",
		display: "Nausea",
		namespaceCode: "SNOMED",
		active: true,
	});
	await conceptStore.addConcept({
		id: "RxNorm::723",
		standardCode: "723",
		display: "Amoxicillin",
		namespaceCode: "RxNorm",
		active: true,
	});

	const expressions: CustomExpression[] = [
		{
			id: "1",
			term: "Low back pain",
			regexPattern: "\\bback pain\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::2235008",
			priorityWeight: 1,
			active: true,
		},
		{
			id: "2",
			term: "Body temperature",
			regexPattern: "\\bfever\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "LOINC::8310-5",
			priorityWeight: 1,
			active: true,
		},
		{
			id: "3",
			term: "Diaphoresis",
			regexPattern: "\\bsweating\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::19213003",
			priorityWeight: 1,
			active: true,
		},
		{
			id: "4",
			term: "Palpitations",
			regexPattern: "\\bpalpitations\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::80436009",
			priorityWeight: 1,
			active: true,
		},
		{
			id: "5",
			term: "Nausea",
			regexPattern: "\\bnausea\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::422587007",
			priorityWeight: 1,
			active: true,
		},
		{
			id: "6",
			term: "Amoxicillin",
			regexPattern: "\\bamoxicillin\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "RxNorm::723",
			priorityWeight: 1,
			active: true,
		},
	];

	for (const expr of expressions) {
		await ds.addExpression(expr);
	}
	return ds;
}

const mockConceptFieldStore = {
	list: async () => [],
} as any;

// Active parser profile definition
const mockProfile: ParserSyntaxProfile = {
	profileId: "test_profile",
	personnelId: "test_doc",
	tagToken: "#",
	stateDelimiter: "||",
	stateStartDelimiter: "|",
	stateEndDelimiter: "|",
	macroStartToken: "^",
	variableStartToken: "{",
	variableEndToken: "}",
	isDefault: true,
	termTokenizer: "::",
	schemaNamespaces: {
		observationevent: ["SNOMED", "LOINC"],
		medicationorderobject: ["RxNorm"],
	},
};

const mockAttributeRules: AttributeParserRule[] = [
	{
		targetField: "duration",
		targetValue: { magnitude: 3, unit: "day" },
		regexPatterns: ["3 days ago"],
		priority: 10,
	},
	{
		targetField: "severityScore",
		targetValue: { score: 8, maxScore: 10 },
		regexPatterns: ["8/10"],
		priority: 10,
	},
];

describe("ProseParser - Structured Clinical Templates", () => {
	it("should parse mixed clinical prose matching templates, slots, lists, and remnants", async () => {
		const backend = new MemoryKvBackend();
		const store = new KvProseParserTemplateStore(backend);
		const ds = await makeSeededDictionaryStore();

		// Seed templates matching mixed clinical scenario
		const subjectiveParent: ProseTemplate = {
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
				{
					slotName: "ros_section",
					slotType: "sub_section",
					anchorPattern:
						"Review of Systems \\(ROS\\):(?<ros_section>[\\s\\S]+)",
					delegateTemplateId: "ros_general",
				},
			],
		};

		const cardioHpi: ProseTemplate = {
			templateId: "cardio_hpi",
			targetSchema: "ObservationEvent",
			sectionPattern: "History of Present Illness",
			remnantContext: {
				targetSchema: "ObservationEvent",
				itemOverrides: { sourceType: "patient_reported" },
			},
			slots: [
				{
					slotName: "chief_complaint",
					slotType: "concept",
					anchorPattern: "presents with (?<chief_complaint>[^\\.]+)",
					fieldPath: "concept",
				},
				{
					slotName: "duration",
					slotType: "attribute",
					ruleRef: "duration",
					anchorPattern: "began (?<duration>[^\\.]+)",
					linkTo: { parentSlot: "chief_complaint", relation: "duration" },
				},
				{
					slotName: "severity",
					slotType: "attribute",
					ruleRef: "severityScore",
					anchorPattern: "rated as an? (?<severity>[^\\.]+)",
					linkTo: { parentSlot: "chief_complaint", relation: "qualifier" },
				},
			],
		};

		const rosGeneral: ProseTemplate = {
			templateId: "ros_general",
			targetSchema: "ObservationEvent",
			sectionPattern: "Review of Systems",
			slots: [
				{
					slotName: "systems",
					slotType: "repeating_block",
					repeatPattern:
						"^(?<system>Constitutional|Cardiovascular):\\s*(?<findings>[^\\n]+)",
					subTemplate: {
						textGroup: "findings",
						slots: [
							{
								slotName: "positives",
								slotType: "concept",
								anchorPattern: "Positive for (?<list>[^\\.]+)",
								itemOverrides: { certainty: "confirmed" },
							},
							{
								slotName: "negatives",
								slotType: "concept",
								anchorPattern: "Negative for (?<list>[^\\.]+)",
								itemOverrides: { certainty: "refuted" },
							},
						],
					},
				},
			],
		};

		const planGeneral: ProseTemplate = {
			templateId: "plan_general",
			targetSchema: "BaseOrderObject",
			sectionPattern: "Plan:[\\s\\S]+",
			priority: 5,
			slots: [
				{
					slotName: "medications",
					slotType: "concept",
					anchorPattern: "prescribe (?<list>[^\\.]+)",
					targetSchema: "MedicationOrderObject",
					itemOverrides: { authorizedRefills: 0 },
				},
			],
		};

		await store.set(subjectiveParent);
		await store.set(cardioHpi);
		await store.set(rosGeneral);
		await store.set(planGeneral);

		const parser = new ProseParser(
			ds,
			mockConceptFieldStore,
			mockAttributeRules,
			store,
			mockProfile,
		);

		const rawProse = `Subjective:
History of Present Illness (HPI):
The patient presents with sharp back pain that began 3 days ago. The pain is rated as an 8/10. He also reports mild nausea.

Review of Systems (ROS):
Constitutional: Negative for fever, sweating.
Cardiovascular: Positive for palpitations.

Objective:
Pulse is 82. Temperature is 37.2 C.

Plan:
We will prescribe Amoxicillin 500mg TID. Follow up in 7 days.`;

		const { parsedItems, consumedRanges, remnantSegments } =
			await parser.parse(rawProse);

		// ── Verification of parsed items ───────────────────────────────────────
		// 1. Back Pain (chief complaint)
		const backPain = parsedItems.find(
			(t) => t.concept?.[0]?.conceptId === "SNOMED::2235008",
		);
		expect(backPain).toBeDefined();
		expect(backPain?.extractedData?.concept?.conceptId).toBe("SNOMED::2235008");
		expect(backPain?.extractedData?.duration).toEqual({
			magnitude: 3,
			unit: "day",
		});
		expect(backPain?.extractedData?.severity).toEqual({
			score: 8,
			maxScore: 10,
		});

		// 2. Constitutional Negative Items (Fever, Sweating)
		const fever = parsedItems.find(
			(t) => t.concept?.[0]?.conceptId === "LOINC::8310-5",
		);
		expect(fever).toBeDefined();
		expect(fever?.extractedData?.certainty).toBe("refuted");

		const sweating = parsedItems.find(
			(t) => t.concept?.[0]?.conceptId === "SNOMED::19213003",
		);
		expect(sweating).toBeDefined();
		expect(sweating?.extractedData?.certainty).toBe("refuted");

		// 3. Cardiovascular Positive Items (Palpitations)
		const palpitations = parsedItems.find(
			(t) => t.concept?.[0]?.conceptId === "SNOMED::80436009",
		);
		expect(palpitations).toBeDefined();
		expect(palpitations?.extractedData?.certainty).toBe("confirmed");

		// 4. Prescribed Medication (Amoxicillin)
		const amox = parsedItems.find(
			(t) => t.concept?.[0]?.conceptId === "RxNorm::723",
		);
		expect(amox).toBeDefined();
		expect(amox?.targetSchema).toBe("MedicationOrderObject");
		expect(amox?.extractedData?.authorizedRefills).toBe(0);

		// ── Verification of remnants & consumption ────────────────────────────
		// Consumed ranges should be subjective parent section and plan parent section
		expect(consumedRanges.length).toBeGreaterThan(0);

		// Remnants should include the unparsed nausea sentence in HPI
		const nauseaRem = remnantSegments.find((r) =>
			r.text.includes("reports mild nausea"),
		);
		expect(nauseaRem).toBeDefined();
		expect(nauseaRem?.remnantContext?.targetSchema).toBe("ObservationEvent");
		expect(nauseaRem?.remnantContext?.itemOverrides?.sourceType).toBe(
			"patient_reported",
		);
	});
});
