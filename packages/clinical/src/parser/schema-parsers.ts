import type { DictionaryStore } from "@stateful-mcp/core";
import type {
	AttributeParserRule,
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../store/interfaces";
import { VitalsSchemaParser } from "./parsers/vitals-parser";
import { ObservationSchemaParser } from "./parsers/observation-parser";
import { MedicationSchemaParser } from "./parsers/medication-parser";

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

export interface ParsedMedicationItem extends BaseParsedItem {
	targetSchema: "MedicationOrderObject";
	route?: string;
	frequency?: string;
	duration?: string;
	status?: string;
}

export type ParsedItem = ParsedVitalsItem | ParsedObservationItem | ParsedMedicationItem;

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

export async function resolveConceptHelper(
	text: string,
	dictionaryStore: DictionaryStore,
	termTokenizer?: string,
	allowedNamespaces?: string[],
): Promise<{ id: string; display: string } | null> {
	const tokenizer = termTokenizer || "::";
	if (text.includes(tokenizer)) {
		const idx = text.indexOf(tokenizer);
		const ns = text.slice(0, idx).trim();
		const code = text.slice(idx + tokenizer.length).trim();
		const results = await dictionaryStore.search(code, ns, 1);
		if (results && results.length > 0 && results[0]) {
			return { id: results[0].id, display: results[0].display };
		}
	}

	if (allowedNamespaces && allowedNamespaces.length > 0) {
		for (const ns of allowedNamespaces) {
			const results = await dictionaryStore.search(text, ns, 1);
			if (results && results.length > 0 && results[0]) {
				return { id: results[0].id, display: results[0].display };
			}
		}
	}
	return null;
}

// Register default parsers
schemaParserRegistry.set("vital", new VitalsSchemaParser());
schemaParserRegistry.set("vitalsmeasurementevent", new VitalsSchemaParser());
schemaParserRegistry.set("observation", new ObservationSchemaParser());
schemaParserRegistry.set("symptom", new ObservationSchemaParser());
schemaParserRegistry.set("observationevent", new ObservationSchemaParser());
schemaParserRegistry.set("rx", new MedicationSchemaParser());
schemaParserRegistry.set("med", new MedicationSchemaParser());
schemaParserRegistry.set("medicationorderobject", new MedicationSchemaParser());