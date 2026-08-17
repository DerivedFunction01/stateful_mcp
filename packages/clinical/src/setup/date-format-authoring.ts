import {
	buildDatePatternString,
	compileDateRegex,
	type DateTimeFormatConfig,
	type DateTimeToken,
} from "../values/utils/date-regex-generator";

export interface DateFormatDiagnostic {
	code: string;
	message: string;
	path?: string;
}

export interface DateFormatPreview {
	valid: boolean;
	pattern?: string;
	groupNames?: string[];
	matches: Array<{
		example: string;
		captures: Record<string, string | undefined>;
	}>;
	diagnostics: DateFormatDiagnostic[];
}

const DATE_TOKENS = new Set<DateTimeToken>([
	"YYYY",
	"YY",
	"MM",
	"MM_name",
	"DD",
	"DDD",
]);
const TIME_TOKENS = new Set<DateTimeToken>(["HH", "min", "SS", "ampm", "tz"]);

export function previewDateTimeFormat(
	format: DateTimeFormatConfig,
	examples: readonly string[],
): DateFormatPreview {
	const diagnostics: DateFormatDiagnostic[] = [];
	if (!format.id?.trim())
		diagnostics.push({
			code: "missing_format_id",
			message: "A format name is required",
			path: "id",
		});
	if (format.tokens.length === 0)
		diagnostics.push({
			code: "empty_format",
			message: "Choose at least one date or time component",
			path: "tokens",
		});
	if (format.separators.length !== Math.max(0, format.tokens.length - 1))
		diagnostics.push({
			code: "separator_count",
			message: "There must be one separator for each gap between components",
			path: "separators",
		});
	const dateTokens = format.tokens.filter((token) => DATE_TOKENS.has(token));
	const timeTokens = format.tokens.filter((token) => TIME_TOKENS.has(token));
	if (dateTokens.includes("YYYY") && dateTokens.includes("YY"))
		diagnostics.push({
			code: "duplicate_year_width",
			message: "Choose either a four-digit or two-digit year, not both",
			path: "tokens",
		});
	for (const token of [
		"DD",
		"MM",
		"MM_name",
		"HH",
		"min",
		"SS",
		"ampm",
		"tz",
	] as const) {
		if (format.tokens.filter((candidate) => candidate === token).length > 1)
			diagnostics.push({
				code: `duplicate_${token.toLowerCase()}`,
				message: `${token} may appear only once in a format`,
				path: "tokens",
			});
	}
	if (dateTokens.includes("MM") && dateTokens.includes("MM_name"))
		diagnostics.push({
			code: "conflicting_month_tokens",
			message: "Choose numeric or named month representation, not both",
			path: "tokens",
		});
	if (timeTokens.includes("ampm") && !timeTokens.includes("HH"))
		diagnostics.push({
			code: "period_without_hour",
			message: "A day-period component requires an hour component",
			path: "tokens",
		});
	if (timeTokens.includes("ampm") && format.options?.is24Hour === true)
		diagnostics.push({
			code: "period_with_24_hour",
			message: "A day-period component cannot be used with 24-hour time",
			path: "options.is24Hour",
		});
	if (
		format.tokens.includes("MM_name") &&
		!(
			format.options?.monthNames?.length ||
			(format.options?.monthAliases?.length === 12 &&
				format.options.monthAliases.every((aliases) => aliases.length > 0))
		)
	)
		diagnostics.push({
			code: "missing_month_aliases",
			message:
				"Named month formats require aliases mapped to month numbers 1 through 12",
			path: "options.monthAliases",
		});
	if (
		format.tokens.includes("ampm") &&
		(!format.options?.dayPeriods?.am?.length ||
			!format.options?.dayPeriods?.pm?.length)
	)
		diagnostics.push({
			code: "missing_day_periods",
			message: "12-hour formats require at least one AM and PM alias",
			path: "options.dayPeriods",
		});
	if (examples.length === 0)
		diagnostics.push({
			code: "missing_example",
			message: "Confirm at least one example that matches this format",
			path: "examples",
		});
	if (diagnostics.length > 0) return { valid: false, matches: [], diagnostics };

	let generated: ReturnType<typeof buildDatePatternString>;
	try {
		generated = buildDatePatternString(
			format.tokens,
			format.separators,
			format.options,
		);
	} catch (error) {
		return {
			valid: false,
			matches: [],
			diagnostics: [
				{
					code: "compile_failed",
					message: error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
	const matcher = compileDateRegex(generated.pattern, "u");
	const matches = examples.map((example) => {
		const match = matcher.exec(example);
		return { example, captures: match?.groups ?? {} };
	});
	for (const result of matches) {
		if (
			result.example.trim().length === 0 ||
			Object.keys(result.captures).length === 0
		)
			diagnostics.push({
				code: "example_mismatch",
				message: `Example '${result.example}' does not match the configured format`,
				path: "examples",
			});
	}
	return {
		valid: diagnostics.length === 0,
		pattern: generated.pattern,
		groupNames: generated.groupNames,
		matches,
		diagnostics,
	};
}

export function findAmbiguousDateExamples(
	formats: readonly DateTimeFormatConfig[],
	example: string,
): string[] {
	return formats
		.filter((format) => {
			try {
				const pattern = buildDatePatternString(
					format.tokens,
					format.separators,
					format.options,
				).pattern;
				return compileDateRegex(pattern, "u").test(example);
			} catch {
				return false;
			}
		})
		.map((format) => format.id ?? "unnamed");
}
