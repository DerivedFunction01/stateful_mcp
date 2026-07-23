import type { DictionaryStore } from "@stateful-mcp/core";
import { MedicationHelper, MedicationTokenizer } from "./helpers/medication-helper";
import { ObservationHelper, ObservationTokenizer } from "./helpers/observation-helper";
import { VitalsHelper, VitalsTokenizer } from "./helpers/vitals-helper";
import { MeasurementHelper, TimeHelper } from "./helpers/measurement-helper";
import {
	DEFAULT_ATTRIBUTE_RULES,
	DEFAULT_EVALUATOR_RULES,
} from "../store/defaults";
import type {
	AttributeParserRule,
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserDictionaryRule,
} from "../store/interfaces";

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

export class VitalsSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.VITALS;

	async parse(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
	): Promise<ParsedItem | null> {
		const rules = evaluatorRules || DEFAULT_EVALUATOR_RULES;
		const token = VitalsTokenizer.tokenize(content, rules);
		if (!token.anchorText) return null;

		const capturedProps: Record<string, any> = {};
		if (token.systolic !== undefined && token.diastolic !== undefined) {
			const bp = VitalsHelper.buildBloodPressure(token.systolic, token.diastolic, token.bloodPressureUnit);
			capturedProps.systolic = bp.systolic;
			capturedProps.diastolic = bp.diastolic;
			capturedProps.unit = bp.unit;
		}
		if (token.value !== undefined) {
			capturedProps.quantity = token.value;
			if (token.unit) capturedProps.unit = token.unit;
		}

		let valueText = token.value !== undefined ? String(token.value) : "";
		let unitText = token.unit || "";
		if (token.systolic !== undefined && token.diastolic !== undefined) {
			valueText = `${token.systolic}/${token.diastolic}`;
			unitText = token.bloodPressureUnit || "mmHg";
		}

		// Resolve concept
		const resolved = await resolveConceptHelper(
			token.anchorText,
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || token.anchorText;
		const conceptId = resolved?.id;

		let conceptDefaults: ParserConceptDefault | null = null;
		if (conceptId && conceptDefaultsStore) {
			conceptDefaults = await conceptDefaultsStore.get(
				conceptId,
				this.targetSchema,
			);
		}

		// Apply regex capture groups from defaults if defined
		if (conceptDefaults?.regexPatterns) {
			for (const pattern of conceptDefaults.regexPatterns) {
				const regex = new RegExp(pattern, "i");
				const match = regex.exec(content);
				if (
					match &&
					match.groups &&
					conceptDefaults.defaultProperties.captureGroupMapping
				) {
					const mapping: string[] =
						conceptDefaults.defaultProperties.captureGroupMapping;
					for (let i = 0; i < mapping.length; i++) {
						const field = mapping[i];
						if (field) {
							const val = match.groups?.[field];
							if (val !== undefined) {
								capturedProps[field] = val;
								if (field === "value") valueText = val;
								if (field === "unit") unitText = val;
							}
						}
					}
				}
			}
		}

		const defaultUnit = conceptDefaults?.defaultProperties.unit || "";
		const parsedVal = Number.isNaN(Number(valueText))
			? valueText
			: Number(valueText);

		const finalUnit = unitText || defaultUnit;
		let unitAnchor: string | undefined;
		if (finalUnit) {
			const resolvedUnit = MeasurementHelper.resolveUnit(finalUnit, attributeRules);
			unitAnchor = resolvedUnit.unitAnchor;
		}

		return {
			tag,
			anchorText: token.anchorText,
			conceptId,
			display,
			value: parsedVal,
			unit: finalUnit,
			unitAnchor,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProps).length > 0 ? capturedProps : undefined,
		} as ParsedVitalsItem;
	}
}

export class ObservationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.OBSERVATION;

	async parse(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
	): Promise<ParsedItem | null> {
		const attrRules = attributeRules || DEFAULT_ATTRIBUTE_RULES;
		const evalRules = evaluatorRules || DEFAULT_EVALUATOR_RULES;

		const token = ObservationTokenizer.tokenize(content, attrRules, evalRules);
		if (!token.anchorText) return null;

		const certainty = token.certainty || "confirmed";
		const status = token.status || "active";
		const severity = token.severity || "moderate";

		// Resolve concept
		const resolved = await resolveConceptHelper(
			token.anchorText,
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || token.anchorText;
		const conceptId = resolved?.id;

		// Check custom defaults
		let conceptDefaults: ParserConceptDefault | null = null;
		if (conceptId && conceptDefaultsStore) {
			conceptDefaults = await conceptDefaultsStore.get(
				conceptId,
				this.targetSchema,
			);
		}

		const defaultSeverity =
			conceptDefaults?.defaultProperties.severity || severity;
		const defaultCertainty =
			conceptDefaults?.defaultProperties.certainty || certainty;
		const defaultStatus = conceptDefaults?.defaultProperties.status || status;

		const capturedProperties: Record<string, any> = {};
		if (token.severityScore) {
			capturedProperties.severityScore = token.severityScore;
		}

		return {
			tag,
			anchorText: token.anchorText,
			conceptId,
			display,
			severity: defaultSeverity,
			certainty: defaultCertainty,
			status: defaultStatus,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProperties).length > 0 ? capturedProperties : undefined,
		} as ParsedObservationItem;
	}
}

export class MedicationSchemaParser implements SchemaParser {
	targetSchema = CANONICAL_TAGS.MEDICATION;

	async parse(
		tag: string,
		content: string,
		dictionaryStore: DictionaryStore,
		conceptDefaultsStore?: ParserConceptDefaultStore,
		attributeRules?: AttributeParserRule[],
		evaluatorRules?: ParserDictionaryRule[],
		termTokenizer?: string,
		allowedNamespaces?: string[],
	): Promise<ParsedItem | null> {
		const attrRules = attributeRules || DEFAULT_ATTRIBUTE_RULES;
		const evalRules = evaluatorRules || DEFAULT_EVALUATOR_RULES;

		const token = MedicationTokenizer.tokenize(content, attrRules, evalRules);
		if (!token.anchorText) return null;

		let route = token.route;
		let frequency = token.frequency;
		let duration: string | undefined;

		// Resolve RxNorm concept
		const resolved = await resolveConceptHelper(
			token.anchorText,
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || token.anchorText;
		const conceptId = resolved?.id;

		// Check custom defaults
		let conceptDefaults: ParserConceptDefault | null = null;
		if (conceptId && conceptDefaultsStore) {
			conceptDefaults = await conceptDefaultsStore.get(
				conceptId,
				this.targetSchema,
			);
		}

		route = conceptDefaults?.defaultProperties.route || route;
		frequency = conceptDefaults?.defaultProperties.frequency || frequency;
		duration = conceptDefaults?.defaultProperties.duration || duration;

		const possibleDurations = content.match(/(\d+(?:\.\d+)?\s*\S+)/g);
		if (possibleDurations) {
			for (const candidate of possibleDurations) {
				const parsedTime = TimeHelper.parse(candidate, attrRules);
				if (parsedTime && parsedTime.unit) {
					duration = candidate;
					break;
				}
			}
		}

		const capturedProperties: Record<string, any> = {};
		if (token.quantity !== undefined) {
			capturedProperties.quantity = token.quantity;
			if (token.quantityUnit) {
				capturedProperties.unit = token.quantityUnit;
			}
		}

		return {
			tag,
			anchorText: token.anchorText,
			conceptId,
			display,
			route,
			frequency,
			duration,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProperties).length > 0 ? capturedProperties : undefined,
		} as ParsedMedicationItem;
	}
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
