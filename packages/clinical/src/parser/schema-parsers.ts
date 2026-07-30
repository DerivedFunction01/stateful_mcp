import type { DictionaryStore } from "@stateful-mcp/core";
import type { QuantityCandidate } from "../parser/helpers/measurement-helper";
import type { MedicationFrequency } from "../schemas/medication";
import type { CodeableConcept } from "../schemas/shared";
import type {
	AttributeParserRule,
	ConceptFieldStore,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
	ParserSyntaxProfile,
	PatientLearningContext,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/learning/interfaces";
import {
	algorithmicEvaluationConfig,
	assessmentConfig,
	assessmentRouter,
	createAssessmentFieldRegistry,
	differentialDiagnosisConfig,
} from "./field-registry/assessment";
import {
	createDiagnosticFieldRegistry,
	deviceDiagnosticObjectConfig,
	diagnosticRouter,
	labPanelResultConfig,
	physicalExamObjectConfig,
} from "./field-registry/diagnostic";
import {
	createEnvironmentFieldRegistry,
	environmentConfig,
	environmentRouter,
} from "./field-registry/environment";
import {
	createExposureFieldRegistry,
	exposureConfig,
	exposureRouter,
} from "./field-registry/exposure";
import {
	allergyConfig,
	createHistoryFieldRegistry,
	historyRouter,
	reportedMedicationConfig,
	socialHistoryConfig,
} from "./field-registry/history";
import {
	createInjuryFieldRegistry,
	injuryRouter,
	mechanicalInjuryConfig,
	protectiveEquipmentConfig,
} from "./field-registry/injury";
import {
	createMedicationFieldRegistry,
	medicationConfig,
	medicationRouter,
} from "./field-registry/medication";
import {
	createObservationFieldRegistry,
	observationConfig,
	observationRouter,
} from "./field-registry/observation";
import {
	createPatientFieldRegistry,
	patientConfig,
	patientRouter,
} from "./field-registry/patient";
import {
	createPlanFieldRegistry,
	interventionOrderConfig,
	investigationOrderConfig,
	militaryPlanExtensionConfig,
	planRouter,
	referralOrderConfig,
	safetyNettingPlanConfig,
} from "./field-registry/plan";
import {
	bpVitalConfig,
	createVitalsFieldRegistry,
	heightVitalConfig,
	hrVitalConfig,
	o2VitalConfig,
	rrVitalConfig,
	tempVitalConfig,
	vitalsConfig,
	vitalsRouter,
	weightVitalConfig,
} from "./field-registry/vitals";
import { GenericSchemaParser } from "./generic-schema-parser";
import { ClinicalDateRangeSchemaParser } from "./parsers/clinical-date-range-parser";

export const CANONICAL_TAGS = {
	VITALS: "VitalsMeasurementEvent",
	OBSERVATION: "ObservationEvent",
	MEDICATION: "MedicationOrderObject",
	CLINICAL_DATE_RANGE: "ClinicalDateRange",
	ASSESSMENT: "PrimaryDiagnosisEntry",
	ALLERGY: "AllergyEntry",
	SOCIAL_HISTORY: "SocialHistoryEntry",
	REPORTED_MEDICATION: "ReportedMedicationEntry",
	INVESTIGATION_ORDER: "InvestigationOrderObject",
	REFERRAL_ORDER: "ReferralOrderObject",
	INTERVENTION_ORDER: "InterventionOrderObject",
	SAFETY_NETTING_PLAN: "SafetyNettingPlan",
	EXPOSURE: "ExposureEvent",
	MECHANICAL_INJURY: "MechanicalInjuryObject",
	PROTECTIVE_EQUIPMENT: "ProtectiveEquipmentObject",
	LAB_PANEL_RESULT: "LabPanelResult",
	DEVICE_DIAGNOSTIC_OBJECT: "DeviceDiagnosticObject",
	ENVIRONMENT_CONTEXT_OBJECT: "EnvironmentContextObject",
	PATIENT_PROFILE: "PatientProfile",
	DIFFERENTIAL_DIAGNOSIS: "DifferentialDiagnosisEntry",
	ALGORITHMIC_EVALUATION: "AlgorithmicEvaluationObject",
	PHYSICAL_EXAM: "PhysicalExamObject",
	MILITARY_PLAN_EXTENSION: "MilitaryPlanExtension",
	BLOOD_PRESSURE: "BloodPressureVitalEvent",
	TEMPERATURE: "TemperatureVitalEvent",
	HEART_RATE: "HeartRateVitalEvent",
	RESPIRATORY_RATE: "RespiratoryRateVitalEvent",
	OXYGEN_SATURATION: "OxygenSaturationVitalEvent",
	WEIGHT: "WeightVitalEvent",
	HEIGHT: "HeightVitalEvent",
} as const;

export interface ParsedItem {
	targetSchema: string;
	attributes: Record<string, any>;
	concept: CodeableConcept[];
	rawText: string;
	tag: string;
	extractedData: Record<string, any>;
	conceptFields?: Record<string, CodeableConcept[]>;
}

export interface PreparsedContext {
	rawText: string;
	normalizedText?: string;
	candidates: Record<string, QuantityCandidate[]>;
	looseCandidates: QuantityCandidate[];
	timeCandidates: QuantityCandidate[];
	frequency?: MedicationFrequency | null;
	attributes: Record<string, string>;
	parsedPartial?: Record<string, any>;
	profile?: Pick<ParserSyntaxProfile, "schemaDefaults" | "defaultsStrategy">;
	rankingSignals?: RankingSignal;
	patientContext?: PatientLearningContext;
}

export interface ScoredParseResult {
	parsedItem: ParsedItem;
	completenessScore: number;
	unitAnchorCoherence: boolean;
}

export interface ParsedCandidateEnvelope<TCandidate = ParsedItem> {
	deterministic: TCandidate[];
	learned: TCandidate[];
}

export interface ParsedCandidate<TPayload = unknown> {
	schema: string;
	tag: string;
	payload: TPayload;
	tokens?: QuantityCandidate[];
	attributes?: Record<string, string>;
	exactDiscriminators?: Record<string, string>;
}

export interface RankingSignal {
	personnelId?: string;
	specialtyId?: string;
	facilityId?: string;
	patientId?: string;
	organismType?: string;
	gender?: string;
	ageBucket?: string;
	speciesBucket?: string;
	subBucket?: number;
	bucketKey?: string;
	workspaceId?: string;
	tag?: string;
	targetSchema?: string;
	exactDiscriminators?: Record<string, string>;
}

export interface ParserPreviewResult<TCandidate = ParsedItem> {
	targetSchema: string;
	deterministic: TCandidate[];
	learned: TCandidate[];
}

export interface SchemaParserOptions {
	tag: string;
	content: string;
	dictionaryStore: DictionaryStore;
	conceptDefaultsStore?: ParserConceptDefaultStore;
	attributeRules?: AttributeParserRule[];
	evaluatorRules?: ParserDictionaryRule[];
	termTokenizer?: string;
	allowedNamespaces?: string[];
	preparsedContext?: PreparsedContext;
	historyStore?: ParsedCellHistoryStore;
	conceptFieldStore?: ConceptFieldStore;
	concepts?: CodeableConcept[];
}

export interface SchemaParser {
	targetSchema: string;
	parse(
		options: SchemaParserOptions,
	): Promise<ParsedItem | ParsedItem[] | null>;
	preview?(options: SchemaParserOptions): Promise<ParsedCandidateEnvelope>;
}

export function parseSessionVars(groups: {
	kvPairs: string;
}): Record<string, any> {
	const res: Record<string, any> = {};
	const pairs = groups.kvPairs.split(",");
	for (const pair of pairs) {
		const [k, v] = pair.split("=").map((x) => x.trim());
		if (k && v) {
			const numVal = Number(v);
			res[k] = Number.isNaN(numVal)
				? v === "true"
					? true
					: v === "false"
						? false
						: v
				: numVal;
		}
	}
	return res;
}

const EVALUATOR_FUNCTIONS: Record<string, (groups: any) => any> = {
	parseSessionVars: (groups) => parseSessionVars(groups),
};

export interface ConceptCandidate {
	conceptId: string;
	display: string;
}

export async function resolveConceptHelper(
	text: string,
	dictionaryStore: DictionaryStore,
	termTokenizer?: string,
	allowedNamespaces?: string[],
): Promise<CodeableConcept[]> {
	const candidates = await resolveMultiConceptHelper(
		text,
		dictionaryStore,
		termTokenizer,
		allowedNamespaces,
	);
	return candidates;
}

export async function resolveMultiConceptHelper(
	text: string,
	dictionaryStore: DictionaryStore,
	termTokenizer?: string,
	allowedNamespaces?: string[],
): Promise<CodeableConcept[]> {
	const candidates: CodeableConcept[] = [];
	const tokenizer = termTokenizer || "::";

	if (text.includes(tokenizer)) {
		const idx = text.indexOf(tokenizer);
		const ns = text.slice(0, idx).trim();
		const code = text.slice(idx + tokenizer.length).trim();
		const results = await dictionaryStore.search(code, ns, 5);
		if (results) {
			for (const r of results) {
				if (r) {
					candidates.push({
						conceptId: `${r.namespaceCode}::${r.standardCode}`,
						display: r.display,
					});
				}
			}
		}
	}

	const resolved = await dictionaryStore.resolve(text);
	if (resolved && resolved.results) {
		for (const agg of resolved.results) {
			const ns = agg.concept.namespaceCode;
			if (allowedNamespaces && allowedNamespaces.length > 0) {
				if (!allowedNamespaces.includes(ns)) continue;
			}
			candidates.push({
				conceptId: `${ns}::${agg.concept.standardCode}`,
				display: agg.concept.display,
			});
		}
	}

	return candidates;
}

export const schemaParserRegistry = new Map<string, SchemaParser>([
	[
		CANONICAL_TAGS.OBSERVATION,
		new GenericSchemaParser("ObservationEvent", {
			targetSchema: "ObservationEvent",
			createRegistry: createObservationFieldRegistry,
			router: observationRouter,
			preparsedContextKeys: observationConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.MEDICATION,
		new GenericSchemaParser("MedicationOrderObject", {
			targetSchema: "MedicationOrderObject",
			createRegistry: createMedicationFieldRegistry,
			router: medicationRouter,
			preparsedContextKeys: medicationConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.VITALS,
		new GenericSchemaParser("VitalsMeasurementEvent", {
			targetSchema: "VitalsMeasurementEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("VitalsMeasurementEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: vitalsConfig.preparsedContextKeys,
		}),
	],
	[CANONICAL_TAGS.CLINICAL_DATE_RANGE, new ClinicalDateRangeSchemaParser()],
	[
		CANONICAL_TAGS.ASSESSMENT,
		new GenericSchemaParser("PrimaryDiagnosisEntry", {
			targetSchema: "PrimaryDiagnosisEntry",
			createRegistry: (attrRules) =>
				createAssessmentFieldRegistry("PrimaryDiagnosisEntry", attrRules),
			router: assessmentRouter,
			preparsedContextKeys: assessmentConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.ALLERGY,
		new GenericSchemaParser("AllergyEntry", {
			targetSchema: "AllergyEntry",
			createRegistry: (attrRules) =>
				createHistoryFieldRegistry("AllergyEntry", attrRules),
			router: historyRouter,
			preparsedContextKeys: allergyConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.SOCIAL_HISTORY,
		new GenericSchemaParser("SocialHistoryEntry", {
			targetSchema: "SocialHistoryEntry",
			createRegistry: (attrRules) =>
				createHistoryFieldRegistry("SocialHistoryEntry", attrRules),
			router: historyRouter,
			preparsedContextKeys: socialHistoryConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.REPORTED_MEDICATION,
		new GenericSchemaParser("ReportedMedicationEntry", {
			targetSchema: "ReportedMedicationEntry",
			createRegistry: (attrRules) =>
				createHistoryFieldRegistry("ReportedMedicationEntry", attrRules),
			router: historyRouter,
			preparsedContextKeys: reportedMedicationConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.INVESTIGATION_ORDER,
		new GenericSchemaParser("InvestigationOrderObject", {
			targetSchema: "InvestigationOrderObject",
			createRegistry: (attrRules) =>
				createPlanFieldRegistry("InvestigationOrderObject", attrRules),
			router: planRouter,
			preparsedContextKeys: investigationOrderConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.REFERRAL_ORDER,
		new GenericSchemaParser("ReferralOrderObject", {
			targetSchema: "ReferralOrderObject",
			createRegistry: (attrRules) =>
				createPlanFieldRegistry("ReferralOrderObject", attrRules),
			router: planRouter,
			preparsedContextKeys: referralOrderConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.INTERVENTION_ORDER,
		new GenericSchemaParser("InterventionOrderObject", {
			targetSchema: "InterventionOrderObject",
			createRegistry: (attrRules) =>
				createPlanFieldRegistry("InterventionOrderObject", attrRules),
			router: planRouter,
			preparsedContextKeys: interventionOrderConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.SAFETY_NETTING_PLAN,
		new GenericSchemaParser("SafetyNettingPlan", {
			targetSchema: "SafetyNettingPlan",
			createRegistry: (attrRules) =>
				createPlanFieldRegistry("SafetyNettingPlan", attrRules),
			router: planRouter,
			preparsedContextKeys: safetyNettingPlanConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.EXPOSURE,
		new GenericSchemaParser("ExposureEvent", {
			targetSchema: "ExposureEvent",
			createRegistry: createExposureFieldRegistry,
			router: exposureRouter,
			preparsedContextKeys: exposureConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.MECHANICAL_INJURY,
		new GenericSchemaParser("MechanicalInjuryObject", {
			targetSchema: "MechanicalInjuryObject",
			createRegistry: (attrRules) =>
				createInjuryFieldRegistry("MechanicalInjuryObject", attrRules),
			router: injuryRouter,
			preparsedContextKeys: mechanicalInjuryConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.PROTECTIVE_EQUIPMENT,
		new GenericSchemaParser("ProtectiveEquipmentObject", {
			targetSchema: "ProtectiveEquipmentObject",
			createRegistry: (attrRules) =>
				createInjuryFieldRegistry("ProtectiveEquipmentObject", attrRules),
			router: injuryRouter,
			preparsedContextKeys: protectiveEquipmentConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.LAB_PANEL_RESULT,
		new GenericSchemaParser("LabPanelResult", {
			targetSchema: "LabPanelResult",
			createRegistry: (attrRules) =>
				createDiagnosticFieldRegistry("LabPanelResult", attrRules),
			router: diagnosticRouter,
			preparsedContextKeys: labPanelResultConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.DEVICE_DIAGNOSTIC_OBJECT,
		new GenericSchemaParser("DeviceDiagnosticObject", {
			targetSchema: "DeviceDiagnosticObject",
			createRegistry: (attrRules) =>
				createDiagnosticFieldRegistry("DeviceDiagnosticObject", attrRules),
			router: diagnosticRouter,
			preparsedContextKeys: deviceDiagnosticObjectConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.ENVIRONMENT_CONTEXT_OBJECT,
		new GenericSchemaParser("EnvironmentContextObject", {
			targetSchema: "EnvironmentContextObject",
			createRegistry: createEnvironmentFieldRegistry,
			router: environmentRouter,
			preparsedContextKeys: environmentConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.PATIENT_PROFILE,
		new GenericSchemaParser("PatientProfile", {
			targetSchema: "PatientProfile",
			createRegistry: createPatientFieldRegistry,
			router: patientRouter,
			preparsedContextKeys: patientConfig.preparsedContextKeys,
		}),
	],

	// ── Complex nested items ──
	[
		CANONICAL_TAGS.DIFFERENTIAL_DIAGNOSIS,
		new GenericSchemaParser("DifferentialDiagnosisEntry", {
			targetSchema: "DifferentialDiagnosisEntry",
			createRegistry: (attrRules) =>
				createAssessmentFieldRegistry("DifferentialDiagnosisEntry", attrRules),
			router: assessmentRouter,
			preparsedContextKeys: differentialDiagnosisConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.ALGORITHMIC_EVALUATION,
		new GenericSchemaParser("AlgorithmicEvaluationObject", {
			targetSchema: "AlgorithmicEvaluationObject",
			createRegistry: (attrRules) =>
				createAssessmentFieldRegistry("AlgorithmicEvaluationObject", attrRules),
			router: assessmentRouter,
			preparsedContextKeys: algorithmicEvaluationConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.PHYSICAL_EXAM,
		new GenericSchemaParser("PhysicalExamObject", {
			targetSchema: "PhysicalExamObject",
			createRegistry: (attrRules) =>
				createDiagnosticFieldRegistry("PhysicalExamObject", attrRules),
			router: diagnosticRouter,
			preparsedContextKeys: physicalExamObjectConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.MILITARY_PLAN_EXTENSION,
		new GenericSchemaParser("MilitaryPlanExtension", {
			targetSchema: "MilitaryPlanExtension",
			createRegistry: (attrRules) =>
				createPlanFieldRegistry("MilitaryPlanExtension", attrRules),
			router: planRouter,
			preparsedContextKeys: militaryPlanExtensionConfig.preparsedContextKeys,
		}),
	],

	// ── Vitals discriminated variants ──
	[
		CANONICAL_TAGS.BLOOD_PRESSURE,
		new GenericSchemaParser("BloodPressureVitalEvent", {
			targetSchema: "BloodPressureVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("BloodPressureVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: bpVitalConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.TEMPERATURE,
		new GenericSchemaParser("TemperatureVitalEvent", {
			targetSchema: "TemperatureVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("TemperatureVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: tempVitalConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.HEART_RATE,
		new GenericSchemaParser("HeartRateVitalEvent", {
			targetSchema: "HeartRateVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("HeartRateVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: hrVitalConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.RESPIRATORY_RATE,
		new GenericSchemaParser("RespiratoryRateVitalEvent", {
			targetSchema: "RespiratoryRateVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("RespiratoryRateVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: rrVitalConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.OXYGEN_SATURATION,
		new GenericSchemaParser("OxygenSaturationVitalEvent", {
			targetSchema: "OxygenSaturationVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("OxygenSaturationVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: o2VitalConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.WEIGHT,
		new GenericSchemaParser("WeightVitalEvent", {
			targetSchema: "WeightVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("WeightVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: weightVitalConfig.preparsedContextKeys,
		}),
	],
	[
		CANONICAL_TAGS.HEIGHT,
		new GenericSchemaParser("HeightVitalEvent", {
			targetSchema: "HeightVitalEvent",
			createRegistry: (attrRules) =>
				createVitalsFieldRegistry("HeightVitalEvent", attrRules),
			router: vitalsRouter,
			preparsedContextKeys: heightVitalConfig.preparsedContextKeys,
		}),
	],
]);
