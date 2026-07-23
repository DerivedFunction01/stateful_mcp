import { describe, expect, test } from "bun:test";
import {
	type CustomExpression,
	DictionaryStore,
	InMemoryConceptResolver,
	InMemoryConceptStore,
	InMemoryPersistentExpressionStore,
} from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import type {
	ParsedMedicationItem,
	ParsedObservationItem,
	ParsedVitalsItem,
} from "../src/parser/schema-parsers";
import { StopWordParser } from "../src/parser/stop-word-parser";

async function seedTestConcepts(dictionaryStore: DictionaryStore) {
	const conceptStore = dictionaryStore["conceptStore"];
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
		},
		{
			term: "Chest Pain",
			regexPattern: "\\bchest pain\\b",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "SNOMED::29857009",
			priorityWeight: 1,
			active: true,
		},
		{
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
		await dictionaryStore.addExpression(expr);
	}
}

describe("CdslParser Ensemble NER tests", () => {
	test("preview returns schema envelopes for observation, medication, and time", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(dictionaryStore);

		const parser = new CdslParser(dictionaryStore);
		const previews = await parser.preview(
			"#ObservationEvent Chest Pain denies || #MedicationOrderObject Amoxicillin 50 mg for 7 days || #time 3 weeks ago",
		);

		expect(previews.length).toBeGreaterThanOrEqual(3);
		expect(previews.some((p) => p.targetSchema === "ObservationEvent")).toBe(
			true,
		);
		expect(
			previews.some((p) => p.targetSchema === "MedicationOrderObject"),
		).toBe(true);
		expect(previews.some((p) => p.targetSchema === "ClinicalDateRange")).toBe(
			true,
		);
	});

	test("Ambiguous segment resolved to multiple items (multi-intent)", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(dictionaryStore);

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
					targetValue: "Cel",
					regexPatterns: ["Cel", "C"],
					isCaseInsensitive: true,
				},
			],
		};

		const parser = new CdslParser(dictionaryStore, profile as any);

		// Segment containing multi-intent details
		const results = await parser.parse("Chest Pain denies || temp 38.5 Cel");

		const obsResult = results.find(
			(r) => r.targetSchema === "ObservationEvent",
		) as ParsedObservationItem;
		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem;

		expect(results.length).toBeGreaterThanOrEqual(2);
		expect(obsResult).toBeDefined();
		expect(obsResult.certainty).toBe("refuted");
		expect(obsResult.display).toBe("Chest Pain");

		expect(vitalsResult).toBeDefined();
		expect(vitalsResult.value).toBe(38.5);
		expect(vitalsResult.unit).toBe("Cel");
	});

	test("Conversational narratives are ignored by stop-word gatekeeper", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(dictionaryStore);

		const stopWordParser = new StopWordParser([
			"discussed",
			"details",
			"with",
			"patient",
			"regarding",
			"the",
			"case",
		]);
		const parser = new CdslParser(
			dictionaryStore,
			undefined,
			undefined,
			stopWordParser,
		);

		// Line consists mostly of stop words
		const results = await parser.parse(
			"discussed details with patient regarding the case",
		);
		expect(results.length).toBe(0);
	});

	test("Segments starting with unknown tag prefixes fall back to tagless parsing", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(dictionaryStore);

		const parser = new CdslParser(dictionaryStore);

		// "#3 temp 38.5 Cel" starts with "#3" (which is an unknown tag), so it should parse taglessly
		const results = await parser.parse("#3 temp 38.5 Cel");
		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem | undefined;

		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(vitalsResult).toBeDefined();
		expect(vitalsResult?.value).toBe(38.5);
		expect(vitalsResult?.unit).toBe("Celsius");
	});

	test("Medication duration is selected from the time candidate bag, not the first numeric match", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(dictionaryStore);

		const parser = new CdslParser(dictionaryStore);
		const results = await parser.parse(
			"#MedicationOrderObject Amoxicillin 50 mg for 7 days",
		);
		const medResult = results.find(
			(r) => r.targetSchema === "MedicationOrderObject",
		) as ParsedMedicationItem | undefined;

		expect(medResult).toBeDefined();
		expect(medResult?.duration).toBe("7 days");
		expect(medResult?.display).toBe("Amoxicillin");
		expect(medResult?.capturedProperties?.unit).toBeUndefined();
	});

	test("Vitals selection ignores a later time-span candidate and keeps the physical measurement", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(dictionaryStore);

		const parser = new CdslParser(dictionaryStore);
		const results = await parser.parse(
			"#VitalsMeasurementEvent temp 38.5 Cel for 7 days",
		);
		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem | undefined;

		expect(vitalsResult).toBeDefined();
		expect(vitalsResult?.value).toBe(38.5);
		expect(vitalsResult?.unit).toBe("Celsius");
	});
});
