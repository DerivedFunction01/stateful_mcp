import {
	buildDatePatternString,
	type DateTimeFormatConfig,
} from "../parser/utils/date-regex-generator";
import { buildNumericPatternString } from "../parser/utils/numeric-regex-generator";
import type {
	AttributeParserRule,
	NumericFieldFormatOptions,
	ParserConceptDefault,
	ParserSyntaxProfile,
} from "./interfaces";

export function buildCalendarDateRules(
	formats: DateTimeFormatConfig[],
): AttributeParserRule[] {
	return formats.map((format, idx) => ({
		targetField: "calendar_date" as const,
		targetValue: "calendar_date" as const,
		regexPatterns: [
			buildDatePatternString(format.tokens, format.separators, format.options),
		],
		isCaseInsensitive: true,
		priority: 100,
		calendarTokens: format.tokens,
		calendarSeparators: format.separators,
		monthNames: format.options?.monthNames,
	}));
}

export function buildNumericFieldRules(
	formats: NumericFieldFormatOptions[],
): AttributeParserRule[] {
	const validFormats = formats.filter(
		(
			f,
		): f is Required<Pick<NumericFieldFormatOptions, "targetField">> &
			NumericFieldFormatOptions => f.targetField !== undefined,
	);
	return validFormats
		.map((format) => ({
			targetField: format.targetField,
			targetValue: "number" as const,
			regexPatterns: [buildNumericPatternString(format)],
			isCaseInsensitive: true,
			priority: format.priority ?? 1,
			integerDigits: format.integerDigits,
			decimalDigits: format.decimalDigits,
			allowNegative: format.allowNegative,
			leadingMin: format.leadingMin,
			leadingMax: format.leadingMax,
			targetSchema: format.targetSchema,
		}))
		.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
}

export const NUMERIC_PATTERN_INTEGER = (
	options: {
		groupName?: string;
		wrap?: boolean;
		allowNegative?: boolean;
		leadingMin?: number;
		leadingMax?: number;
	} = {},
): string =>
	buildNumericPatternString({
		integerDigits:
			options.leadingMin !== undefined && options.leadingMax !== undefined
				? undefined
				: undefined,
		decimalDigits: 0,
		allowNegative: options.allowNegative ?? false,
		exact: false,
		leadingMin: options.leadingMin,
		leadingMax: options.leadingMax,
		groupName: options.groupName,
		wrap: options.wrap ?? true,
	});

export const NUMERIC_PATTERN_DECIMAL = (
	options: {
		groupName?: string;
		wrap?: boolean;
		integerDigits?: number;
		decimalDigits?: number;
		allowNegative?: boolean;
		leadingMin?: number;
		leadingMax?: number;
	} = {},
): string =>
	buildNumericPatternString({
		integerDigits: options.integerDigits,
		decimalDigits: options.decimalDigits ?? undefined,
		allowNegative: options.allowNegative ?? false,
		exact: false,
		leadingMin: options.leadingMin,
		leadingMax: options.leadingMax,
		groupName: options.groupName,
		wrap: options.wrap ?? true,
	});

export const NUMERIC_PATTERN_SEVERITY_0_10 = buildNumericPatternString({
	integerDigits: 1,
	decimalDigits: 0,
	allowNegative: false,
	leadingMin: 0,
	leadingMax: 1,
	groupName: "severity",
	wrap: true,
});

export const NUMERIC_PATTERN_PERCENTAGE_0_100 = buildNumericPatternString({
	integerDigits: 3,
	decimalDigits: 0,
	allowNegative: false,
	leadingMin: 0,
	leadingMax: 1,
	groupName: "percentage",
	wrap: true,
});

export const NUMERIC_PATTERN_NUMERATOR = buildNumericPatternString({
	integerDigits: undefined,
	decimalDigits: 0,
	allowNegative: false,
	groupName: "numerator",
	wrap: true,
});

export const NUMERIC_PATTERN_DENOMINATOR = buildNumericPatternString({
	integerDigits: undefined,
	decimalDigits: 0,
	allowNegative: false,
	groupName: "denominator",
	wrap: true,
});

export const NUMERIC_PATTERN_QUANTITY = buildNumericPatternString({
	integerDigits: undefined,
	decimalDigits: undefined,
	allowNegative: false,
	groupName: "quantity",
	wrap: true,
});

export const NUMERIC_FIELD_SEVERITY_0_10: NumericFieldFormatOptions = {
	integerDigits: 1,
	decimalDigits: 0,
	allowNegative: false,
	leadingMin: 0,
	leadingMax: 1,
	targetField: "severity_score",
	priority: 10,
};

export const DEFAULT_CALENDAR_DATE_FORMATS: DateTimeFormatConfig[] = [
	{
		tokens: ["MM", "DD", "YYYY"],
		separators: ["/", "/"],
		options: { is24Hour: false },
	},
	{
		tokens: ["YYYY", "MM", "DD"],
		separators: ["-", "-"],
		options: { is24Hour: false },
	},
	{
		tokens: ["MM_name", "DD", "YYYY"],
		separators: [" ", ", "],
		options: {
			is24Hour: false,
			monthNames: [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December",
			],
		},
	},
];

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
		targetValue: "oral",
		regexPatterns: ["\\boral\\b", "\\bpo\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "route",
		targetValue: "intravenous",
		regexPatterns: ["\\bintravenous\\b", "\\biv\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "route",
		targetValue: "inhalation",
		regexPatterns: ["\\binhalation\\b", "\\binhaled\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency_prn",
		targetValue: "true",
		regexPatterns: [
			"\\bprn\\b",
			"\\bas\\s+needed\\b",
			"\\bpor\\s+razón\\s+necesaria\\b",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency_event_anchor",
		targetValue: "before_meal",
		regexPatterns: ["\\bbefore\\s+meals?\\b", "\\bantes\\s+de\\s+comer\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency_event_anchor",
		targetValue: "after_meal",
		regexPatterns: ["\\bafter\\s+meals?\\b", "\\bdespués\\s+de\\s+comer\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency_shorthand",
		targetValue: "QD",
		regexPatterns: ["\\bqd\\b", "\\bdaily\\b", "\\bdiario\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency_shorthand",
		targetValue: "BID",
		regexPatterns: ["\\bbid\\b", "\\btwice\\s+daily\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "frequency_shorthand",
		targetValue: "TID",
		regexPatterns: ["\\btid\\b", "\\bthree\\s+times\\s+daily\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "gte",
		regexPatterns: [
			"(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<operator>>=)\\b",
			">=",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "lte",
		regexPatterns: [
			"(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<operator><=)\\b",
			"<=",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "gt",
		regexPatterns: [
			"(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<operator>>)(?!=)",
			">",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "lt",
		regexPatterns: [
			"(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<operator><)(?!<|=)",
			"<",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "operator",
		targetValue: "is_approximate",
		regexPatterns: [
			"(?<is_approximate>大约)(?<magnitude>\\d+(?:\\.\\d+)?)(?![\\d\\w])",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)(?![\\d\\w]).*?(?<is_approximate>程度)",
			"\\b(?<is_approximate>approx(?:imate|imately)?|aprox(?:imate|imately)?|approximately|aproximadamente)\\b\\s*(?<magnitude>\\d+(?:\\.\\d+)?)\\b",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<is_approximate>approx(?:imate|imately)?|aprox(?:imate|imately)?|approximately|aproximadamente)\\b",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\b(?:\\s+\\S+)?\\s+(?<is_approximate>approx(?:imate|imately)?|aprox(?:imate|imately)?|approximately|aproximadamente)\\b",
			"~",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "unit",
		targetValue: "Celsius",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>Centigrade|Celsius|Cel|C)\\b",
		],
		isCaseInsensitive: true,
		unitAnchor: "temperature",
	},
	{
		targetField: "unit",
		targetValue: "mmHg",
		regexPatterns: ["\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mmHg)\\b"],
		isCaseInsensitive: true,
		unitAnchor: "pressure",
	},
	// ── Mass (solid dosage) ─────────────────────────────────────────────
	{
		targetField: "unit",
		targetValue: "mg",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mg)\\b(?!\\/)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>milligrams?)\\b(?!\\/)",
		],
		isCaseInsensitive: true,
		unitAnchor: "mass",
	},
	{
		targetField: "unit",
		targetValue: "g",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>grams?)\\b",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>g)\\b",
		],
		isCaseInsensitive: false,
		unitAnchor: "mass",
	},
	{
		targetField: "unit",
		targetValue: "kg",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>kg)\\b",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>kilograms?)\\b",
		],
		isCaseInsensitive: true,
		unitAnchor: "mass",
	},
	{
		targetField: "unit",
		targetValue: "mcg",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mcg)\\b(?!\\/)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>\\u03bcg)\\b(?!\\/)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>micrograms?)\\b(?!\\/)",
		],
		isCaseInsensitive: true,
		unitAnchor: "mass",
	},
	// ── Mass concentration (liquid dosage) ──────────────────────────────
	{
		targetField: "unit",
		targetValue: "mg/mL",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mg\\/mL|mg\\/ml)\\b",
		],
		isCaseInsensitive: false,
		unitAnchor: "mass_concentration",
	},
	{
		targetField: "unit",
		targetValue: "mg/dL",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mg\\/dL|mg\\/dl)\\b",
		],
		isCaseInsensitive: false,
		unitAnchor: "mass_concentration",
	},
	{
		targetField: "unit",
		targetValue: "mcg/mL",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mcg\\/mL|\\u03bcg\\/mL)\\b",
		],
		isCaseInsensitive: false,
		unitAnchor: "mass_concentration",
	},
	// ── Length / distance ───────────────────────────────────────────────
	{
		targetField: "unit",
		targetValue: "mm",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mm)\\b",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>毫米)(?![\\d\\w])",
		],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "cm",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>cm)\\b",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>centimeters?)\\b",
		],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "m",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>meters?)\\b",
			"(?<![a-zA-Z])(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>m)(?![a-zA-Z])",
		],
		isCaseInsensitive: false,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "[in_i]",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>inches?|inch|in)\\b",
		],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	{
		targetField: "unit",
		targetValue: "[ft_i]",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>feet|foot|ft)\\b",
		],
		isCaseInsensitive: true,
		unitAnchor: "length",
	},
	// ── Count / rate ────────────────────────────────────────────────────
	{
		targetField: "unit",
		targetValue: "breaths_per_min",
		regexPatterns: [
			"\\/min\\b",
			"\\bper\\s+minute\\b",
			"\\bbpm\\b",
			"\\bbreaths?\\/min\\b",
		],
		isCaseInsensitive: true,
		unitAnchor: "number",
	},
	{
		targetField: "unit",
		targetValue: "beats_per_min",
		regexPatterns: ["\\bbeats?\\s+per\\s+minute\\b"],
		isCaseInsensitive: true,
		unitAnchor: "number",
	},
	{
		targetField: "time_unit",
		targetValue: "second",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>sec(?:ond)?s?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>s)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>segundos?)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "minute",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>min(?:ute)?s?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>minutos?)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "hour",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>hrs?|hours?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>horas?)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "day",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>days?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>d)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>dias?)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "week",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>weeks?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>w)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>semanas?)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "month",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>months?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>meses?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>mes)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "year",
		regexPatterns: [
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>years?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>y)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>anos?)\\b(?!\\s*ago)",
			"\\b(?<magnitude>\\d+(?:\\.\\d+)?)\\s*(?<unit>años?)\\b(?!\\s*ago)",
		],
		isCaseInsensitive: true,
	},
	// Days of the Week
	{
		targetField: "time_unit",
		targetValue: "monday",
		regexPatterns: ["\\bmondays?\\b", "\\bmon\\b", "\\blunes\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "tuesday",
		regexPatterns: ["\\btuesdays?\\b", "\\btue\\b", "\\bmartes\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "wednesday",
		regexPatterns: [
			"\\bwednesdays?\\b",
			"\\bwed\\b",
			"\\bmiercoles\\b",
			"\\bmiércoles\\b",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "thursday",
		regexPatterns: ["\\bthursdays?\\b", "\\bthu\\b", "\\bjueves\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "friday",
		regexPatterns: ["\\bfridays?\\b", "\\bfri\\b", "\\bviernes\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "saturday",
		regexPatterns: [
			"\\bsaturdays?\\b",
			"\\bsat\\b",
			"\\bsabado\\b",
			"\\bsábado\\b",
		],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "sunday",
		regexPatterns: ["\\bsundays?\\b", "\\bsun\\b", "\\bdomingo\\b"],
		isCaseInsensitive: true,
	},
	// Parts of the Day
	{
		targetField: "time_unit",
		targetValue: "morning",
		regexPatterns: ["\\bmorning\\b", "\\bmañana\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "afternoon",
		regexPatterns: ["\\bafternoon\\b", "\\btarde\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "evening",
		regexPatterns: ["\\bevening\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "night",
		regexPatterns: ["\\bnight\\b", "\\bnoche\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "midnight",
		regexPatterns: ["\\bmidnight\\b", "\\bmedianoche\\b"],
		isCaseInsensitive: true,
	},
	// Seasons
	{
		targetField: "time_unit",
		targetValue: "spring",
		regexPatterns: ["\\bspring\\b", "\\bprimavera\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "summer",
		regexPatterns: ["\\bsummer\\b", "\\bverano\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "autumn",
		regexPatterns: ["\\bautumn\\b", "\\bfall\\b", "\\botoño\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_unit",
		targetValue: "winter",
		regexPatterns: ["\\bwinter\\b", "\\binvierno\\b"],
		isCaseInsensitive: true,
	},
	// Time Relative Markers
	{
		targetField: "time_relative_marker",
		targetValue: "retrospective",
		regexPatterns: ["\\bago\\b", "\\bpast\\b", "\\bhace\\b", "\\bantes\\b"],
		isCaseInsensitive: true,
	},
	{
		targetField: "time_relative_marker",
		targetValue: "prospective",
		regexPatterns: ["\\bin\\b", "\\bdentro\\s+de\\b"],
		isCaseInsensitive: true,
	},
	// Time Boundary Markers
	{
		targetField: "time_boundary_marker",
		targetValue: "to",
		regexPatterns: ["\\bto\\b", "\\buntil\\b", "\\bhasta\\b"],
		isCaseInsensitive: true,
	},
	// Time Exclusion Markers
	{
		targetField: "time_exclusion_marker",
		targetValue: "except",
		regexPatterns: [
			"\\bexcept\\b",
			"\\bexcluding\\b",
			"\\bexcepto\\b",
			"\\bmenos\\b",
		],
		isCaseInsensitive: true,
	},
	// Time Repeat Daily Rules
	{
		targetField: "time_repeat_daily",
		targetValue: "daily",
		regexPatterns: ["\\bdaily\\b", "\\bdiariamente\\b", "\\bdiario\\b"],
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
			`${NUMERIC_PATTERN_QUANTITY}\\s*(?<unit>h|hr|hours?|d|days?|mg|g|ml)`,
		],
	},
	{
		ruleId: "severity_ratio",
		targetField: "severityScore",
		evaluatorName: "parseSeverity",
		regexPatterns: [
			`${NUMERIC_PATTERN_NUMERATOR}\\s*\\/\\s*${NUMERIC_PATTERN_DENOMINATOR}`,
			`${NUMERIC_PATTERN_NUMERATOR}\\s+out\\s+of\\s+${NUMERIC_PATTERN_DENOMINATOR}`,
			`give\\s+it\\s+a\\s+${NUMERIC_PATTERN_NUMERATOR}`,
		],
	},
	{
		ruleId: "freq_every",
		targetField: "frequency_details",
		evaluatorName: "parseFrequencyEvery",
		regexPatterns: [
			`(?:every|cada)\\s+${NUMERIC_PATTERN_DECIMAL({ groupName: "multiplier" })}\\s*(?<unit>\\S+)`,
		],
	},
	{
		ruleId: "freq_times",
		targetField: "frequency_details",
		evaluatorName: "parseFrequencyTimes",
		regexPatterns: [
			`${NUMERIC_PATTERN_DECIMAL({ groupName: "multiplier" })}\\s*(?:times|veces)?\\s*(?:per|al|a\\s+la)\\s*(?<unit>\\S+)`,
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
		stopWordThreshold: 0.6,
		calendarDateFormats: DEFAULT_CALENDAR_DATE_FORMATS,
		attributeRules: DEFAULT_ATTRIBUTE_RULES,
		evaluatorRules: DEFAULT_EVALUATOR_RULES,
		schemaNamespaces: {
			vitalsmeasurementevent: ["LOINC"],
			observationevent: ["SNOMED"],
			medicationorderobject: ["RxNorm"],
		},
		tagMappings: {
			vital: "VitalsMeasurementEvent",
			vitalsmeasurementevent: "VitalsMeasurementEvent",
			observation: "ObservationEvent",
			symptom: "ObservationEvent",
			observationevent: "ObservationEvent",
			rx: "MedicationOrderObject",
			med: "MedicationOrderObject",
			medicationorderobject: "MedicationOrderObject",
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
			unit: "Celsius",
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

import type { AllowedUnit } from "../schemas/measurement";

export const UNIT_DISPLAY_MAP: Record<AllowedUnit, string> = {
	// Mass
	kg: "kg",
	g: "g",
	mg: "mg",
	mcg: "mcg",
	ug: "mcg",
	ng: "ng",
	pg: "pg",
	lb: "lb",
	oz: "oz",
	t: "t",
	ton: "ton",

	// Volume
	l: "L",
	L: "L",
	dL: "dL",
	dl: "dL",
	ml: "mL",
	mL: "mL",
	ul: "uL",
	uL: "uL",
	fl_oz: "fl oz",
	tsp: "tsp",
	tbsp: "tbsp",
	qt: "qt",
	pt: "pt",
	gal: "gal",
	cc: "cc",
	cup: "cup",
	pint: "pint",
	quart: "quart",
	gallon: "gallon",

	// Length
	km: "km",
	m: "m",
	cm: "cm",
	mm: "mm",
	um: "um",
	nm: "nm",
	in: "in",
	ft: "ft",
	"[in_i]": "in",
	"[ft_i]": "ft",
	yd: "yd",
	mi: "mi",

	// Temperature
	Celsius: "Celsius",
	Fahrenheit: "Fahrenheit",
	Kelvin: "Kelvin",

	// Pressure
	mmHg: "mmHg",
	bar: "bar",
	atm: "atm",
	Pa: "Pa",
	kPa: "kPa",
	psi: "psi",

	// Count
	"1": "1",
	count: "count",
	cells: "cells",
	elements: "elements",
	copies: "copies",
	IU: "IU",
	U: "U",
	"IU/mL": "IU/mL",
	"U/mL": "U/mL",
	tablet: "tablet",
	capsule: "capsule",
	puff: "puff",
	spray: "spray",
	drop: "drop",
	dose: "dose",
	pill: "pill",
	vial: "vial",
	patch: "patch",
	caplet: "caplet",
	sachet: "sachet",
	"/min": "/min",
	breaths_per_min: "bpm",
	beats_per_min: "bpm",

	// Score
	"%": "%",
	percent: "%",
	score: "score",
	points: "points",
	ratio: "ratio",
	MET: "MET",

	// Mass Concentration permutations
	"g/l": "g/L",
	"g/L": "g/L",
	"g/dL": "g/dL",
	"g/ml": "g/mL",
	"g/mL": "g/mL",
	"g/ul": "g/uL",
	"g/uL": "g/uL",
	"mg/l": "mg/L",
	"mg/L": "mg/L",
	"mg/dL": "mg/dL",
	"mg/ml": "mg/mL",
	"mg/mL": "mg/mL",
	"mg/ul": "mg/uL",
	"mg/uL": "mg/uL",
	"mcg/l": "mcg/L",
	"mcg/L": "mcg/L",
	"mcg/dL": "mcg/dL",
	"mcg/ml": "mcg/mL",
	"mcg/mL": "mcg/mL",
	"mcg/ul": "mcg/uL",
	"mcg/uL": "mcg/uL",
	"ug/l": "ug/L",
	"ug/L": "ug/L",
	"ug/dL": "ug/dL",
	"ug/ml": "ug/mL",
	"ug/mL": "ug/mL",
	"ug/ul": "ug/uL",
	"ug/uL": "ug/uL",
	"ng/l": "ng/L",
	"ng/L": "ng/L",
	"ng/dL": "ng/dL",
	"ng/ml": "ng/mL",
	"ng/mL": "ng/mL",
	"ng/ul": "ng/uL",
	"ng/uL": "ng/uL",
	"pg/l": "pg/L",
	"pg/L": "pg/L",
	"pg/dL": "pg/dL",
	"pg/ml": "pg/mL",
	"pg/mL": "pg/mL",
	"pg/ul": "pg/uL",
	"pg/uL": "pg/uL",

	// Substance Concentration
	"mol/L": "mol/L",
	"mmol/L": "mmol/L",
	"umol/L": "umol/L",
	"nmol/L": "nmol/L",
	"mEq/L": "mEq/L",

	// Energy
	cal: "cal",
	kcal: "kcal",
	J: "J",
	kJ: "kJ",
	kWh: "kWh",

	// Force
	N: "N",
	kN: "kN",
	mN: "mN",
	kgf: "kgf",
	lbf: "lbf",

	// Osmolality / Osmolarity
	"Osm/kg": "Osm/kg",
	"mOsm/kg": "mOsm/kg",
	"Osm/L": "Osm/L",
	"mOsm/L": "mOsm/L",

	// Catalytic Activity
	kat: "kat",
	mkat: "mkat",
	ukat: "ukat",
	nkat: "nkat",

	// Fraction
	fraction: "fraction",

	// Electric Potential, Current, Power
	V: "V",
	mV: "mV",
	uV: "uV",
	A: "A",
	mA: "mA",
	uA: "uA",
	W: "W",
	mW: "mW",
	kW: "kW",

	// Velocity / Acceleration
	"m/s": "m/s",
	"cm/s": "cm/s",
	"km/h": "km/h",
	mph: "mph",
	"m/s2": "m/s²",
};
