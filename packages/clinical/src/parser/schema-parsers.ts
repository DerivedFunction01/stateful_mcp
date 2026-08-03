import type { DictionaryStore } from "@stateful-mcp/core";
import type { AnatomyCandidate } from "../parser/helpers/anatomy-helper";
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
	anatomyCandidates?: AnatomyCandidate[];
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
	[CANONICAL_TAGS.CLINICAL_DATE_RANGE, new ClinicalDateRangeSchemaParser()],
]);
