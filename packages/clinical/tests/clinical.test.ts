import { describe, expect, test } from "bun:test";
import {
	DictionaryStore,
	InMemoryConceptResolver,
	InMemoryConceptStore,
	InMemoryPersistentExpressionStore,
	MemoryPersistentObjectStore,
	MemorySessionObjectStore,
	ObjectStore,
} from "@stateful-mcp/core";
import { ClinicalEngine } from "../src/engine/clinical-engine";
import { CANONICAL_TAGS, CdslParser } from "../src/parser/cdsl-parser";
import type { PatientProfile } from "../src/schemas/patient";
import {
	MemoryParserConceptDefaultStore,
	MemorySignedSoapNoteStore,
} from "../src/store/memory-clinical-store";

describe("Clinical IDE Stateful Backend", () => {
	test("Initialize, Parse CDSL, and Sign Encounter SOAP Note", async () => {
		// 1. Setup core stateful services
		const sessionObjStore = new MemorySessionObjectStore();
		const persistentObjStore = new MemoryPersistentObjectStore();
		const objectStore = new ObjectStore(
			sessionObjStore,
			persistentObjStore,
			new Map(),
		);

		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		// Seed a few concepts manually for testing
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
			namespaceCode: "LOINC",
			standardCode: "8310-5",
			display: "Body temperature",
			active: true,
		});
		await conceptStore.addConcept({
			id: "SNOMED::29857009",
			namespaceCode: "SNOMED",
			standardCode: "29857009",
			display: "Chest pain",
			active: true,
		});
		await conceptStore.addConcept({
			id: "RxNorm::723",
			namespaceCode: "RxNorm",
			standardCode: "723",
			display: "Amoxicillin",
			active: true,
		});

		// 2. Setup clinical stores and engine
		const signedNoteStore = new MemorySignedSoapNoteStore();
		const engine = new ClinicalEngine(
			objectStore,
			dictionaryStore,
			signedNoteStore,
		);

		const sessionId = "session_enc_123";
		const patient: PatientProfile = {
			id: "pat_998",
			mrn: "MRN-00129",
			name: { primaryOrSurname: "Doe", givenNames: ["John"] },
			administrativeGender: "male",
			status: "active",
			originationDate: {
				assertedTimestampUtc: "1980-05-12T00:00:00Z",
				precisionLevel: "day",
			},
			isOriginationEstimated: false,
			biologicalProfile: { organismType: "human" },
		};

		// 3. Initialize encounter
		const noteId = await engine.initEncounter(sessionId, patient);
		expect(noteId).toBeDefined();

		// Check initial state
		const noteObj = await objectStore.getObject("active_note", sessionId);
		expect(noteObj).not.toBeNull();
		expect(noteObj?.data.status).toBe("draft");
		expect(noteObj?.data.patient.name.primaryOrSurname).toBe("Doe");

		// 4. Process CDSL input stream
		const cdslInput =
			"#vital temp 38.5 Cel || #observation denies Chest Pain || #rx Amoxicillin oral daily 10 days";
		const updatedNote = await engine.processCdsl(sessionId, cdslInput);

		// Assert Vitals mapped
		expect(updatedNote.objective.vitals.length).toBe(1);
		expect(updatedNote.objective.vitals[0].measurement.magnitude).toBe(38.5);
		expect(updatedNote.objective.vitals[0].measurement.unit.display).toBe(
			"Cel",
		);

		// Assert Observation mapped & negated (subjective due to "denies")
		expect(updatedNote.subjective.observations.length).toBe(1);
		expect(updatedNote.subjective.observations[0].certainty).toBe("refuted");
		expect(updatedNote.subjective.observations[0].status).toBe("resolved");

		// Assert Medication mapped
		expect(updatedNote.plan.medications.length).toBe(1);
		expect(updatedNote.plan.medications[0].route).toBe("ORAL");
		expect(updatedNote.plan.medications[0].cadence.cadenceType).toBe("QD");

		// 5. Sign the encounter SOAP note
		const signedRecord = await engine.signEncounter(sessionId, "dr_smith_99");
		expect(signedRecord.noteId).toBe(noteId);
		expect(signedRecord.signedBy).toBe("dr_smith_99");

		// Verify note is locked in session
		const signedNoteObj = await objectStore.getObject("active_note", sessionId);
		expect(signedNoteObj?.data.status).toBe("signed");

		// Attempting to modify signed note should throw
		expect(engine.processCdsl(sessionId, "#vital temp 37.0")).rejects.toThrow();

		// Verify note is archived in signedNoteStore
		const archivedRecord = await signedNoteStore.get(noteId);
		expect(archivedRecord).not.toBeNull();
		expect(archivedRecord?.signedBy).toBe("dr_smith_99");
		expect(archivedRecord?.soapNoteJson.status).toBe("signed");

		// 6. Test custom tagToken profile & canonical interface names
		const customProfile = {
			profileId: "custom_dollars",
			personnelId: "doc_123",
			tagToken: "$",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: false,
		};
		const customParser = new CdslParser(dictionaryStore, customProfile);
		const parsedCustom = await customParser.parse(
			"$vital temp 39.1 Cel || $vitalsmeasurementevent pulse 90 /min",
		);
		expect(parsedCustom.length).toBe(2);
		expect(parsedCustom[0]?.value).toBe(39.1);
		expect(parsedCustom[1]?.value).toBe(90);

		// 7. Test custom tagMappings (internationalization/localization)
		const i18nProfile = {
			profileId: "es_clinic",
			personnelId: "doc_es",
			tagToken: "$",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: false,
			tagMappings: {
				signos_vitales: CANONICAL_TAGS.VITALS,
				prescripcion: CANONICAL_TAGS.MEDICATION,
			},
		};
		const i18nParser = new CdslParser(dictionaryStore, i18nProfile);
		const parsedI18n = await i18nParser.parse(
			"$signos_vitales temp 38.8 Cel || $prescripcion Ibuprofen oral daily",
		);
		expect(parsedI18n.length).toBe(2);
		expect(parsedI18n[0]?.targetSchema).toBe("VitalsMeasurementEvent");
		expect(parsedI18n[0]?.value).toBe(38.8);
		expect(parsedI18n[1]?.targetSchema).toBe("MedicationOrderObject");

		// 8. Test custom attributeRules (e.g. Spanish observation attributes)
		const customI18nProfile = {
			...i18nProfile,
			profileId: "es_clinic_attributes",
			attributeRules: [
				{
					targetField: "certainty",
					targetValue: "refuted",
					regexPatterns: ["\\bniega\\b", "\\bno\\s+presenta\\b"],
					isCaseInsensitive: true,
				},
				{
					targetField: "severity",
					targetValue: "severe",
					regexPatterns: ["\\bgrave\\b", "\\bsevero\\b"],
					isCaseInsensitive: true,
				},
			],
		};
		const ruleParser = new CdslParser(dictionaryStore, customI18nProfile);
		const parsedRules = await ruleParser.parse(
			"$observation niega Chest Pain || $observation grave Chest Pain",
		);
		expect(parsedRules.length).toBe(2);
		expect(parsedRules[0]?.certainty).toBe("refuted");
		expect(parsedRules[0]?.anchorText).toBe("Chest Pain");
		expect(parsedRules[1]?.severity).toBe("severe");
		expect(parsedRules[1]?.anchorText).toBe("Chest Pain");

		// 9. Test ParserConceptDefaultStore with regex capture groups (LOINC temp)
		const conceptDefaultsStore = new MemoryParserConceptDefaultStore();
		await conceptDefaultsStore.set({
			anchorConceptId: "LOINC::8310-5",
			targetSchema: "VitalsMeasurementEvent",
			regexPatterns: [
				"temp(?:erature)?\\s+is\\s+(\\d+(?:\\.\\d+)?)\\s*([a-zA-Z%]*)",
			],
			defaultProperties: {
				unit: "Cel",
				captureGroupMapping: ["value", "unit"],
			},
		});

		const defaultParser = new CdslParser(
			dictionaryStore,
			undefined,
			conceptDefaultsStore,
		);
		const parsedDefaults = await defaultParser.parse("#vital temp is 38.2 Cel");
		expect(parsedDefaults.length).toBe(1);
		expect(parsedDefaults[0]?.value).toBe(38.2);
		expect(parsedDefaults[0]?.unit).toBe("Cel");
		expect(parsedDefaults[0]?.capturedProperties?.value).toBe("38.2");
		expect(parsedDefaults[0]?.capturedProperties?.unit).toBe("Cel");

		// 10. Test direct term tokenizer resolution (LOINC::8310-5)
		const tokenizerProfile = {
			profileId: "tokenizer_test",
			personnelId: "doc_test",
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: false,
			termTokenizer: "::",
		};
		const tokenizerParser = new CdslParser(dictionaryStore, tokenizerProfile);
		const parsedTokenizer = await tokenizerParser.parse(
			"#vital LOINC::8310-5 38.4 Cel",
		);
		expect(parsedTokenizer.length).toBe(1);
		expect(parsedTokenizer[0]?.conceptId).toBeDefined();
		expect(parsedTokenizer[0]?.display).toBe("Body temperature");

		// 11. Test tagless resolution guessing fallback
		const parsedTagless = await defaultParser.parse(
			"temp 37.9 Cel || Chest Pain denies || Amoxicillin daily",
		);
		expect(parsedTagless.length).toBe(3);
		expect(parsedTagless[0]?.targetSchema).toBe("VitalsMeasurementEvent");
		expect(parsedTagless[0]?.value).toBe(37.9);
		expect(parsedTagless[1]?.targetSchema).toBe("ObservationEvent");
		expect(parsedTagless[1]?.certainty).toBe("refuted");
		expect(parsedTagless[2]?.targetSchema).toBe("MedicationOrderObject");

		// 12. Test schemaNamespaces configuration filtering
		const namespacesProfile = {
			profileId: "ns_test",
			personnelId: "doc_test",
			tagToken: "#",
			stateDelimiter: "||",
			stateStartDelimiter: "|",
			stateEndDelimiter: "|",
			macroStartToken: "^",
			variableStartToken: "{",
			variableEndToken: "}",
			isDefault: false,
			schemaNamespaces: {
				[CANONICAL_TAGS.OBSERVATION.toLowerCase()]: ["SNOMED"],
				[CANONICAL_TAGS.VITALS.toLowerCase()]: ["LOINC"],
			},
		};
		const namespacesParser = new CdslParser(dictionaryStore, namespacesProfile);
		const parsedNS = await namespacesParser.parse(
			"#observation Chest Pain denies",
		);
		expect(parsedNS.length).toBe(1);
		expect(parsedNS[0]?.conceptId).toBeDefined();

		// 13. Test blood pressure custom unit capture
		const parsedBPUnit = await defaultParser.parse(
			"#vital bp 120/80 bar || #vital bp 125/85",
		);
		expect(parsedBPUnit.length).toBe(2);
		expect(parsedBPUnit[0]?.value).toBe("120/80");
		expect(parsedBPUnit[0]?.unit).toBe("bar");
		expect(parsedBPUnit[1]?.value).toBe("125/85");
		expect(parsedBPUnit[1]?.unit).toBe("mmHg");
	});
});
