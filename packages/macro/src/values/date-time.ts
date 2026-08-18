import { type BaseValueGrammarConfig, parseNumericValue } from "./numeric";
import { getCompiledRegex } from "./regex";
import {
	extractPostfixAlias,
	extractPrefixAlias,
	flattenAndSortAliases,
} from "./token-matcher";
import {
	DATE_TIME_TOKENS,
	type DateTimeToken,
	type RelativeTimeToken,
	type ValueFormatConfig,
} from "./token-spec";

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

// --------------------------------------------------------------------------
// Chronological Extensions: 24-hr ISO Time Bounds & Anchor-Relative Evaluation
// --------------------------------------------------------------------------

export interface TimeOfDayWindow {
	/** 24-hr ISO time start (e.g. "06:00") */
	readonly start: string;
	/** 24-hr ISO time end (e.g. "12:00") */
	readonly end: string;
}

export interface PartOfDayConfig {
	/** 24-hr ISO windows for parts of day */
	readonly windows?: Readonly<Record<string, TimeOfDayWindow>>;
	/** User-defined aliases mapped to part-of-day keys */
	readonly aliases?: Readonly<Record<string, readonly string[]>>;
	readonly locales?: string | readonly string[];
}

export interface MonthDayWindow {
	/** 24-hr ISO Month-Day start (e.g. "01-01", "10-01", or "06-21") */
	readonly startMonthDay: string;
	/** 24-hr ISO Month-Day end (e.g. "03-31", "12-31", or "09-22") */
	readonly endMonthDay: string;
	/** Optional offset added to reference year for window start (e.g. -1 for US Gov Q1 relative to FY) */
	readonly startYearOffset?: number;
	/** Optional offset added to reference year for window end (e.g. +1 for seasons/quarters ending in next calendar year) */
	readonly endYearOffset?: number;
}

export interface CalendarWindowConfig {
	/** 24-hr ISO Month-Day bounds for standard quarters or custom fiscal quarters */
	readonly quarters?: Readonly<
		Record<"Q1" | "Q2" | "Q3" | "Q4" | string, MonthDayWindow>
	>;
	/** 24-hr ISO Month-Day bounds for seasons */
	readonly seasons?: Readonly<Record<string, MonthDayWindow>>;
	/** User-defined quarter aliases */
	readonly quarterAliases?: Readonly<Record<string, readonly string[]>>;
	/** User-defined season aliases */
	readonly seasonAliases?: Readonly<Record<string, readonly string[]>>;
	/** User-defined decade aliases */
	readonly decadeAliases?: Readonly<Record<string, readonly string[]>>;
	readonly locales?: string | readonly string[];
}

export type RelativeDirection = "past" | "future" | "current";

export type UCUMTimeUnit =
	| "ms"
	| "s"
	| "min"
	| "h"
	| "d"
	| "wk"
	| "mo"
	| "a"
	| "yr";

export type RelativeTemporalUnit =
	| UCUMTimeUnit
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "quarter"
	| "season"
	| "year"
	| "decade";

export interface RelativeTemporalSlot {
	readonly direction: RelativeDirection;
	readonly amount: number; // e.g. 3 in "3 hours ago" or 1 in "last summer"
	readonly unit: RelativeTemporalUnit;
	readonly specificQualifier?: string; // e.g. "summer" or "morning" or "Q2"
	readonly referenceYear?: number; // e.g. 2026 in "last summer in 2026"
}

export interface ResolvedTemporalWindow {
	readonly startIsoUtc: string;
	readonly endIsoUtc: string;
	readonly isInstantaneous: boolean;
	readonly targetTimeZone: string;
}

/** Default 24-hr ISO windows for quarters */
export const DEFAULT_QUARTER_WINDOWS: Readonly<
	Record<"Q1" | "Q2" | "Q3" | "Q4", MonthDayWindow>
> = {
	Q1: { startMonthDay: "01-01", endMonthDay: "03-31" },
	Q2: { startMonthDay: "04-01", endMonthDay: "06-30" },
	Q3: { startMonthDay: "07-01", endMonthDay: "09-30" },
	Q4: { startMonthDay: "10-01", endMonthDay: "12-31" },
};

/**
 * Pure evaluation engine for anchor-relative temporal slots.
 * Evaluates prospective/retrospective offsets into exact ISO UTC intervals using 24-hr ISO tables and system anchor.
 */
export function evaluateAnchorRelativeTemporal(
	slot: RelativeTemporalSlot,
	anchorTimestampUtc: string | Date | number,
	options: {
		timeZone?: string;
		partOfDayConfig?: PartOfDayConfig;
		calendarConfig?: CalendarWindowConfig;
	} = {},
): ResolvedTemporalWindow {
	const anchorDate = new Date(anchorTimestampUtc);
	const targetTimeZone =
		options.timeZone ??
		Intl.DateTimeFormat().resolvedOptions().timeZone ??
		"UTC";

	const sign =
		slot.direction === "past" ? -1 : slot.direction === "future" ? 1 : 0;
	const amount = slot.amount * sign;

	// 1. Part of Day on anchor date (e.g. morning, afternoon, evening)
	if (slot.specificQualifier && options.partOfDayConfig?.windows) {
		const qualifierLower = slot.specificQualifier.toLocaleLowerCase();
		let matchedWindow: TimeOfDayWindow | undefined;
		for (const [key, win] of Object.entries(options.partOfDayConfig.windows)) {
			if (key.toLocaleLowerCase() === qualifierLower) {
				matchedWindow = win;
				break;
			}
		}

		if (matchedWindow) {
			const targetDate = new Date(anchorDate.getTime() + amount * 86400000);
			const yyyy = targetDate.getUTCFullYear();
			const mm = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
			const dd = String(targetDate.getUTCDate()).padStart(2, "0");

			const startIso = new Date(
				`${yyyy}-${mm}-${dd}T${matchedWindow.start}:00Z`,
			).toISOString();
			const endIso = new Date(
				`${yyyy}-${mm}-${dd}T${matchedWindow.end}:00Z`,
			).toISOString();

			return {
				startIsoUtc: startIso,
				endIsoUtc: endIso,
				isInstantaneous: false,
				targetTimeZone,
			};
		}
	}

	// 2. Instantaneous Unit Offsets (ms, s, min, h, d, wk) without specific window qualifier
	if (
		!slot.specificQualifier &&
		(slot.unit === "ms" ||
			slot.unit === "s" ||
			slot.unit === "second" ||
			slot.unit === "min" ||
			slot.unit === "minute" ||
			slot.unit === "h" ||
			slot.unit === "hour" ||
			slot.unit === "d" ||
			slot.unit === "day" ||
			slot.unit === "wk" ||
			slot.unit === "week")
	) {
		let msOffset = 0;
		switch (slot.unit) {
			case "ms":
				msOffset = amount;
				break;
			case "s":
			case "second":
				msOffset = amount * 1000;
				break;
			case "min":
			case "minute":
				msOffset = amount * 60 * 1000;
				break;
			case "h":
			case "hour":
				msOffset = amount * 3600 * 1000;
				break;
			case "d":
			case "day":
				msOffset = amount * 86400 * 1000;
				break;
			case "wk":
			case "week":
				msOffset = amount * 7 * 86400 * 1000;
				break;
		}

		const resultTime = new Date(anchorDate.getTime() + msOffset);
		const iso = resultTime.toISOString();
		return {
			startIsoUtc: iso,
			endIsoUtc: iso,
			isInstantaneous: true,
			targetTimeZone,
		};
	}

	// 3. Calendar Windows: Seasons / Quarters / Decades
	const refYear =
		slot.referenceYear ??
		anchorDate.getUTCFullYear() +
			(slot.unit === "year" || slot.unit === "season" || slot.unit === "quarter"
				? amount
				: 0);

	// Decade: e.g. 2020s -> 2020 to 2029
	if (slot.unit === "decade") {
		const decadeStartYear = Math.floor(refYear / 10) * 10;
		const startIso = new Date(
			`${decadeStartYear}-01-01T00:00:00.000Z`,
		).toISOString();
		const endIso = new Date(
			`${decadeStartYear + 9}-12-31T23:59:59.999Z`,
		).toISOString();
		return {
			startIsoUtc: startIso,
			endIsoUtc: endIso,
			isInstantaneous: false,
			targetTimeZone,
		};
	}

	// Season: from calendarConfig.seasons
	if (slot.specificQualifier && options.calendarConfig?.seasons) {
		const sKey = slot.specificQualifier.toLocaleLowerCase();
		let sWin: MonthDayWindow | undefined;
		for (const [key, win] of Object.entries(options.calendarConfig.seasons)) {
			if (key.toLocaleLowerCase() === sKey) {
				sWin = win;
				break;
			}
		}

		if (sWin) {
			const startYear = refYear + (sWin.startYearOffset ?? 0);
			const endYear =
				refYear +
				(sWin.endYearOffset ?? (sWin.startMonthDay > sWin.endMonthDay ? 1 : 0));
			const startIso = new Date(
				`${startYear}-${sWin.startMonthDay}T00:00:00.000Z`,
			).toISOString();
			const endIso = new Date(
				`${endYear}-${sWin.endMonthDay}T23:59:59.999Z`,
			).toISOString();
			return {
				startIsoUtc: startIso,
				endIsoUtc: endIso,
				isInstantaneous: false,
				targetTimeZone,
			};
		}
	}

	// Quarter: from calendarConfig.quarters or default
	if (
		slot.specificQualifier &&
		(slot.unit === "quarter" || /^Q[1-4]$/i.test(slot.specificQualifier))
	) {
		const qKey = slot.specificQualifier.toUpperCase() as
			| "Q1"
			| "Q2"
			| "Q3"
			| "Q4";
		const qWin =
			options.calendarConfig?.quarters?.[qKey] ?? DEFAULT_QUARTER_WINDOWS[qKey];
		if (qWin) {
			const startYear = refYear + (qWin.startYearOffset ?? 0);
			const endYear =
				refYear +
				(qWin.endYearOffset ?? (qWin.startMonthDay > qWin.endMonthDay ? 1 : 0));
			const startIso = new Date(
				`${startYear}-${qWin.startMonthDay}T00:00:00.000Z`,
			).toISOString();
			const endIso = new Date(
				`${endYear}-${qWin.endMonthDay}T23:59:59.999Z`,
			).toISOString();
			return {
				startIsoUtc: startIso,
				endIsoUtc: endIso,
				isInstantaneous: false,
				targetTimeZone,
			};
		}
	}

	// Default Year Window
	const startIso = new Date(`${refYear}-01-01T00:00:00.000Z`).toISOString();
	const endIso = new Date(`${refYear}-12-31T23:59:59.999Z`).toISOString();
	return {
		startIsoUtc: startIso,
		endIsoUtc: endIso,
		isInstantaneous: false,
		targetTimeZone,
	};
}

export interface RelativeTemporalDefinition {
	readonly direction: RelativeDirection;
	readonly amount: number;
	readonly unit: RelativeTemporalUnit;
	readonly specificQualifier?: string;
	readonly aliases: readonly string[];
}

export interface RelativeTemporalConfig extends BaseValueGrammarConfig {
	readonly templates?: readonly (
		| ValueFormatConfig<RelativeTimeToken>
		| string
	)[];
	/** User-defined relative temporal definitions */
	readonly relativeDefinitions?: readonly RelativeTemporalDefinition[];
	/** Slot mappings for key-based aliases */
	readonly relativeSlots?: Readonly<Record<string, RelativeTemporalSlot>>;
	/** Aliases mapped to canonical slot keys */
	readonly relativeTemporalAliases?: Readonly<
		Record<string, readonly string[]>
	>;
	/** Direction prefix aliases (e.g. { past: ["il y a", "vor", "ago"], future: ["in", "dans", "in"] }) */
	readonly directionPrefixes?: Readonly<
		Partial<Record<RelativeDirection, readonly string[]>>
	>;
	/** Direction postfix aliases (e.g. { past: ["ago", "назад", "以前"], future: ["from now", "plus tard", "后", "後"] }) */
	readonly directionPostfixes?: Readonly<
		Partial<Record<RelativeDirection, readonly string[]>>
	>;
	/** Unit aliases for relative time (e.g. { hour: ["hour", "hours", "h", "heures", "часа", "小时"], day: ["day", "days", "d", "jours", "дня", "天"], week: ["week", "weeks", "semaines", "недели", "周"] }) */
	readonly unitAliases?: Readonly<
		Record<RelativeTemporalUnit | string, readonly string[]>
	>;
	/** Part-of-day configuration */
	readonly partOfDayConfig?: PartOfDayConfig;
	/** Calendar window configuration */
	readonly calendarConfig?: CalendarWindowConfig;
	readonly locales?: string | readonly string[];
}

/**
 * Parses free text into a structured RelativeTemporalSlot using discrete pattern variants
 * (shorthand definitions/dictionary, prefix offset, postfix offset, part-of-day/calendar window).
 * Does NOT inject hardcoded English assumptions.
 */
export function parseRelativeTemporal(
	input: string,
	config: RelativeTemporalConfig = {},
): RelativeTemporalSlot | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;

	// Variant 1a: Direct RelativeTemporalDefinition matching
	if (config.relativeDefinitions) {
		const lower = trimmed.toLocaleLowerCase(config.locales as string);
		for (const def of config.relativeDefinitions) {
			for (const alias of def.aliases) {
				if (alias.toLocaleLowerCase(config.locales as string) === lower) {
					return {
						direction: def.direction,
						amount: def.amount,
						unit: def.unit,
						...(def.specificQualifier
							? { specificQualifier: def.specificQualifier }
							: {}),
					};
				}
			}
		}
	}

	// Variant 1b: Key-based relativeSlots & relativeTemporalAliases dictionary match
	if (config.relativeTemporalAliases) {
		const sorted = flattenAndSortAliases(config.relativeTemporalAliases, true);
		const lower = trimmed.toLocaleLowerCase(config.locales as string);
		for (const { key, alias } of sorted) {
			if (alias.toLocaleLowerCase(config.locales as string) === lower) {
				if (config.relativeSlots && config.relativeSlots[key]) {
					return config.relativeSlots[key];
				}
				// Support self-describing structured key conventions: e.g. "past_1_day", "future_2_week", "current_0_day"
				if (
					key.startsWith("past_") ||
					key.startsWith("future_") ||
					key.startsWith("current_")
				) {
					const parts = key.split("_");
					const dir = parts[0] as RelativeDirection;
					const amt = Number(parts[1]) || 0;
					const u = (parts[2] as RelativeTemporalUnit) || "day";
					return { direction: dir, amount: amt, unit: u };
				}
				return {
					direction: "current",
					amount: 0,
					unit: "day",
					specificQualifier: key,
				};
			}
		}
	}

	// Variant 2: Prefix Offset (e.g. "il y a 2 heures", "in 3 days", "vor 2 Stunden", "dans 15 minutes")
	if (config.directionPrefixes) {
		const sortedDirs = flattenAndSortAliases(config.directionPrefixes, true);
		const dirMatch = extractPrefixAlias(trimmed, sortedDirs, config.locales);
		if (dirMatch) {
			const dir = dirMatch.key as RelativeDirection;
			const rest = dirMatch.remainderText;
			if (config.unitAliases) {
				const sortedUnits = flattenAndSortAliases(config.unitAliases, true);
				const unitMatch = extractPostfixAlias(
					rest,
					sortedUnits,
					config.locales,
				);
				if (unitMatch) {
					const numRes = parseNumericValue(unitMatch.remainderText, {
						...config.numericConfig,
					});
					if (numRes.parsed) {
						return {
							direction: dir,
							amount: numRes.parsed.value,
							unit: unitMatch.key as RelativeTemporalUnit,
						};
					}
				}
			}
		}
	}

	// Variant 3: Postfix Offset (e.g. "2 hours ago", "3 days from now", "2 часа назад", "3天后", "2 heures plus tard")
	if (config.directionPostfixes) {
		const sortedDirs = flattenAndSortAliases(config.directionPostfixes, true);
		const dirMatch = extractPostfixAlias(trimmed, sortedDirs, config.locales);
		if (dirMatch) {
			const dir = dirMatch.key as RelativeDirection;
			const rest = dirMatch.remainderText;
			if (config.unitAliases) {
				const sortedUnits = flattenAndSortAliases(config.unitAliases, true);
				const unitMatch = extractPostfixAlias(
					rest,
					sortedUnits,
					config.locales,
				);
				if (unitMatch) {
					const numRes = parseNumericValue(unitMatch.remainderText, {
						...config.numericConfig,
					});
					if (numRes.parsed) {
						return {
							direction: dir,
							amount: numRes.parsed.value,
							unit: unitMatch.key as RelativeTemporalUnit,
						};
					}
				}
			}
		}
	}

	// Variant 4: Calendar / Season / Quarter Window Match (e.g. "summer in 2026", "Q2 2026", "2020s")
	if (config.calendarConfig) {
		// Seasons
		if (config.calendarConfig.seasonAliases) {
			const sortedSeasons = flattenAndSortAliases(
				config.calendarConfig.seasonAliases,
				true,
			);
			for (const { key, alias } of sortedSeasons) {
				const regex = getCompiledRegex(
					`^${escapeRegex(alias)}(?:\\s*(?:in\\s+)?(?<year>\\d{4}))?$`,
					"iu",
				);
				const m = trimmed.match(regex);
				if (m) {
					const refYear = m.groups?.year ? Number(m.groups.year) : undefined;
					return {
						direction: "current",
						amount: 0,
						unit: "season",
						specificQualifier: key,
						...(refYear ? { referenceYear: refYear } : {}),
					};
				}
			}
		}
		// Quarters
		if (config.calendarConfig.quarterAliases) {
			const sortedQuarters = flattenAndSortAliases(
				config.calendarConfig.quarterAliases,
				true,
			);
			for (const { key, alias } of sortedQuarters) {
				const regex = getCompiledRegex(
					`^${escapeRegex(alias)}(?:\\s*(?:in\\s+)?(?<year>\\d{4}))?$`,
					"iu",
				);
				const m = trimmed.match(regex);
				if (m) {
					const refYear = m.groups?.year ? Number(m.groups.year) : undefined;
					return {
						direction: "current",
						amount: 0,
						unit: "quarter",
						specificQualifier: key,
						...(refYear ? { referenceYear: refYear } : {}),
					};
				}
			}
		}
	}

	// Variant 5: Part of Day Match (e.g. "morning", "evening", "matin", "soir")
	if (config.partOfDayConfig?.aliases) {
		const sortedParts = flattenAndSortAliases(
			config.partOfDayConfig.aliases,
			true,
		);
		for (const { key, alias } of sortedParts) {
			if (
				alias.toLocaleLowerCase(config.locales as string) ===
				trimmed.toLocaleLowerCase(config.locales as string)
			) {
				return {
					direction: "current",
					amount: 0,
					unit: "day",
					specificQualifier: key,
				};
			}
		}
	}

	return undefined;
}
