import type { DictionaryStore } from "@stateful-mcp/core";
import type {
	AttributeParserRule,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../store/interfaces";
import { MedicationSchemaParser } from "./parsers/medication-parser";
import { ObservationSchemaParser } from "./parsers/observation-parser";
import { VitalsSchemaParser } from "./parsers/vitals-parser";

export const CANONICAL_TAGS = {
	VITALS: "VitalsMeasurementEvent",
	OBSERVATION: "ObservationEvent",
	MEDICATION: "MedicationOrderObject",
} as const;

export interface BaseParsedItem {
	tag: string;
	anchorText: string;
	conceptId?: string;
	display: string;
	targetSchema: string;
	rawText: string;
	capturedProperties?: Record<string, any>;
}

export interface ParsedVitalsItem extends BaseParsedItem {
	targetSchema: "VitalsMeasurementEvent";
	value?: number | string;
	unit?: string;
	unitAnchor?: string;
}

export interface ParsedObservationItem extends BaseParsedItem {
	targetSchema: "ObservationEvent";
	severity?: string;
	certainty?: string;
	status?: string;
}

import type { MedicationFrequency } from "../schemas/medication";

export interface ParsedMedicationItem extends BaseParsedItem {
	targetSchema: "MedicationOrderObject";
	route?: string;
	frequency?: MedicationFrequency;
	duration?: string;
	status?: string;
}

import type { BoundedMeasurement } from "../schemas/measurement";
import type { TimeMeasurement } from "../schemas/time";

export interface PreparsedContext {
	rawText: string;
	measurement?: BoundedMeasurement | null;
	timeSpan?: TimeMeasurement | null;
	frequency?: MedicationFrequency | null;
	attributes?: Record<string, string>;
}

export interface ScoredParseResult {
	parsedItem: ParsedItem;
	completenessScore: number;
	unitAnchorCoherence: boolean;
}

export type ParsedItem =
	| ParsedVitalsItem
	| ParsedObservationItem
	| ParsedMedicationItem;

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
	): Promise<ParsedItem | null>;
}

export const schemaParserRegistry = new Map<string, SchemaParser>();

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
	namespace: string;
}

export async function resolveConceptHelper(
	text: string,
	dictionaryStore: DictionaryStore,
	termTokenizer?: string,
	allowedNamespaces?: string[],
): Promise<{ id: string; display: string } | null> {
	const candidates = await resolveMultiConceptHelper(
		text,
		dictionaryStore,
		termTokenizer,
		allowedNamespaces,
	);
	const first = candidates[0];
	return first ? { id: first.conceptId, display: first.display } : null;
}

export async function resolveMultiConceptHelper(
	text: string,
	dictionaryStore: DictionaryStore,
	termTokenizer?: string,
	allowedNamespaces?: string[],
): Promise<ConceptCandidate[]> {
	const candidates: ConceptCandidate[] = [];
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
						conceptId: r.id,
						display: r.display,
						namespace: ns,
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
				conceptId: agg.conceptId,
				display: agg.concept.display,
				namespace: ns,
			});
		}
	}

	return candidates;
}

// Register default parsers
schemaParserRegistry.set(
	CANONICAL_TAGS.VITALS.toLowerCase(),
	new VitalsSchemaParser(),
);
schemaParserRegistry.set(
	CANONICAL_TAGS.OBSERVATION.toLowerCase(),
	new ObservationSchemaParser(),
);
schemaParserRegistry.set(
	CANONICAL_TAGS.MEDICATION.toLowerCase(),
	new MedicationSchemaParser(),
);
