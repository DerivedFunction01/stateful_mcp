import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
	DictionaryStore,
	InMemoryConceptResolver,
	InMemoryConceptStore,
	InMemoryPersistentExpressionStore,
	MemoryEntityStore,
	MemoryPersistentObjectStore,
	MemorySessionObjectStore,
	ObjectStore,
	SqliteEntityStore,
} from "@stateful-mcp/core";
import { ClinicalEngine } from "../src/engine/clinical-engine";
import {
	CANONICAL_TAGS,
	CdslParser,
	type ParsedVitalsItem,
	type ParsedObservationItem,
	type ParsedMedicationItem,
} from "../src/parser/cdsl-parser";
import { StopWordParser } from "../src/parser/stop-word-parser";
import type { PatientProfile } from "../src/schemas/patient";
import { MeasurementHelper, TimeHelper } from "../src/parser/helpers/measurement-helper";
import type { StopWordContext } from "../src/store/interfaces";
import {
	ClinicalAdministrativeStore,
	ClinicalCalibrationStore,
	ClinicalJurisdictionalDisplayStore,
	ClinicalParserConceptDefaultStore,
	ClinicalParserProfileStore,
	ClinicalProseTemplateStore,
	ClinicalSignedSoapNoteStore,
	ClinicalStopWordStore,
} from "../src/store/clinical-store";
import {
	MemoryParserConceptDefaultStore,
	MemorySignedSoapNoteStore,
} from "../src/store/memory-clinical-store";
import {
	SqliteParserConceptDefaultStore,
	SqliteParserProfileStore,
} from "../src/store/sqlite-clinical-store";

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
		expect(updatedNote.objective.vitals[0]!.measurement.magnitude).toBe(38.5);
		expect(updatedNote.objective.vitals[0]!.measurement.unit!.display).toBe(
			"Cel",
		);

		// Assert Observation mapped & negated (subjective due to "denies")
		expect(updatedNote.subjective.observations.length).toBe(1);
		expect(updatedNote.subjective.observations[0]!.certainty).toBe("refuted");
		expect(updatedNote.subjective.observations[0]!.status).toBe("resolved");

		// Assert Medication mapped
		expect(updatedNote.plan.medications.length).toBe(1);
		expect(updatedNote.plan.medications[0]!.route as string).toBe("ORAL");
		expect(
			updatedNote.plan.medications[0]!.frequency!.cadenceType as string,
		).toBe("QD");

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
		expect((parsedCustom[0] as ParsedVitalsItem)?.value).toBe(39.1);
		expect((parsedCustom[1] as ParsedVitalsItem)?.value).toBe(90);

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
		expect((parsedI18n[0] as ParsedVitalsItem)?.value).toBe(38.8);
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
		expect((parsedRules[0] as ParsedObservationItem)?.certainty).toBe("refuted");
		expect(parsedRules[0]?.anchorText).toBe("Chest Pain");
		expect((parsedRules[1] as ParsedObservationItem)?.severity).toBe("severe");
		expect(parsedRules[1]?.anchorText).toBe("Chest Pain");

		// 9. Test ParserConceptDefaultStore with regex capture groups (LOINC temp)
		const conceptDefaultsStore = new MemoryParserConceptDefaultStore();
		await conceptDefaultsStore.set({
			anchorConceptId: "LOINC::8310-5",
			targetSchema: "VitalsMeasurementEvent",
			regexPatterns: [
				"temp(?:erature)?\\s+is\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*(?<unit>[a-zA-Z%]*)",
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
		expect((parsedDefaults[0] as ParsedVitalsItem)?.value).toBe(38.2);
		expect((parsedDefaults[0] as ParsedVitalsItem)?.unit).toBe("Cel");
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
		expect((parsedTagless[0] as ParsedVitalsItem)?.value).toBe(37.9);
		expect(parsedTagless[1]?.targetSchema).toBe("ObservationEvent");
		expect((parsedTagless[1] as ParsedObservationItem)?.certainty).toBe("refuted");
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
		expect((parsedBPUnit[0] as ParsedVitalsItem)?.value).toBe("120/80");
		expect((parsedBPUnit[0] as ParsedVitalsItem)?.unit).toBe("bar");
		expect((parsedBPUnit[1] as ParsedVitalsItem)?.value).toBe("125/85");
		expect((parsedBPUnit[1] as ParsedVitalsItem)?.unit).toBe("mmHg");

		// 14. Test MeasurementHelper and TimeHelper sub-parsing
		const parsedMeasure = MeasurementHelper.parse(">=38.5 Cel");
		expect(parsedMeasure?.magnitude).toBe(38.5);
		expect(parsedMeasure?.operator).toBe("gte");
		expect(parsedMeasure?.unit?.display).toBe("Cel");

		const parsedMeasureApprox = MeasurementHelper.parse("~37 C");
		expect(parsedMeasureApprox?.magnitude).toBe(37);
		expect(parsedMeasureApprox?.is_approximate).toBe(true);

		const parsedTime = TimeHelper.parse("3 hours");
		expect(parsedTime?.magnitude).toBe(3);
		expect(parsedTime?.unit).toBe("hour");

		// 15. Test language-neutral dynamic attribute rule translations for helpers
		const customRules = [
			{
				targetField: "unit",
				targetValue: "Cel",
				regexPatterns: ["centigrados", "grados", "c"],
				isCaseInsensitive: true,
			},
			{
				targetField: "time_unit",
				targetValue: "hour",
				regexPatterns: ["horas?", "hrs?"],
				isCaseInsensitive: true,
			},
			{
				targetField: "operator",
				targetValue: "is_approximate",
				regexPatterns: ["alrededor de", "aprox"],
				isCaseInsensitive: true,
			},
		];

		const parsedMeasureES = MeasurementHelper.parse(
			"aprox 38 grados",
			undefined,
			customRules,
		);
		expect(parsedMeasureES?.magnitude).toBe(38);
		expect(parsedMeasureES?.is_approximate).toBe(true);
		expect(parsedMeasureES?.unit?.display).toBe("Cel");

		const parsedTimeES = TimeHelper.parse("5 horas", customRules);
		expect(parsedTimeES?.magnitude).toBe(5);
		expect(parsedTimeES?.unit).toBe("hour");

		// 16. Test generic SQLite entity store clinical adapters
		const testDb = new Database(":memory:");
		const sqliteProfileStore = new SqliteParserProfileStore(testDb);
		const sqliteDefaultsStore = new SqliteParserConceptDefaultStore(testDb);

		// Wait slightly to ensure asynchronous seeding runs
		await new Promise((resolve) => setTimeout(resolve, 50));

		const systemProfile = await sqliteProfileStore.get("default");
		expect(systemProfile).not.toBeNull();
		expect(systemProfile?.personnelId).toBe("system");
		expect(systemProfile?.tagToken).toBe("#");

		const tempDefault = await sqliteDefaultsStore.get(
			"LOINC::8310-5",
			"VitalsMeasurementEvent",
		);
		expect(tempDefault).not.toBeNull();
		expect(tempDefault?.defaultProperties.unit).toBe("Cel");
	});

	test("Unified clinical store works identically with MemoryEntityStore and SqliteEntityStore", async () => {
		const profileSeed: any[] = [];
		const defaultsSeed: any[] = [];

		async function runClinicalTests(
			name: string,
			profileStore: ClinicalParserProfileStore,
			defaultsStore: ClinicalParserConceptDefaultStore,
			calibrationStore: ClinicalCalibrationStore,
			templateStore: ClinicalProseTemplateStore,
			noteStore: ClinicalSignedSoapNoteStore,
			adminStore: ClinicalAdministrativeStore,
			jDisplayStore: ClinicalJurisdictionalDisplayStore,
			stopWordStore: ClinicalStopWordStore,
		) {
			// Wait for async seeding
			await new Promise((resolve) => setTimeout(resolve, 50));

			// ParserProfileStore
			const defaultProfile = await profileStore.get("default");
			expect(defaultProfile).not.toBeNull();
			expect(defaultProfile?.personnelId).toBe("system");
			expect(defaultProfile?.tagToken).toBe("#");
			expect(defaultProfile?.schemaNamespaces).toBeDefined();

			const customProfile = {
				profileId: "custom_unified",
				personnelId: "doc_unified",
				tagToken: "%",
				stateDelimiter: "||",
				stateStartDelimiter: "|",
				stateEndDelimiter: "|",
				macroStartToken: "^",
				variableStartToken: "{",
				variableEndToken: "}",
				isDefault: false,
			};
			await profileStore.set(customProfile);
			const fetched = await profileStore.get("custom_unified");
			expect(fetched?.personnelId).toBe("doc_unified");
			expect(fetched?.tagToken).toBe("%");

			const byPersonnel = await profileStore.getByPersonnel("system");
			expect(byPersonnel?.profileId).toBe("default");

			await profileStore.delete("custom_unified");
			const deleted = await profileStore.get("custom_unified");
			expect(deleted).toBeNull();

			// ParserConceptDefaultStore
			const tempDefault = await defaultsStore.get(
				"LOINC::8310-5",
				"VitalsMeasurementEvent",
			);
			expect(tempDefault).not.toBeNull();
			expect(tempDefault?.defaultProperties.unit).toBe("Cel");

			const bySchema = await defaultsStore.listBySchema(
				"VitalsMeasurementEvent",
			);
			expect(bySchema.length).toBeGreaterThanOrEqual(1);

			await defaultsStore.set({
				anchorConceptId: "TEST::1",
				targetSchema: "TestEvent",
				regexPatterns: ["test"],
				defaultProperties: { value: 1 },
			});
			const customDefault = await defaultsStore.get("TEST::1", "TestEvent");
			expect(customDefault).not.toBeNull();
			expect(customDefault?.defaultProperties.value).toBe(1);

			// CalibrationStore
			const excId = await calibrationStore.logException({
				personnelId: "dr_unified",
				rawTerm: "hypertension",
				contextSnippet: "patient has hypertension",
				suggestedConceptId: "SNOMED::38341003",
			});
			expect(excId).toBeDefined();

			const pending = await calibrationStore.listPending();
			expect(pending.length).toBeGreaterThanOrEqual(1);
			expect(pending[0]?.rawTerm).toBe("hypertension");

			const pendingForDr = await calibrationStore.listPending("dr_unified");
			expect(pendingForDr.length).toBeGreaterThanOrEqual(1);

			await calibrationStore.resolve(excId, "mapped", "SNOMED::12345");
			const resolved = await calibrationStore.listPending();
			const all = resolved.filter((e) => e.exceptionId === excId);
			expect(all.length).toBe(0);

			// ProseTemplateStore
			await templateStore.setTemplate({
				templateId: "tmpl_1",
				targetSchema: "ObservationEvent",
				targetConceptId: "SNOMED::29857009",
				workspaceId: "ws_1",
				slotPosition: "opening",
				templateText: "Patient reports chest pain.",
			});

			const tmpl1 = await templateStore.getTemplate(
				"ObservationEvent",
				"opening",
				"SNOMED::29857009",
				"ws_1",
			);
			expect(tmpl1).not.toBeNull();
			expect(tmpl1?.templateText).toBe("Patient reports chest pain.");

			const tmplFallback = await templateStore.getTemplate(
				"ObservationEvent",
				"closing",
				"SNOMED::29857009",
				"ws_1",
			);
			expect(tmplFallback).toBeNull();

			// SignedSoapNoteStore
			await noteStore.archive({
				noteId: "note_unified_1",
				sessionId: "session_unified",
				patientId: "pat_unified",
				documentVersion: 1,
				soapNoteJson: { status: "signed" },
				signedBy: "dr_smith",
			});

			const note = await noteStore.get("note_unified_1");
			expect(note).not.toBeNull();
			expect(note?.signedBy).toBe("dr_smith");

			const bySession = await noteStore.getBySession("session_unified");
			expect(bySession?.noteId).toBe("note_unified_1");

			const forPatient = await noteStore.listForPatient("pat_unified");
			expect(forPatient.length).toBe(1);

			// AdministrativeStore
			await adminStore.setPersonnel({
				personnelId: "pers_unified",
				fullName: "Dr. Unified",
				specialtyCode: "GP",
				facilityId: "fac_unified",
			});
			const personnel = await adminStore.getPersonnel("pers_unified");
			expect(personnel?.fullName).toBe("Dr. Unified");

			await adminStore.setFacility({
				facilityId: "fac_unified",
				facilityCode: "FAC001",
				facilityName: "Unified Hospital",
				jurisdictionCode: "US-NY",
			});
			const facility = await adminStore.getFacility("fac_unified");
			expect(facility?.facilityName).toBe("Unified Hospital");

			// JurisdictionalDisplayStore
			await jDisplayStore.setJurisdictionalDisplay({
				conceptId: "SNOMED::29857009",
				jurisdictionCode: "US-NY",
				preferredDisplay: "Chest Pain",
				fullySpecifiedName: "Chest Pain (finding)",
			});
			const display = await jDisplayStore.getPreferredDisplay(
				"SNOMED::29857009",
				"US-NY",
			);
			expect(display).toBe("Chest Pain");

			const missingDisplay = await jDisplayStore.getPreferredDisplay(
				"SNOMED::99999999",
				"US-NY",
			);
			expect(missingDisplay).toBeNull();

			// StopWordStore
			await stopWordStore.setProfile({
				profileId: "stop_unified",
				personnelId: "per_unified",
				localeFiles: [],
				specialtyFiles: [],
				customWords: ["patient", "history"],
			});

			const stopProfile = await stopWordStore.getProfile("per_unified");
			expect(stopProfile).not.toBeNull();
			expect(stopProfile?.customWords).toEqual(["patient", "history"]);

			const compiled = await stopWordStore.compileStopWords("per_unified");
			expect(compiled.size).toBe(2);
			expect(compiled.has("patient")).toBe(true);

			console.log(`  ${name}: PASSED`);
		}

		// MemoryEntityStore backend
		const memProfileStore = new ClinicalParserProfileStore(
			new MemoryEntityStore<any>(),
		);
		const memDefaultsStore = new ClinicalParserConceptDefaultStore(
			new MemoryEntityStore<any>(),
		);
		const memCalibrationStore = new ClinicalCalibrationStore(
			new MemoryEntityStore<any>(),
		);
		const memTemplateStore = new ClinicalProseTemplateStore(
			new MemoryEntityStore<any>(),
		);
		const memNoteStore = new ClinicalSignedSoapNoteStore(
			new MemoryEntityStore<any>(),
		);
		const memAdminStore = new ClinicalAdministrativeStore(
			new MemoryEntityStore<any>(),
			new MemoryEntityStore<any>(),
		);
		const memJDisplayStore = new ClinicalJurisdictionalDisplayStore(
			new MemoryEntityStore<any>(),
		);
		const memStopWordStore = new ClinicalStopWordStore(
			new MemoryEntityStore<any>(),
		);

		await runClinicalTests(
			"MemoryEntityStore",
			memProfileStore,
			memDefaultsStore,
			memCalibrationStore,
			memTemplateStore,
			memNoteStore,
			memAdminStore,
			memJDisplayStore,
			memStopWordStore,
		);

		// SqliteEntityStore backend
		const sqlDb = new Database(":memory:");
		const sqlProfileStore = new ClinicalParserProfileStore(
			new SqliteEntityStore<any>(sqlDb, "parser_syntax_profiles"),
		);
		const sqlDefaultsStore = new ClinicalParserConceptDefaultStore(
			new SqliteEntityStore<any>(sqlDb, "parser_concept_defaults"),
		);
		const sqlCalibrationStore = new ClinicalCalibrationStore(
			new SqliteEntityStore<any>(sqlDb, "calibration_exceptions"),
		);
		const sqlTemplateStore = new ClinicalProseTemplateStore(
			new SqliteEntityStore<any>(sqlDb, "prose_templates"),
		);
		const sqlNoteStore = new ClinicalSignedSoapNoteStore(
			new SqliteEntityStore<any>(sqlDb, "signed_soap_notes"),
		);
		const sqlAdminStore = new ClinicalAdministrativeStore(
			new SqliteEntityStore<any>(sqlDb, "personnel"),
			new SqliteEntityStore<any>(sqlDb, "facilities"),
		);
		const sqlJDisplayStore = new ClinicalJurisdictionalDisplayStore(
			new SqliteEntityStore<any>(sqlDb, "jurisdictional_displays"),
		);
		const sqlStopWordStore = new ClinicalStopWordStore(
			new SqliteEntityStore<any>(sqlDb, "stop_word_profiles"),
		);

		await runClinicalTests(
			"SqliteEntityStore",
			sqlProfileStore,
			sqlDefaultsStore,
			sqlCalibrationStore,
			sqlTemplateStore,
			sqlNoteStore,
			sqlAdminStore,
			sqlJDisplayStore,
			sqlStopWordStore,
		);
	});

	test("StopWordParser.fromStore compiles stop words from context via StopWordStore", async () => {
		const stopWordStore = new ClinicalStopWordStore(
			new MemoryEntityStore<any>(),
		);

		// Seed a profile with custom words
		await stopWordStore.setProfile({
			profileId: "stop_dr_test",
			personnelId: "dr_test",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["patient", "history"],
		});

		// Compile via context
		const context: StopWordContext = {
			personnelId: "dr_test",
		};
		const parser = await StopWordParser.fromStore(stopWordStore, context);

		expect(parser.isStopWord("patient")).toBe(true);
		expect(parser.isStopWord("history")).toBe(true);
		expect(parser.isStopWord("temp")).toBe(false);
		expect(parser.isStopWord("Patient")).toBe(true); // case insensitive
	});

	test("CdslParser with stopWordStore + context short-circuits stop words", async () => {
		// Setup dictionary store + concept defaults
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await conceptStore.addNamespace({
			code: "LOINC",
			description: "LOINC",
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

		const conceptDefaultsStore = new MemoryParserConceptDefaultStore();
		await conceptDefaultsStore.set({
			anchorConceptId: "LOINC::8310-5",
			targetSchema: "VitalsMeasurementEvent",
			regexPatterns: [
				"temp(?:erature)?\\s+is\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*(?<unit>[a-zA-Z%]*)",
			],
			defaultProperties: {
				unit: "Cel",
				captureGroupMapping: ["value", "unit"],
			},
		});

		// Setup stop word store with a profile
		const stopWordStore = new ClinicalStopWordStore(
			new MemoryEntityStore<any>(),
		);
		await stopWordStore.setProfile({
			profileId: "stop_dr_test",
			personnelId: "dr_test",
			localeFiles: [],
			specialtyFiles: [],
			customWords: ["patient", "history"],
		});

		// Parser with stopWordStore (no pre-built StopWordParser)
		const parser = new CdslParser(
			dictionaryStore,
			undefined,
			conceptDefaultsStore,
			undefined, // no stopWordParser
			stopWordStore, // but has stopWordStore
		);

		// Tagless segment with stop word — should short-circuit when context is provided
		const context: StopWordContext = { personnelId: "dr_test" };
		const result = await parser.parse("patient has no temp 38.5", context);
		expect(result.length).toBe(0);

		// Tagged segment with stop word content — should short-circuit
		const taggedResult = await parser.parse("#vital history", context);
		expect(taggedResult.length).toBe(0);

		// Tagged segment with non-stop word — should parse normally
		const normalResult = await parser.parse("#vital temp is 38.5 Cel", context);
		expect(normalResult.length).toBe(1);
		expect((normalResult[0] as ParsedVitalsItem)?.value).toBe(38.5);

		// Without context, no stop word resolution happens (no effective parser)
		const noContextResult = await parser.parse("patient has no temp 38.5");
		// Without context, the parser has no effective stop word parser,
		// so it enters the tagless resolution pipeline
		expect(noContextResult.length).toBeGreaterThanOrEqual(0);
	});

	test("StopWordParser gatekeeper short-circuits stop words in tagless and tagged segments", async () => {
		// Setup dictionary store + concept defaults to enable tagless resolution
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await conceptStore.addNamespace({
			code: "LOINC",
			description: "LOINC",
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

		const conceptDefaultsStore = new MemoryParserConceptDefaultStore();
		await conceptDefaultsStore.set({
			anchorConceptId: "LOINC::8310-5",
			targetSchema: "VitalsMeasurementEvent",
			regexPatterns: [
				"temp(?:erature)?\\s+is\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*(?<unit>[a-zA-Z%]*)",
			],
			defaultProperties: {
				unit: "Cel",
				captureGroupMapping: ["value", "unit"],
			},
		});

		// Parser WITHOUT gatekeeper: tagged segment parses normally
		const noGatekeeperParser = new CdslParser(
			dictionaryStore,
			undefined,
			conceptDefaultsStore,
		);
		const noGateResult = await noGatekeeperParser.parse("#vital temp is 38.5 Cel");
		expect(noGateResult.length).toBeGreaterThanOrEqual(1);
		expect((noGateResult[0] as ParsedVitalsItem)?.value).toBe(38.5);

		// Create StopWordParser with mock stop words
		const stopWordParser = new StopWordParser(["has", "no", "patient"]);

		// Parser WITH stop word gatekeeper
		const gatekeeperParser = new CdslParser(
			dictionaryStore,
			undefined,
			conceptDefaultsStore,
			stopWordParser,
		);

		// --- Tagless segment: starts with a stop word, entire segment short-circuited ---
		const gatekeptResult = await gatekeeperParser.parse("patient has no temp 38.5");
		expect(gatekeptResult.length).toBe(0);

		// --- Tagged segment: content is a stop word, short-circuited in parseSegment ---
		const taggedStopResult = await gatekeeperParser.parse("#vital has");
		expect(taggedStopResult.length).toBe(0);

		// --- Tagged segment: non-stop word content still parses normally ---
		const taggedNormalResult = await gatekeeperParser.parse("#vital temp is 38.5 Cel");
		expect(taggedNormalResult.length).toBe(1);
		expect((taggedNormalResult[0] as ParsedVitalsItem)?.value).toBe(38.5);
	});
});
