import { describe, expect, test } from "bun:test";
import {
	createMemoryConceptStore,
	createMemoryExpressionStore,
	DictionaryStore,
	InMemoryConceptResolver,
} from "@stateful-mcp/core";
import type { CustomExpression } from "@stateful-mcp/core/src/middleware/dictionary/types";
import { CdslParser } from "../src/parser/cdsl-parser";
import { ClinicalDateRangeSchemaParser } from "../src/parser/parsers/clinical-date-range-parser";
import type {
	ParsedMedicationItem,
	ParsedObservationItem,
	ParsedVitalsItem,
} from "../src/parser/schema-parsers";
import { schemaParserRegistry } from "../src/parser/schema-parsers";
import { StopWordParser } from "../src/parser/stop-word-parser";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";

// Register all schema parsers into the global registry used by CdslParser.
// parsers don't self-register; the consumer is responsible.
schemaParserRegistry.set(
	"clinicaldaterange",
	new ClinicalDateRangeSchemaParser(),
);

// ── Test concept seed ─────────────────────────────────────────────────────────

async function seedTestConcepts(dictionaryStore: DictionaryStore) {
	const conceptStore = (dictionaryStore as any)["conceptStore"];

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
		id: "LOINC::8310-5",
		standardCode: "8310-5",
		display: "Temperature",
		namespaceCode: "LOINC",
		description: "temp",
		active: true,
	});
	await conceptStore.addConcept({
		id: "SNOMED::29857009",
		standardCode: "29857009",
		display: "Chest Pain",
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
			term: "temp",
			regexPattern: "temp",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "LOINC::8310-5",
			priorityWeight: 1,
			active: true,
			id: "1",
		},
		{
			term: "Chest Pain",
			regexPattern: "\\bchest pain\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
			id: "2",
		},
		{
			term: "Amoxicillin",
			regexPattern: "\\bamoxicillin\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "RxNorm::723",
			priorityWeight: 1,
			active: true,
			id: "3",
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ClinicalEngine ensemble (v2)", () => {
	test("parser dispatches to multiple schemas from a single dictation", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);
		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: SEED_PARSER_PROFILES.find((p) => p.profileId === "default")!,
		});

		const results = await parser.parse(
			"#VitalsMeasurementEvent temp 38.5 Cel || #ObservationEvent Chest Pain || #ClinicalDateRange in 3 days",
		);

		expect(
			results.some((r) => r.targetSchema === "VitalsMeasurementEvent"),
		).toBe(true);
		expect(results.some((r) => r.targetSchema === "ObservationEvent")).toBe(
			true,
		);
		expect(results.some((r) => r.targetSchema === "ClinicalDateRange")).toBe(
			true,
		);
	});

	test("ambiguous segment resolves to multiple items (multi-intent)", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const profile = {
			profileId: "ensemble_test",
			personnelId: "doc_test",
			tagToken: "#",
			stateDelimiter: "||",
			isDefault: true,
			schemaNamespaces: {
				vitalsmeasurementevent: ["LOINC"],
				observationevent: ["SNOMED"],
				medicationorderobject: ["RxNorm"],
			},
			attributeRules: [
				{
					targetField: "certainty",
					targetValue: "refuted",
					regexPatterns: ["\\bdenies\\b", "\\bniega\\b"],
					isCaseInsensitive: true,
				},
				{
					targetField: "unit",
					targetValue: "Celsius",
					regexPatterns: [
						"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>Cel)\\b",
					],
					isCaseInsensitive: true,
					unitAnchor: "temperature",
				},
			],
		};

		const parser = new CdslParser({ dictionaryStore: ds, profile: profile as any });
		const results = await parser.parse("Chest Pain denies || temp 38.5 Cel");

		const obsResult = results.find(
			(r) => r.targetSchema === "ObservationEvent",
		) as ParsedObservationItem | undefined;
		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem | undefined;

		expect(results.length).toBeGreaterThanOrEqual(2);

		// v2: certainty lives in extractedData
		expect(obsResult).toBeDefined();
		expect(obsResult?.extractedData?.certainty).toBe("refuted");
		// v2: display lives in concept[0].display
		expect(obsResult?.concept[0]?.display).toBe("Chest Pain");

		// v2: measurement lives in extractedData.measurement
		expect(vitalsResult).toBeDefined();
		expect(vitalsResult?.extractedData?.measurement?.magnitude).toBe(38.5);
	});

	test("conversational narratives are ignored by stop-word gatekeeper", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);

		const stopWordParser = new StopWordParser([
			"discussed",
			"details",
			"with",
			"patient",
			"regarding",
			"the",
			"case",
		]);
		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: SEED_PARSER_PROFILES.find((p) => p.profileId === "default")!,
			stopWordParser,
		});

		const results = await parser.parse(
			"discussed details with patient regarding the case",
		);
		expect(results.length).toBe(0);
	});

	test("segments starting with unknown tag prefixes fall back to tagless parsing", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);
		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: SEED_PARSER_PROFILES.find((p) => p.profileId === "default")!,
		});

		// "#3 temp 38.5 Cel" — "#3" is not a known schema tag, should parse taglessly
		const results = await parser.parse("#3 temp 38.5 Cel");
		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem | undefined;

		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(vitalsResult).toBeDefined();
		// v2: magnitude in extractedData.measurement
		expect(vitalsResult?.extractedData?.measurement?.magnitude).toBe(38.5);
	});

	test("medication parse resolves concept via concept[] array (v2)", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);
		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: SEED_PARSER_PROFILES.find((p) => p.profileId === "default")!,
		});

		const results = await parser.parse(
			"#MedicationOrderObject Amoxicillin 50 mg for 7 days",
		);
		const medResult = results.find(
			(r) => r.targetSchema === "MedicationOrderObject",
		) as ParsedMedicationItem | undefined;

		expect(medResult).toBeDefined();
		// v2: display is in concept[0].display, not a top-level .display field
		expect(medResult?.concept[0]?.display).toBe("Amoxicillin");
	});

	test("vitals selection keeps physical measurement magnitude, ignores time-span candidate", async () => {
		const ds = makeDictionaryStore();
		await seedTestConcepts(ds);
		const parser = new CdslParser({
			dictionaryStore: ds,
			profile: SEED_PARSER_PROFILES.find((p) => p.profileId === "default")!,
		});

		const results = await parser.parse(
			"#VitalsMeasurementEvent temp 38.5 Cel for 7 days",
		);
		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem | undefined;

		expect(vitalsResult).toBeDefined();
		// v2: physical measurement — not the 7-day time span
		expect(vitalsResult?.extractedData?.measurement?.magnitude).toBe(38.5);
	});
});
