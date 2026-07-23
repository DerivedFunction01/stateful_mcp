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
		targetValue: "ORAL",
		regexPatterns: ["\\boral\\b", "\\bpo\\b"],
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
	{
		targetField: "operator",
		targetValue: "gte",
		regexPatterns: [">="],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "lte",
		regexPatterns: ["<="],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "gt",
		regexPatterns: [">"],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "lt",
		regexPatterns: ["<"],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "is_approximate",
		regexPatterns: ["~"],
		isCaseInsensitive: true,
	},
	{
		targetField: "unit",
		targetValue: "Cel",
		regexPatterns: ["Centigrade", "Celsius", "Cel", "C"],
		isCaseInsensitive: true,
		unitAnchor: "temperature",
	},
	{
		targetField: "unit",
		targetValue: "mmHg",
		regexPatterns: ["mmHg"],
		isCaseInsensitive: true,
		unitAnchor: "pressure",
	},
	// ── Mass (solid dosage) ─────────────────────────────────────────────
	{
		targetField: "unit",
		targetValue: "mg",
		regexPatterns: ["\\bmg\\b", "\\bmilligrams?\\b"],
		isCaseInsensitive: true,
		unitAnchor: "mass",
	},
	{
		targetField: "unit",
		targetValue: "g",
		regexPatterns: ["\\bgrams?\\b", "(?<![a-zA-Z])g(?![a-zA-Z])"],
		isCaseInsensitive: false,
		unitAnchor: "mass",
	},
	{
		targetField: "unit",
		targetValue: "kg",
		regexPatterns: ["\\bkg\\b", "\\bkilograms?\\b"],
		isCaseInsensitive: true,
		unitAnchor: "mass",
	},
	{
		targetField: "unit",
		targetValue: "mcg",
		regexPatterns: ["\\bmcg\\b", "\\b\u03bcg\\b", "\\bmicrogram s?\\b"],
		isCaseInsensitive: true,
		unitAnchor: "mass",
	},
	// ── Mass concentration (liquid dosage) ──────────────────────────────
	{
		targetField: "unit",
		targetValue: "mg/mL",
		regexPatterns: ["\\bmg\\/mL\\b", "\\bmg\\/ml\\b"],
		isCaseInsensitive: false,
		unitAnchor: "mass_concentration",
	},
	{
		targetField: "unit",
		targetValue: "mg/dL",
		regexPatterns: ["\\bmg\\/dL\\b", "\\bmg\\/dl\\b"],
		isCaseInsensitive: false,
		unitAnchor: "mass_concentration",
	},
	{
		targetField: "unit",
		targetValue: "mcg/mL",
		regexPatterns: ["\\bmcg\\/mL\\b", "\\b\u03bcg\\/mL\\b"],
		isCaseInsensitive: false,
		unitAnchor: "mass_concentration",
	},
	// ── Length / distance ───────────────────────────────────────────────
	{
		targetField: "unit",
		targetValue: "cm",
		regexPatterns: ["\\bcm\\b", "\\bcentimeters?\\b"],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "m",
		regexPatterns: ["(?<![a-zA-Z])m(?![a-zA-Z])", "\\bmeters?\\b"],
		isCaseInsensitive: false,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "[in_i]",
		regexPatterns: ["\\binches\\b", "\\binch\\b", "\\bin\\b"],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "[ft_i]",
		regexPatterns: ["\\bfeet\\b", "\\bfoot\\b", "\\bft\\b"],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	// ── Count / rate ────────────────────────────────────────────────────
	{
		targetField: "unit",
		targetValue: "/min",
		regexPatterns: ["\\/min\\b", "\\bper\\s+minute\\b", "\\bbpm\\b", "\\bbreaths?\\/min\\b"],
		isCaseInsensitive: true,
		unitAnchor: "number",
	},
	{
		targetField: "unit",
		targetValue: "/min",
		regexPatterns: ["\\bbeats?\\s+per\\s+minute\\b"],
		isCaseInsensitive: true,
		unitAnchor: "number",
	},
	{
		targetField: "time_unit",
		targetValue: "second",
		regexPatterns: ["\\bseconds?\\b", "\\bs\\b", "\\bsegundos?\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "minute",
		regexPatterns: ["\\bminutes?\\b", "\\bmin\\b", "\\bminutos?\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "hour",
		regexPatterns: ["\\bhours?\\b", "\\bhrs?\\b", "\\bh\\b", "\\bhoras?\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "day",
		regexPatterns: ["\\bdays?\\b", "\\bd\\b", "\\bdias?\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "week",
		regexPatterns: ["\\bweeks?\\b", "\\bw\\b", "\\bsemanas?\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "month",
		regexPatterns: ["\\bmonths?\\b", "\\bmeses?\\b", "\\bmes\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "year",
		regexPatterns: ["\\byears?\\b", "\\by\\b", "\\banos?\\b", "\\baños?\\b"],
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
			"temp(?:erature)?\\s+is\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*(?<unit>[a-zA-Z%]*)",
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
