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
	type ParsedObservationItem,
	type ParsedVitalsItem,
} from "../src/parser/cdsl-parser";
import { FrequencyHelper } from "../src/parser/helpers/frequency-helper";
import {
	MeasurementHelper,
	TimeHelper,
} from "../src/parser/helpers/measurement-helper";
import type { PatientProfile } from "../src/schemas/patient";
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
import { DEFAULT_EVALUATOR_RULES } from "../src/store/defaults";
import {
	MemoryParserConceptDefaultStore,
	MemorySignedSoapNoteStore,
} from "../src/store/memory-clinical-store";
import {
	SqliteParserConceptDefaultStore,
	SqliteParserProfileStore,
} from "../src/store/sqlite-clinical-store";

// ---------------------------------------------------------------------------
// Localized seed map — single source of truth for language-agnostic testing
// ---------------------------------------------------------------------------
const LOCALIZED_SEEDS = {
	en: {
		tagToken: "#",
		tagMappings: {
			vital: CANONICAL_TAGS.VITALS,
			observation: CANONICAL_TAGS.OBSERVATION,
			rx: CANONICAL_TAGS.MEDICATION,
		},
		concepts: {
			temp: { id: "LOINC::8310-5", display: "Body temperature" },
			chestPain: { id: "SNOMED::29857009", display: "Chest pain" },
			amoxicillin: { id: "RxNorm::723", display: "Amoxicillin" },
		},
		cdsl: "#vital temp 38.5 Cel || #observation denies chest pain || #rx Amoxicillin oral daily 10 days",
		negationTerm: "denies",
		oralTerm: "oral",
		dailyTerm: "daily",
		attributeRules: [
			{
				targetField: "certainty",
				targetValue: "refuted",
				regexPatterns: ["\\bdenies\\b", "\\bno\\s+presenta\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "status",
				targetValue: "resolved",
				regexPatterns: ["\\bdenies\\b", "\\bno\\s+presenta\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "severity",
				targetValue: "severe",
				regexPatterns: ["\\bsevere\\b", "\\bgrave\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "route",
				targetValue: "oral",
				regexPatterns: ["\\boral\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "frequency_shorthand",
				targetValue: "QD",
				regexPatterns: ["\\bdaily\\b"],
				isCaseInsensitive: true,
			},
		],
	},
	es: {
		tagToken: "$",
		tagMappings: {
			vital: CANONICAL_TAGS.VITALS,
			observacion: CANONICAL_TAGS.OBSERVATION,
			receta: CANONICAL_TAGS.MEDICATION,
		},
		concepts: {
			temp: { id: "LOINC::8310-5", display: "Temperatura corporal" },
			chestPain: { id: "SNOMED::29857009", display: "Dolor de pecho" },
			amoxicillin: { id: "RxNorm::723", display: "Amoxicilina" },
		},
		cdsl: "$vital temp 38.5 Cel || $observacion niega dolor de pecho || $receta Amoxicilina oral diario 10 days",
		negationTerm: "niega",
		oralTerm: "oral",
		dailyTerm: "diario",
		attributeRules: [
			{
				targetField: "certainty",
				targetValue: "refuted",
				regexPatterns: ["\\bniega\\b", "\\bno\\s+presenta\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "status",
				targetValue: "resolved",
				regexPatterns: ["\\bniega\\b", "\\bno\\s+presenta\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "severity",
				targetValue: "severe",
				regexPatterns: ["\\bgrave\\b", "\\bsevero\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "route",
				targetValue: "oral",
				regexPatterns: ["\\boral\\b"],
				isCaseInsensitive: true,
			},
			{
				targetField: "frequency_shorthand",
				targetValue: "QD",
				regexPatterns: ["\\bdiario\\b"],
				isCaseInsensitive: true,
			},
		],
	},
} as const;

type LanguageSeed = (typeof LOCALIZED_SEEDS)[keyof typeof LOCALIZED_SEEDS];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function seedNamespaces(conceptStore: InMemoryConceptStore) {
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
}

async function seedConcepts(
	conceptStore: InMemoryConceptStore,
	lang: LanguageSeed,
) {
	const c = lang.concepts;
	await conceptStore.addConcept({
		id: c.temp.id,
		namespaceCode: "LOINC",
		standardCode: "8310-5",
		display: c.temp.display,
		description: "temp",
		active: true,
	});
	await conceptStore.addConcept({
		id: c.chestPain.id,
		namespaceCode: "SNOMED",
		standardCode: "29857009",
		display: c.chestPain.display,
		active: true,
	});
	await conceptStore.addConcept({
		id: c.amoxicillin.id,
		namespaceCode: "RxNorm",
		standardCode: "723",
		display: c.amoxicillin.display,
		active: true,
	});
}

function makeLocalizedProfile(lang: LanguageSeed, profileOverrides?: any) {
	return {
		profileId: `localized_${lang.tagToken}`,
		personnelId: `doc_${lang.tagToken}`,
		tagToken: lang.tagToken,
		stateDelimiter: "||",
		stateStartDelimiter: "|",
		stateEndDelimiter: "|",
		macroStartToken: "^",
		variableStartToken: "{",
		variableEndToken: "}",
		isDefault: false,
		tagMappings: lang.tagMappings,
		attributeRules: lang.attributeRules,
		schemaNamespaces: {
			vitalsmeasurementevent: ["LOINC"],
			observationevent: ["SNOMED"],
			medicationorderobject: ["RxNorm"],
		},
		evaluatorRules: DEFAULT_EVALUATOR_RULES,
		...profileOverrides,
	};
}

// (createLocalizedEngine helper is no longer needed for the main test,
//  but kept for reference; can be removed in a future cleanup)
async function createLocalizedEngine(
	lang: LanguageSeed,
	options?: { conceptDefaultsStore?: MemoryParserConceptDefaultStore },
) {
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

	await seedNamespaces(conceptStore);
	await seedConcepts(conceptStore, lang);

	const signedNoteStore = new MemorySignedSoapNoteStore();
	const engine = new ClinicalEngine(
		objectStore,
		dictionaryStore,
		signedNoteStore,
	);

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

	return {
		objectStore,
		dictionaryStore,
		engine,
		conceptStore,
		signedNoteStore,
		patient,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Clinical IDE Stateful Backend", () => {
	// ── Parameterized localized test: runs for every language ─────────
	// All languages run through the same engine to avoid Ajv schema
	// re-registration conflicts (Ajv caches compiled schemas by $id globally).
	test("Parameterized localized languages resolve identically (en + es)", async () => {
		// Create a single engine shared across languages
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

		await seedNamespaces(conceptStore);
		// Seed ALL language concepts into the single store
		for (const lang of Object.values(LOCALIZED_SEEDS)) {
			await seedConcepts(conceptStore, lang);
		}

		const signedNoteStore = new MemorySignedSoapNoteStore();
		const engine = new ClinicalEngine(
			objectStore,
			dictionaryStore,
			signedNoteStore,
		);

		const basePatient: PatientProfile = {
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

		for (const [langCode, lang] of Object.entries(LOCALIZED_SEEDS)) {
			const sessionId = `session_enc_${langCode}`;

			// Setup localized engine/stores for this language to ensure the correct syntax profile is active
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

			await seedNamespaces(conceptStore);
			await seedConcepts(conceptStore, lang);

			const profile = makeLocalizedProfile(lang);
			const signedNoteStore = new MemorySignedSoapNoteStore();
			// Instantiate the engine with the localized profile
			const engine = new ClinicalEngine(
				objectStore,
				dictionaryStore,
				signedNoteStore,
			);
			// We override the internal parser instance to use the localized profile settings
			(engine as any).parser = new CdslParser(dictionaryStore, profile);

			// Initialize encounter
			const noteId = await engine.initEncounter(sessionId, basePatient);
			expect(noteId).toBeDefined();

			const noteObj = await objectStore.getObject("active_note", sessionId);
			expect(noteObj).not.toBeNull();
			expect(noteObj?.data.status).toBe("draft");
			expect(noteObj?.data.patient.name.primaryOrSurname).toBe("Doe");

			// Process localized CDSL
			const updatedNote = await engine.processCdsl(sessionId, lang.cdsl);

			// Assert Vitals mapped
			expect(updatedNote.objective.vitals.length).toBe(1);
			expect(updatedNote.objective.vitals[0]!.measurement.magnitude).toBe(38.5);
			expect(updatedNote.objective.vitals[0]!.measurement.unit!.display).toBe(
				"Cel",
			);

			// Assert Observation mapped & negated
			expect(updatedNote.subjective.observations.length).toBe(1);
			expect(updatedNote.subjective.observations[0]!.certainty).toBe("refuted");
			expect(updatedNote.subjective.observations[0]!.status).toBe("resolved");

			// Assert Medication mapped
			expect(updatedNote.plan.medications.length).toBe(1);
			expect(updatedNote.plan.medications[0]!.route as string).toBe("oral");
			expect(updatedNote.plan.medications[0]!.frequency?.cadenceType).toBe(
				"interval",
			);
			expect(
				updatedNote.plan.medications[0]!.frequency?.interval?.multiplier,
			).toBe(1);
			expect(updatedNote.plan.medications[0]!.frequency?.interval?.unit).toBe(
				"day",
			);
			expect(updatedNote.plan.medications[0]!.frequency?.isPrn).toBe(false);

			// Sign encounter
			const signedRecord = await engine.signEncounter(sessionId, "dr_smith_99");
			expect(signedRecord.noteId).toBe(noteId);
			expect(signedRecord.signedBy).toBe("dr_smith_99");

			const signedNoteObj = await objectStore.getObject(
				"active_note",
				sessionId,
			);
			expect(signedNoteObj?.data.status).toBe("signed");

			expect(
				engine.processCdsl(sessionId, `${lang.tagToken}vital temp 37.0`),
			).rejects.toThrow();

			const archivedRecord = await signedNoteStore.get(noteId);
			expect(archivedRecord).not.toBeNull();
			expect(archivedRecord?.signedBy).toBe("dr_smith_99");
			expect(archivedRecord?.soapNoteJson.status).toBe("signed");
		}
	});

	// ── Custom tagToken profile & canonical interface names ──────────
	test("Custom tagToken profile & canonical interface names", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

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
			tagMappings: {
				vital: CANONICAL_TAGS.VITALS,
				vitalsmeasurementevent: CANONICAL_TAGS.VITALS,
			},
		};
		const customParser = new CdslParser(dictionaryStore, customProfile);
		const parsedCustom = await customParser.parse(
			"$vital temp 39.1 Cel || $vitalsmeasurementevent pulse 90 /min",
		);
		expect(parsedCustom.length).toBe(2);
		expect((parsedCustom[0] as ParsedVitalsItem)?.value).toBe(39.1);
		expect((parsedCustom[1] as ParsedVitalsItem)?.value).toBe(90);
	});

	// ── Custom tagMappings (internationalization) ───────────────────
	test("Custom tagMappings (i18n spanish tag aliases)", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

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
	});

	// ── Custom attributeRules (localized negation/severity) ──────────
	test("Custom attributeRules for localized negation/severity", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

		const spanishAttrProfile = {
			profileId: "es_clinic_attributes",
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
				observation: CANONICAL_TAGS.OBSERVATION,
			},
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
		const ruleParser = new CdslParser(dictionaryStore, spanishAttrProfile);
		const parsedRules = await ruleParser.parse(
			"$observation niega Chest Pain || $observation grave Chest Pain",
		);
		expect(parsedRules.length).toBe(2);
		expect((parsedRules[0] as ParsedObservationItem)?.certainty).toBe(
			"refuted",
		);
		expect(parsedRules[0]?.anchorText).toBe("Chest Pain");
		expect((parsedRules[1] as ParsedObservationItem)?.severity).toBe("severe");
		expect(parsedRules[1]?.anchorText).toBe("Chest Pain");
	});

	// ── ParserConceptDefaultStore with regex capture groups ──────────
	test("ParserConceptDefaultStore with regex capture groups", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

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
	});

	// ── Direct term tokenizer resolution (LOINC::8310-5) ─────────────
	test("Direct term tokenizer resolution (LOINC::8310-5)", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

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
			tagMappings: {
				vital: CANONICAL_TAGS.VITALS,
			},
		};
		const tokenizerParser = new CdslParser(dictionaryStore, tokenizerProfile);
		const parsedTokenizer = await tokenizerParser.parse(
			"#vital LOINC::8310-5 38.4 Cel",
		);
		expect(parsedTokenizer.length).toBe(1);
		expect(parsedTokenizer[0]?.conceptId).toBeDefined();
		expect(parsedTokenizer[0]?.display).toBe("Body temperature");
	});

	// ── Tagless resolution guessing fallback ─────────────────────────
	test("Tagless resolution guessing fallback", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

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

		// Tagless test deprecated/disabled due to transition to Ensemble NER position-agnostic scoring.
		/*
		const defaultParser = new CdslParser(
			dictionaryStore,
			undefined,
			conceptDefaultsStore,
		);
		const parsedTagless = await defaultParser.parse(
			"temp 37.9 Cel || Chest Pain denies || Amoxicillin daily",
		);
		expect(parsedTagless.length).toBe(3);
		expect(parsedTagless[0]?.targetSchema).toBe("VitalsMeasurementEvent");
		expect((parsedTagless[0] as ParsedVitalsItem)?.value).toBe(37.9);
		expect(parsedTagless[1]?.targetSchema).toBe("ObservationEvent");
		expect((parsedTagless[1] as ParsedObservationItem)?.certainty).toBe("refuted");
		expect(parsedTagless[2]?.targetSchema).toBe("MedicationOrderObject");
		*/
	});

	// ── schemaNamespaces configuration filtering ─────────────────────
	test("schemaNamespaces configuration filtering", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

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
			tagMappings: {
				observation: CANONICAL_TAGS.OBSERVATION,
			},
		};
		const namespacesParser = new CdslParser(dictionaryStore, namespacesProfile);
		const parsedNS = await namespacesParser.parse(
			"#observation Chest Pain denies",
		);
		expect(parsedNS.length).toBe(1);
		expect(parsedNS[0]?.conceptId).toBeDefined();
	});

	// ── Blood pressure custom unit capture ───────────────────────────
	test("Blood pressure custom unit capture", async () => {
		const resolver = new InMemoryConceptResolver();
		const conceptStore = new InMemoryConceptStore();
		const exprStore = new InMemoryPersistentExpressionStore();
		const dictionaryStore = new DictionaryStore(
			resolver,
			conceptStore,
			exprStore,
		);

		await seedNamespaces(conceptStore);
		await seedConcepts(conceptStore, LOCALIZED_SEEDS.en);

		const defaultParser = new CdslParser(dictionaryStore);
		const parsedBPUnit = await defaultParser.parse(
			"#vital bp 120/80 bar || #vital bp 125/85",
		);
		expect(parsedBPUnit.length).toBe(2);
		expect((parsedBPUnit[0] as ParsedVitalsItem)?.value).toBe("120/80");
		expect((parsedBPUnit[0] as ParsedVitalsItem)?.unit).toBe("bar");
		expect((parsedBPUnit[1] as ParsedVitalsItem)?.value).toBe("125/85");
		expect((parsedBPUnit[1] as ParsedVitalsItem)?.unit).toBe("mmHg");
	});

	// ── MeasurementHelper and TimeHelper sub-parsing ─────────────────
	test("MeasurementHelper and TimeHelper sub-parsing", async () => {
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

		// FrequencyHelper rate sub-parsing
		const freqRules = [
			{
				targetField: "time_unit",
				targetValue: "year",
				regexPatterns: ["years?", "años?", "año"],
				isCaseInsensitive: true,
			},
			{
				targetField: "time_unit",
				targetValue: "week",
				regexPatterns: ["weeks?", "semanas?", "semana"],
				isCaseInsensitive: true,
			},
		];
		const evalRules = [
			{
				ruleId: "freq_times",
				targetField: "frequency_details",
				evaluatorName: "parseFrequencyTimes",
				regexPatterns: [
					"(?<multiplier>\\d+(?:\\.\\d+)?)\\s*(?:times|veces)?\\s*(?:per|al|a\\s+la|por)\\s*(?<unit>\\S+)",
				],
			},
		];

		const parsedRateYear = FrequencyHelper.parse(
			"150 times per year",
			freqRules,
			evalRules,
		);
		expect(parsedRateYear?.cadenceType).toBe("interval");
		expect(parsedRateYear?.rate?.times).toBe(150);
		expect(parsedRateYear?.rate?.period).toBe("year");

		const parsedRateWeek = FrequencyHelper.parse(
			"3 veces por semana",
			freqRules,
			evalRules,
		);
		expect(parsedRateWeek?.cadenceType).toBe("interval");
		expect(parsedRateWeek?.rate?.times).toBe(3);
		expect(parsedRateWeek?.rate?.period).toBe("week");
	});

	// ── Language-neutral dynamic attribute rule translations for helpers
	test("Language-neutral dynamic attribute rules for MeasurementHelper and TimeHelper", async () => {
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
	});

	// ── Generic SQLite entity store clinical adapters ────────────────
	test("Generic SQLite entity store clinical adapters", async () => {
		const testDb = new Database(":memory:");
		const sqliteProfileStore = new SqliteParserProfileStore(testDb);
		const sqliteDefaultsStore = new SqliteParserConceptDefaultStore(testDb);

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

	// ── Unified clinical store: MemoryEntityStore vs SqliteEntityStore
	test("Unified clinical store works identically with MemoryEntityStore and SqliteEntityStore", async () => {
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

	// ── StopWordParser.fromStore compiles stop words from context ────
	test("StopWordParser.fromStore compiles stop words from context via StopWordStore", async () => {
		// Disabled legacy test
	});

	// ── CdslParser with stopWordStore + context short-circuits stop words ──────────────────────
	test("CdslParser with stopWordStore + context short-circuits stop words", async () => {
		// Disabled legacy test
	});

	// ── StopWordParser gatekeeper short-circuits stop words ──────────
	test("StopWordParser gatekeeper short-circuits stop words in tagless and tagged segments", async () => {
		// Disabled legacy test
	});
});
