import { getCompiledRegex } from "./regex";

export const DATE_TIME_TOKENS = [
	"YYYY",
	"YY",
	"MM_name",
	"MM",
	"DDD",
	"DD",
	"HH",
	"min",
	"SS",
	"ampm",
	"tz",
] as const;

export type DateTimeToken = (typeof DATE_TIME_TOKENS)[number];

export type DateTimeValueKind = "date" | "time" | "datetime";
export type DateTimeField =
	| "year"
	| "month"
	| "day"
	| "dayOfYear"
	| "hour"
	| "minute"
	| "second"
	| "dayPeriod"
	| "timeZone";

export interface TwoDigitYearCenturyConfig {
	readonly pivotYear?: number;
	readonly currentCentury?: number;
	readonly previousCentury?: number;
	readonly centuryDecades?: Readonly<Record<string, string>>;
}

export interface DateTimeFormatOptions {
	centuryDecades?: Record<string, string>;
	twoDigitYear?: TwoDigitYearCenturyConfig;
	is24Hour?: boolean;
	exact?: boolean;
	monthNames?: string[];
	monthAliases?: string[][];
	dayPeriods?: { am: string[]; pm: string[] };
	precision?: string;
	locale?: string;
	timeZone?: string;
	firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface DateTimeFormatConfig {
	id?: string;
	readonly tokens: readonly DateTimeToken[];
	readonly separators: readonly string[];
	options?: DateTimeFormatOptions;
}

export interface DateTimeFormatDefinition extends DateTimeFormatConfig {
	readonly id: string;
	readonly kind: DateTimeValueKind;
	readonly fields?: readonly DateTimeField[];
	readonly parserEnabled?: boolean;
	readonly parserPriority?: number;
	readonly displayLabel?: string;
}

export interface DateTimeFormatRegistry {
	readonly formats: Readonly<Record<string, DateTimeFormatDefinition>>;
	readonly display: Partial<Record<DateTimeValueKind, string>>;
	readonly parse: Readonly<Record<DateTimeValueKind, readonly string[]>>;
}

export interface DateTimeInputSpec {
	readonly role: DateTimeValueKind;
	readonly requiredFields: readonly DateTimeField[];
	readonly allowAdditionalFields?: boolean;
	readonly optional?: boolean;
	readonly combineWith?: string;
	readonly missingDatePolicy?: "reject" | "use-context-date";
	readonly missingTimePolicy?: "reject" | "start-of-day";
}

export interface DateTimeRegistryDiagnostic {
	readonly code:
		| "duplicate-id"
		| "missing-reference"
		| "kind-mismatch"
		| "field-mismatch"
		| "ambiguous-order";
	readonly message: string;
	readonly formatId?: string;
}

const TOKEN_FIELDS: Readonly<Record<DateTimeToken, DateTimeField>> = {
	YYYY: "year",
	YY: "year",
	MM: "month",
	MM_name: "month",
	DD: "day",
	DDD: "dayOfYear",
	HH: "hour",
	min: "minute",
	SS: "second",
	ampm: "dayPeriod",
	tz: "timeZone",
};

export function fieldsForDateTimeTokens(
	tokens: readonly DateTimeToken[],
): readonly DateTimeField[] {
	return [...new Set(tokens.map((token) => TOKEN_FIELDS[token]))];
}

export function inferDateTimeKind(
	fields: readonly DateTimeField[],
): DateTimeValueKind {
	const hasDate = fields.some((field) =>
		["year", "month", "day", "dayOfYear"].includes(field),
	);
	const hasTime = fields.some((field) =>
		["hour", "minute", "second", "dayPeriod", "timeZone"].includes(field),
	);
	return hasDate && hasTime ? "datetime" : hasTime ? "time" : "date";
}

export function normalizeDateTimeFormatDefinition(
	definition: DateTimeFormatDefinition,
): DateTimeFormatDefinition {
	const inferredFields = fieldsForDateTimeTokens(definition.tokens);
	return {
		...definition,
		fields: definition.fields ?? inferredFields,
	};
}

export function createDateTimeRegistry(
	legacy?: DateTimeFormatConfig,
): DateTimeFormatRegistry {
	if (!legacy)
		return {
			formats: {},
			display: {},
			parse: { date: [], time: [], datetime: [] },
		};
	const id = legacy.id ?? "legacy.date";
	const definition = normalizeDateTimeFormatDefinition({
		...legacy,
		id,
		kind: inferDateTimeKind(fieldsForDateTimeTokens(legacy.tokens)),
	});
	return {
		formats: { [id]: definition },
		display: { [definition.kind]: id },
		parse: {
			date: definition.kind === "date" ? [id] : [],
			time: definition.kind === "time" ? [id] : [],
			datetime: definition.kind === "datetime" ? [id] : [],
		},
	};
}

export function validateDateTimeRegistry(
	registry: DateTimeFormatRegistry,
): readonly DateTimeRegistryDiagnostic[] {
	const diagnostics: DateTimeRegistryDiagnostic[] = [];
	const seen = new Set<string>();
	for (const [key, raw] of Object.entries(registry.formats)) {
		const definition = normalizeDateTimeFormatDefinition(raw);
		if (seen.has(definition.id) || key !== definition.id)
			diagnostics.push({
				code: "duplicate-id",
				message: `Date/time format ID '${definition.id}' must be unique and match its map key.`,
				formatId: definition.id,
			});
		seen.add(definition.id);
		const inferred = new Set(fieldsForDateTimeTokens(definition.tokens));
		if ((definition.fields ?? []).some((field) => !inferred.has(field)))
			diagnostics.push({
				code: "field-mismatch",
				message: `Format '${definition.id}' declares fields not present in its tokens.`,
				formatId: definition.id,
			});
	}
	for (const kind of ["date", "time", "datetime"] as const) {
		for (const id of registry.parse[kind] ?? []) {
			const definition = registry.formats[id];
			if (!definition)
				diagnostics.push({
					code: "missing-reference",
					message: `Parser references unknown format '${id}'.`,
					formatId: id,
				});
			else if (definition.kind !== kind)
				diagnostics.push({
					code: "kind-mismatch",
					message: `Format '${id}' is ${definition.kind}, not ${kind}.`,
					formatId: id,
				});
		}
	}
	return diagnostics;
}

export function selectDateTimeFormats(
	registry: DateTimeFormatRegistry,
	spec: DateTimeInputSpec,
): readonly DateTimeFormatDefinition[] {
	const required = new Set(spec.requiredFields);
	const ids = registry.parse[spec.role] ?? [];
	return ids
		.map((id) => registry.formats[id])
		.filter((definition): definition is DateTimeFormatDefinition =>
			Boolean(definition && definition.parserEnabled !== false),
		)
		.filter((definition) => {
			const fields = new Set(
				definition.fields ?? fieldsForDateTimeTokens(definition.tokens),
			);
			return (
				[...required].every((field) => fields.has(field)) &&
				(spec.allowAdditionalFields !== false || fields.size === required.size)
			);
		})
		.sort((a, b) => (b.parserPriority ?? 0) - (a.parserPriority ?? 0));
}

export interface DatePatternResult {
	pattern: string;
	groupNames: string[];
}

/**
 * Builds an adaptive regex boundary with protective lookarounds
 * derived from the punctuation separators used in the format.
 */
export function buildAdaptiveBoundary(
	separators: readonly string[] = [],
	exact = false,
): { start: string; end: string } {
	if (exact) {
		return { start: "^", end: "$" };
	}

	const barrierChars = new Set<string>();
	for (const sep of separators) {
		for (const char of sep) {
			if (/[^\s\p{L}\p{N}]/u.test(char)) {
				barrierChars.add(char);
			}
		}
	}

	const escapedChars = Array.from(barrierChars)
		.map((c) =>
			c === "-" || c === "]" || c === "\\" || c === "^" ? `\\${c}` : c,
		)
		.join("");

	const barrierClass = `[\\p{L}\\p{N}${escapedChars}]`;

	return {
		start: `(?<!${barrierClass})`,
		end: `(?!${barrierClass})`,
	};
}

export function buildDatePatternString(
	tokens: readonly DateTimeToken[],
	separators: readonly string[],
	options: DateTimeFormatOptions = {},
): DatePatternResult {
	if (separators.length !== Math.max(0, tokens.length - 1))
		throw new Error("Separators must equal tokens.length - 1");
	const {
		centuryDecades = { "20": "\\d", "21": "\\d" },
		is24Hour = true,
		exact = false,
		monthNames,
		monthAliases,
		dayPeriods,
	} = options;
	const yyyy = Object.entries(centuryDecades)
		.map(
			([century, decade]) =>
				`${century}${decade === "\\d" ? "\\d{2}" : `${decade}\\d`}`,
		)
		.join("|");
	const monthNamesPattern = monthAliases?.flat() ?? monthNames ?? [];
	const tokenPatterns: Record<DateTimeToken, string> = {
		YYYY: `(?<YYYY>${yyyy.includes("|") ? `(?:${yyyy})` : yyyy})`,
		YY: "(?<YY>\\d{2})",
		MM: "(?<MM>(?:0?[1-9]|1[0-2]))",
		MM_name: `(?<MM_name>${monthNamesPattern.length ? `(?:${monthNamesPattern.map(escapeRegex).join("|")})` : "(?:0?[1-9]|1[0-2])"})`,
		DD: "(?<DD>(?:0?[1-9]|[12]\\d|3[01]))",
		DDD: "(?<DDD>(?:00[1-9]|0[1-9]\\d|[12]\\d{2}|3[0-5]\\d|36[0-6]))",
		HH: `(?<HH>${is24Hour ? "(?:[01]\\d|2[0-3])" : "(?:0?[1-9]|1[0-2])"})`,
		min: "(?<min>[0-5]\\d)",
		SS: "(?<SS>[0-5]\\d)",
		ampm: `(?<ampm>${dayPeriods ? `(?:${[...dayPeriods.am, ...dayPeriods.pm].map(escapeRegex).join("|")})` : "[AaPp][Mm]"})`,
		tz: "(?<tz>(?:[A-Z]{3,4}|[+-]\\d{2}:?\\d{2}))",
	};
	const assembled = tokens
		.map(
			(token, index) =>
				`${index ? escapeRegex(separators[index - 1]!) : ""}${tokenPatterns[token]}`,
		)
		.join("");

	const boundaries = buildAdaptiveBoundary(separators, exact);

	return {
		pattern: `${boundaries.start}${assembled}${boundaries.end}`,
		groupNames: [...new Set(tokens.map((token) => token.toLowerCase()))],
	};
}

export function compileDateRegex(pattern: string, flags = "giu"): RegExp {
	return getCompiledRegex(pattern, flags);
}

export function buildMonthNameMap(
	monthNames?: string[],
	monthAliases?: string[][],
): Record<string, number> {
	const map: Record<string, number> = {};
	(monthAliases ?? monthNames?.map((name) => [name]) ?? []).forEach(
		(names, index) =>
			names.forEach((name) => {
				map[name.toLocaleLowerCase()] = index + 1;
			}),
	);
	return map;
}

export function buildDayPeriodMap(dayPeriods?: {
	am: string[];
	pm: string[];
}): Map<string, "am" | "pm"> {
	const map = new Map<string, "am" | "pm">();
	for (const value of dayPeriods?.am ?? [])
		map.set(value.toLocaleLowerCase(), "am");
	for (const value of dayPeriods?.pm ?? [])
		map.set(value.toLocaleLowerCase(), "pm");
	return map;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveTwoDigitYear(
	year: number | string,
	config?: TwoDigitYearCenturyConfig,
): number {
	const num = typeof year === "number" ? year : parseInt(year, 10);
	if (Number.isNaN(num)) return num;
	if (num >= 100) return num;
	const pivot = config?.pivotYear ?? 50;
	const sysYear = new Date().getFullYear();
	const defaultCurrentCentury = Math.floor(sysYear / 100) * 100;
	const currentCentury = config?.currentCentury ?? defaultCurrentCentury;
	const previousCentury = config?.previousCentury ?? currentCentury - 100;
	return num <= pivot ? currentCentury + num : previousCentury + num;
}

export interface DateTimeComponents {
	year?: number;
	month?: number;
	day?: number;
	dayOfYear?: number;
	hour?: number;
	minute?: number;
	second?: number;
	dayPeriod?: "am" | "pm";
	timeZone?: string;
}

/**
 * Formats structured DateTimeComponents against a template with graceful omission of empty fields.
 */
export function formatDateTimeValue(
	value: DateTimeComponents,
	format: DateTimeFormatConfig,
): string {
	const locale = format.options?.locale ?? "en-US";
	const tokenValues: Record<DateTimeToken, string | undefined> = {
		YYYY:
			value.year !== undefined
				? String(value.year).padStart(4, "0")
				: undefined,
		YY:
			value.year !== undefined
				? String(value.year % 100).padStart(2, "0")
				: undefined,
		MM:
			value.month !== undefined
				? String(value.month).padStart(2, "0")
				: undefined,
		MM_name:
			value.month !== undefined
				? (format.options?.monthNames?.[value.month - 1] ??
					new Intl.DateTimeFormat(locale, { month: "long" }).format(
						new Date(2026, value.month - 1, 1),
					))
				: undefined,
		DD:
			value.day !== undefined ? String(value.day).padStart(2, "0") : undefined,
		DDD:
			value.dayOfYear !== undefined
				? String(value.dayOfYear).padStart(3, "0")
				: undefined,
		HH:
			value.hour !== undefined
				? String(value.hour).padStart(2, "0")
				: undefined,
		min:
			value.minute !== undefined
				? String(value.minute).padStart(2, "0")
				: undefined,
		SS:
			value.second !== undefined
				? String(value.second).padStart(2, "0")
				: undefined,
		ampm:
			value.dayPeriod ??
			(value.hour !== undefined ? (value.hour >= 12 ? "PM" : "AM") : undefined),
		tz: value.timeZone,
	};

	const isBoundarySeparators = format.separators.length >= format.tokens.length;
	const getSeparatorBetween = (leftIdx: number): string => {
		const sIdx = isBoundarySeparators ? leftIdx + 1 : leftIdx;
		return format.separators[sIdx] ?? "";
	};

	// Collect populated token indices
	const populated: Array<{ tokenIndex: number; text: string }> = [];
	for (let i = 0; i < format.tokens.length; i++) {
		const token = format.tokens[i]!;
		const text = tokenValues[token];
		if (text !== undefined) {
			populated.push({ tokenIndex: i, text });
		}
	}

	if (populated.length === 0) return "";

	let result = isBoundarySeparators ? (format.separators[0] ?? "") : "";
	for (let i = 0; i < populated.length; i++) {
		const current = populated[i]!;
		result += current.text;

		if (i < populated.length - 1) {
			const next = populated[i + 1]!;
			let intervening = "";
			for (let idx = current.tokenIndex; idx < next.tokenIndex; idx++) {
				intervening += getSeparatorBetween(idx);
			}
			if (next.tokenIndex > current.tokenIndex + 1) {
				const cleaned = intervening
					.replace(/[:,\-_.]+/g, " ")
					.replace(/\s+/g, " ");
				result += cleaned.length > 0 ? cleaned : " ";
			} else {
				result += intervening;
			}
		}
	}
	if (isBoundarySeparators && format.separators.length > format.tokens.length) {
		result += format.separators[format.tokens.length] ?? "";
	}
	return result.trim();
}

/**
 * Parses a free-text date/time template string (e.g. "MM/DD/YYYY", "YYYY-MM-DD", "MM_name DD, YYYY", "YYYY年MM月DD日", "YYDDD")
 * into a structured DateTimeFormatConfig.
 */
export function parseDateTimeStringToConfig(
	formatStr: string,
	id = "custom.date",
	options?: DateTimeFormatOptions,
): DateTimeFormatConfig {
	const tokens: DateTimeToken[] = [];
	const separators: string[] = [];

	let remaining = formatStr.trim();
	let currentSep = "";

	while (remaining.length > 0) {
		const matchedToken = DATE_TIME_TOKENS.find((token) =>
			remaining.startsWith(token),
		);
		if (matchedToken) {
			separators.push(currentSep);
			tokens.push(matchedToken);
			currentSep = "";
			remaining = remaining.slice(matchedToken.length);
		} else {
			currentSep += remaining[0];
			remaining = remaining.slice(1);
		}
	}
	separators.push(currentSep);

	return {
		id,
		tokens,
		separators,
		options,
	};
}

/**
 * Formats a DateTimeFormatConfig back into a human-readable template string (e.g. "YYYY-MM-DD" or "MM_name DD, YYYY").
 */
export function formatDateTimeConfigToString(
	config: DateTimeFormatConfig,
): string {
	let result = config.separators[0] ?? "";
	for (let i = 0; i < config.tokens.length; i++) {
		result += config.tokens[i] + (config.separators[i + 1] ?? "");
	}
	return result;
}

export interface DateTimeCompositionOptions {
	/** Order of composition (default: "date-first") */
	readonly order?: "date-first" | "time-first" | "both";
	/** Connectors/separators between date and time (default: [" ", "T"]) */
	readonly separators?: readonly string[];
	/** List of combined format strings to exclude/disable */
	readonly disabledCombinations?: readonly string[];
}

/**
 * Splits a user-entered delimited string into format templates using an explicit delimiter.
 * If no delimiter is configured, treats the input as a single template.
 */
export function splitFormatList(input: string, delimiter?: string): string[] {
	const trimmed = input.trim();
	if (!trimmed) return [];
	if (!delimiter) return [trimmed];
	return trimmed
		.split(delimiter)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

/**
 * Joins a list of format templates into a display string using the specified list delimiter.
 */
export function joinFormatList(
	list: readonly string[],
	delimiter = " ",
): string {
	return list.join(delimiter);
}

/**
 * Automatically derives composite datetime candidate strings by combining
 * configured date formats and time formats.
 */
export function deriveDateTimeFormats(
	dateFormats: readonly string[],
	timeFormats: readonly string[],
	options: DateTimeCompositionOptions = {},
): readonly string[] {
	const order = options.order ?? "date-first";
	const separators = options.separators ?? [" ", "T"];
	const disabled = new Set(options.disabledCombinations ?? []);
	const results: string[] = [];

	const ordersToRun: Array<"date-first" | "time-first"> =
		order === "both" ? ["date-first", "time-first"] : [order];

	for (const ord of ordersToRun) {
		for (const dateFmt of dateFormats) {
			for (const timeFmt of timeFormats) {
				for (const sep of separators) {
					const combined =
						ord === "date-first"
							? `${dateFmt}${sep}${timeFmt}`
							: `${timeFmt}${sep}${dateFmt}`;
					if (!disabled.has(combined) && !results.includes(combined)) {
						results.push(combined);
					}
				}
			}
		}
	}
	return results;
}

/**
 * Generates localized default month name aliases across 12 months using Intl.
 */
export function generateDefaultMonthAliases(
	locales: readonly string[] = ["en-US"],
): string[][] {
	const result: string[][] = Array.from({ length: 12 }, () => []);
	const testDates = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 15));

	for (const locale of locales) {
		try {
			const longFmt = new Intl.DateTimeFormat(locale, { month: "long" });
			const shortFmt = new Intl.DateTimeFormat(locale, { month: "short" });

			testDates.forEach((date, monthIdx) => {
				const longName = longFmt.format(date).toLocaleLowerCase();
				const shortName = shortFmt
					.format(date)
					.toLocaleLowerCase()
					.replace(/\.$/, "");
				const bucket = result[monthIdx]!;
				if (!bucket.includes(longName)) bucket.push(longName);
				if (!bucket.includes(shortName)) bucket.push(shortName);
			});
		} catch {
			// Skip invalid locale
		}
	}
	return result;
}
