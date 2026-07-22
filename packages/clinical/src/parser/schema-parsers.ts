import type { DictionaryStore } from "@stateful-mcp/core";
import { MedicationHelper } from "../schemas/medication";
import { ObservationHelper } from "../schemas/observation";
import { VitalsHelper } from "../schemas/vitals";
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

export interface ParsedItem {
	tag: string;
	anchorText: string;
	conceptId?: string;
	display: string;
	value?: number | string;
	unit?: string;
	severity?: string;
	certainty?: string;
	status?: string;
	route?: string;
	frequency?: string;
	duration?: string;
	targetSchema: string;
	rawText: string;
	capturedProperties?: Record<string, any>;
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
	): Promise<ParsedItem | null>;
}

export const schemaParserRegistry = new Map<string, SchemaParser>();

export const DEFAULT_EVALUATOR_RULES: ParserDictionaryRule[] = [
	{
		ruleId: "bp",
		targetField: "blood_pressure",
		evaluatorName: "parseBloodPressure",
		regexPatterns: [
			"(?<systolic>\\d{2,3})\\s*\\/\\s*(?<diastolic>\\d{2,3})\\s*(?<unit>[a-zA-Z%\\[\\]]+)?",
			"(?<systolic>\\d{2,3})\\s+(?<diastolic>\\d{2,3})\\s*(?<unit>[a-zA-Z%\\[\\]]+)?",
		],
	},
	{
		ruleId: "qty",
		targetField: "quantity",
		evaluatorName: "parseQuantityUnit",
		regexPatterns: [
			"(?<quantity>\\d+(?:\\.\\d+)?)\\s*(?<unit>h|hr|hours?|d|days?|mg|g|ml)",
		],
	},
	{
		ruleId: "severity_ratio",
		targetField: "severityScore",
		evaluatorName: "parseSeverity",
		regexPatterns: [
			"(?<numerator>\\d+)\\s*\\/\\s*(?<denominator>\\d+)",
			"(?<numerator>\\d+)\\s+out\\s+of\\s+(?<denominator>\\d+)",
			"give\\s+it\\s+a\\s+(?<numerator>\\d+)",
		],
	},
];

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
	parseSeverity: (groups) => ObservationHelper.parseSeverity(groups),
	parseBloodPressure: (groups) => VitalsHelper.findBloodPressure(groups),
	parseQuantityUnit: (groups) => MedicationHelper.parseQuantityUnit(groups),
	parseSessionVars: (groups) => parseSessionVars(groups),
};

export function applyEvaluatorRules(
	content: string,
	rules: ParserDictionaryRule[],
): {
	capturedProps: Record<string, any>;
	contentCleaned: string;
} {
	const capturedProps: Record<string, any> = {};
	let contentCleaned = content;

	for (const rule of rules) {
		const evalFn = EVALUATOR_FUNCTIONS[rule.evaluatorName];
		if (!evalFn) continue;

		for (const pattern of rule.regexPatterns) {
			const regex = new RegExp(pattern, "i");
			const match = regex.exec(content);
			if (match && match.groups) {
				const res = evalFn(match.groups);
				if (res !== undefined) {
					if (rule.targetField === "blood_pressure") {
						capturedProps.systolic = res.systolic;
						capturedProps.diastolic = res.diastolic;
						capturedProps.unit = res.unit;
					} else if (rule.targetField === "quantity") {
						capturedProps.quantity = res.value;
						capturedProps.unit = res.unit;
					} else {
						capturedProps[rule.targetField] = res;
					}
				}
			}
		}
	}

	for (const rule of rules) {
		for (const pattern of rule.regexPatterns) {
			const regex = new RegExp(pattern, "i");
			contentCleaned = contentCleaned.replace(regex, " ");
		}
	}
	contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();

	return { capturedProps, contentCleaned };
}

export async function resolveConceptHelper(
	text: string,
	defaultNamespace: string,
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

	const namespaces =
		allowedNamespaces && allowedNamespaces.length > 0
			? allowedNamespaces
			: [defaultNamespace];

	for (const ns of namespaces) {
		const results = await dictionaryStore.search(text, ns, 1);
		if (results && results.length > 0 && results[0]) {
			return { id: results[0].id, display: results[0].display };
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
		const { capturedProps, contentCleaned } = applyEvaluatorRules(
			content,
			rules,
		);

		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		if (wordsCleaned.length === 0) return null;

		const anchorText = wordsCleaned[0] || "";
		let valueText = wordsCleaned[1] || "";
		let unitText = wordsCleaned[2] || "";

		if (
			capturedProps.systolic !== undefined &&
			capturedProps.diastolic !== undefined
		) {
			valueText = `${capturedProps.systolic}/${capturedProps.diastolic}`;
			unitText = capturedProps.unit || "mmHg";
		}

		// Resolve LOINC concept
		const resolved = await resolveConceptHelper(
			anchorText,
			"LOINC",
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || anchorText;
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
					match.length > 1 &&
					conceptDefaults.defaultProperties.captureGroupMapping
				) {
					const mapping: string[] =
						conceptDefaults.defaultProperties.captureGroupMapping;
					for (let i = 0; i < mapping.length; i++) {
						const field = mapping[i];
						const val = match[i + 1];
						if (field && val !== undefined) {
							capturedProps[field] = val;
							if (field === "value") valueText = val;
							if (field === "unit") unitText = val;
						}
					}
				}
			}
		}

		let defaultUnit = conceptDefaults?.defaultProperties.unit || "";
		if (!defaultUnit) {
			if (/temp/i.test(anchorText)) {
				defaultUnit = "Cel";
			} else if (/pulse|hr|heart/i.test(anchorText)) {
				defaultUnit = "/min";
			} else if (/bp|blood/i.test(anchorText)) {
				defaultUnit = "mm[Hg]";
			} else if (/spo2|sat/i.test(anchorText)) {
				defaultUnit = "%";
			} else if (/rr|resp/i.test(anchorText)) {
				defaultUnit = "/min";
			}
		}

		const parsedVal = Number.isNaN(Number(valueText))
			? valueText
			: Number(valueText);

		return {
			tag,
			anchorText,
			conceptId,
			display,
			value: parsedVal,
			unit: unitText || defaultUnit,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProps).length > 0 ? capturedProps : undefined,
		};
	}
}

export const DEFAULT_ATTRIBUTE_RULES: AttributeParserRule[] = [
	{
		targetField: "certainty",
		targetValue: "refuted",
		regexPatterns: ["\\bdenies\\b", "\\bdeny\\b", "\\bno\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "status",
		targetValue: "resolved",
		regexPatterns: ["\\bdenies\\b", "\\bdeny\\b", "\\bno\\b", "\\bresolved\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "none",
		regexPatterns: ["\\bdenies\\b", "\\bdeny\\b", "\\bno\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "severe",
		regexPatterns: ["\\bsevere\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "mild",
		regexPatterns: ["\\bmild\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "severity",
		targetValue: "moderate",
		regexPatterns: ["\\bmoderate\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "route",
		targetValue: "INTRAVENOUS",
		regexPatterns: ["\\bintravenous\\b", "\\biv\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "route",
		targetValue: "INHALATION",
		regexPatterns: ["\\binhalation\\b", "\\binhaled\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency",
		targetValue: "QD",
		regexPatterns: ["\\bqd\\b", "\\bdaily\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency",
		targetValue: "PRN",
		regexPatterns: ["\\bprn\\b", "\\bas needed\\b"],
		isCaseInsensitive: true,
	},
];

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
		const rules = attributeRules || DEFAULT_ATTRIBUTE_RULES;
		const evalRules = evaluatorRules || DEFAULT_EVALUATOR_RULES;
		const { capturedProps, contentCleaned: evalContentCleaned } =
			applyEvaluatorRules(content, evalRules);

		const attributes: Record<string, string> = {};
		let contentCleaned = evalContentCleaned;

		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(evalContentCleaned)) {
					attributes[rule.targetField] = rule.targetValue;
				}
			}
		}

		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}
		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();

		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		if (wordsCleaned.length === 0) return null;

		const certainty = attributes.certainty || "confirmed";
		const status = attributes.status || "active";
		const severity = attributes.severity || "moderate";
		const anchorText = wordsCleaned.join(" ");

		// Resolve SNOMED concept
		const resolved = await resolveConceptHelper(
			anchorText,
			"SNOMED",
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || anchorText;
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

		return {
			tag,
			anchorText,
			conceptId,
			display,
			severity: defaultSeverity,
			certainty: defaultCertainty,
			status: defaultStatus,
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProps).length > 0 ? capturedProps : undefined,
		};
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
		const rules = attributeRules || DEFAULT_ATTRIBUTE_RULES;
		const evalRules = evaluatorRules || DEFAULT_EVALUATOR_RULES;
		const { capturedProps, contentCleaned: evalContentCleaned } =
			applyEvaluatorRules(content, evalRules);

		const attributes: Record<string, string> = {};
		let contentCleaned = evalContentCleaned;

		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				if (regex.test(evalContentCleaned)) {
					attributes[rule.targetField] = rule.targetValue;
				}
			}
		}

		for (const rule of rules) {
			for (const pattern of rule.regexPatterns) {
				const flags = rule.isCaseInsensitive !== false ? "i" : "";
				const regex = new RegExp(pattern, flags);
				contentCleaned = contentCleaned.replace(regex, " ");
			}
		}
		contentCleaned = contentCleaned.replace(/\s+/g, " ").trim();

		const wordsCleaned = contentCleaned.split(/\s+/).filter(Boolean);
		if (wordsCleaned.length === 0) return null;

		const anchorText = wordsCleaned[0] || "";
		let route = attributes.route || "ORAL";
		let frequency = attributes.frequency || "TID";
		let duration = "10 days";

		// Resolve RxNorm concept
		const resolved = await resolveConceptHelper(
			anchorText,
			"RxNorm",
			dictionaryStore,
			termTokenizer,
			allowedNamespaces,
		);
		const display = resolved?.display || anchorText;
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

		const durationMatch = contentCleaned.toLowerCase().match(/(\d+\s*days?)/);
		if (durationMatch) {
			duration = durationMatch[0];
		}

		return {
			tag,
			anchorText,
			conceptId,
			display,
			route,
			frequency,
			duration,
			status: "ACTIVE",
			targetSchema: this.targetSchema,
			rawText: `${tag} ${content}`,
			capturedProperties:
				Object.keys(capturedProps).length > 0 ? capturedProps : undefined,
		};
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
