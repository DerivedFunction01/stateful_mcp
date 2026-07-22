import type { ParserConceptDefault, ParserSyntaxProfile } from "./interfaces";

export const DEFAULT_ATTRIBUTE_RULES = [
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

export const DEFAULT_EVALUATOR_RULES = [
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

export const SEED_PARSER_PROFILES: ParserSyntaxProfile[] = [
	{
		profileId: "default",
		personnelId: "system",
		tagToken: "#",
		stateDelimiter: "||",
		stateStartDelimiter: "|",
		stateEndDelimiter: "|",
		macroStartToken: "^",
		variableStartToken: "{",
		variableEndToken: "}",
		isDefault: true,
		termTokenizer: "::",
		isActive: true,
		attributeRules: DEFAULT_ATTRIBUTE_RULES,
		evaluatorRules: DEFAULT_EVALUATOR_RULES,
		schemaNamespaces: {
			vitalsmeasurementevent: ["LOINC"],
			observationevent: ["SNOMED"],
			medicationorderobject: ["RxNorm"],
		},
	},
];

export const SEED_CONCEPT_DEFAULTS: ParserConceptDefault[] = [
	{
		anchorConceptId: "LOINC::8310-5",
		targetSchema: "VitalsMeasurementEvent",
		regexPatterns: [
			"temp(?:erature)?\\s+is\\s+(\\d+(?:\\.\\d+)?)\\s*([a-zA-Z%]*)",
		],
		defaultProperties: {
			unit: "Cel",
			captureGroupMapping: ["value", "unit"],
		},
	},
	{
		anchorConceptId: "LOINC::8480-6",
		targetSchema: "VitalsMeasurementEvent",
		regexPatterns: [],
		defaultProperties: {
			unit: "mmHg",
		},
	},
	{
		anchorConceptId: "LOINC::8867-4",
		targetSchema: "VitalsMeasurementEvent",
		regexPatterns: [],
		defaultProperties: {
			unit: "/min",
		},
	},
];
