import { describe, expect, test } from "bun:test";
import {
	DictionaryStore,
	InMemoryConceptResolver,
	InMemoryConceptStore,
	InMemoryPersistentExpressionStore,
} from "@stateful-mcp/core";
import { CdslParser } from "../src/parser/cdsl-parser";
import type {
	ParsedObservationItem,
	ParsedVitalsItem,
} from "../src/parser/schema-parsers";
import { StopWordParser } from "../src/parser/stop-word-parser";

async function seedTestConcepts(store: InMemoryConceptStore) {
	await store.addNamespace({
		code: "LOINC",
		description: "LOINC",
		isPublic: true,
		isExternalPrivate: false,
	});
	await store.addNamespace({
		code: "SNOMED",
		description: "SNOMED",
		isPublic: true,
		isExternalPrivate: false,
	});
	await store.addNamespace({
		code: "RxNorm",
		description: "RxNorm",
		isPublic: true,
		isExternalPrivate: false,
	});

	await store.addConcept({
		id: "LOINC::8310-5",
		standardCode: "8310-5",
		display: "Temperature",
		namespaceCode: "LOINC",
		description: "temp",
		active: true,
	});
	await store.addConcept({
		id: "SNOMED::29857009",
		standardCode: "29857009",
		display: "Chest Pain",
		namespaceCode: "SNOMED",
		active: true,
	});
	await store.addConcept({
		id: "RxNorm::723",
		standardCode: "723",
		display: "Amoxicillin",
		namespaceCode: "RxNorm",
		active: true,
	});
}

describe("CdslParser Ensemble NER tests", () => {
	test("Ambiguous segment resolved to multiple items (multi-intent)", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedTestConcepts(conceptStore);

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

		expect(results.length).toBe(2);

		const obsResult = results.find(
			(r) => r.targetSchema === "ObservationEvent",
		) as ParsedObservationItem;
		expect(obsResult).toBeDefined();
		expect(obsResult.certainty).toBe("refuted");
		expect(obsResult.display).toBe("Chest Pain");

		const vitalsResult = results.find(
			(r) => r.targetSchema === "VitalsMeasurementEvent",
		) as ParsedVitalsItem;
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

		await seedTestConcepts(conceptStore);

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
});
