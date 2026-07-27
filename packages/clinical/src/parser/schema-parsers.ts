import type { DictionaryStore } from "@stateful-mcp/core";
import type { QuantityCandidate } from "../parser/helpers/measurement-helper";
import type { MedicationFrequency } from "../schemas/medication";
import type { CodeableConcept } from "../schemas/shared";
import type {
	AttributeParserRule,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
	ParserSyntaxProfile,
	PatientLearningContext,
} from "../store/interfaces";
import type { ParsedCellHistoryStore } from "../store/learning/interfaces";
import { ClinicalDateRangeSchemaParser } from "./parsers/clinical-date-range-parser";
import { MedicationSchemaParser } from "./parsers/medication-parser";
import { ObservationSchemaParser } from "./parsers/observation-parser";
import { VitalsSchemaParser } from "./parsers/vitals-parser";

export const CANONICAL_TAGS = {
	VITALS: "VitalsMeasurementEvent",
	OBSERVATION: "ObservationEvent",
	MEDICATION: "MedicationOrderObject",
	CLINICAL_DATE_RANGE: "ClinicalDateRange",
} as const;

export type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
		}
	: T;

export interface ParsedItem {
	targetSchema: string;
	attributes: Record<string, any>;
	concept: CodeableConcept[];
	rawText: string;
	tag: string;
	extractedData: Record<string, any>;
}

export interface ParsedVitalsItem extends ParsedItem {
	targetSchema: "VitalsMeasurementEvent";
	extractedData: DeepPartial<
		import("../schemas/vitals").VitalsMeasurementEvent
	>;
}

export interface ParsedObservationItem extends ParsedItem {
	targetSchema: "ObservationEvent";
	extractedData: DeepPartial<import("../schemas/observation").ObservationEvent>;
}

export interface ParsedMedicationItem extends ParsedItem {
	targetSchema: "MedicationOrderObject";
	extractedData: DeepPartial<
		import("../schemas/medication").MedicationOrderObject
	>;
}

export interface ParsedClinicalDateRangeItem extends ParsedItem {
	targetSchema: "ClinicalDateRange";
	extractedData: DeepPartial<import("../schemas/time").ClinicalDateRange>;
}

export type ParsedItemUnion =
	| ParsedVitalsItem
	| ParsedObservationItem
	| ParsedMedicationItem
	| ParsedClinicalDateRangeItem;

export interface PreparsedContext {
	rawText: string;
	normalizedText?: string;
	measurement: QuantityCandidate[];
	timeSpan: QuantityCandidate[];
	frequency?: MedicationFrequency | null;
	attributes: Record<string, string>;
	parsedPartial?: Record<string, any>;
	profile?: Pick<ParserSyntaxProfile, "schemaDefaults" | "defaultsStrategy">;
	rankingSignals?: RankingSignal;
	patientContext?: PatientLearningContext;
}

export interface ScoredParseResult {
	parsedItem: ParsedItemUnion;
	completenessScore: number;
	unitAnchorCoherence: boolean;
}

export interface ParsedCandidateEnvelope<TCandidate = ParsedItemUnion> {
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

export interface ParserPreviewResult<TCandidate = ParsedItemUnion> {
	targetSchema: string;
	deterministic: TCandidate[];
	learned: TCandidate[];
}

export interface SchemaParser {
	targetSchema: string;
	parse(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
		preparsedContext?: PreparsedContext,
	): Promise<ParsedItemUnion | null>;
	preview?(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
		preparsedContext?: PreparsedContext,
		historyStore?: ParsedCellHistoryStore,
	): Promise<ParsedCandidateEnvelope>;
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

// V2 parser registry populated when v2 schema parsers are implemented
export const schemaParserRegistry = new Map<string, SchemaParser>([
	[CANONICAL_TAGS.OBSERVATION, new ObservationSchemaParser()],
	[CANONICAL_TAGS.MEDICATION, new MedicationSchemaParser()],
	[CANONICAL_TAGS.VITALS, new VitalsSchemaParser()],
	[CANONICAL_TAGS.CLINICAL_DATE_RANGE, new ClinicalDateRangeSchemaParser()],
]);
