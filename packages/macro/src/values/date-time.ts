import { getCompiledRegex } from "./regex";

export type DateTimeToken =
	| "YYYY"
	| "YY"
	| "MM"
	| "MM_name"
	| "DD"
	| "HH"
	| "min"
	| "SS"
	| "ampm"
	| "tz";

export type DateTimeValueKind = "date" | "time" | "datetime";
export type DateTimeField =
	| "year"
	| "month"
	| "day"
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
		["year", "month", "day"].includes(field),
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
		.sort(
			(a, b) =>
				(a.parserPriority ?? Number.MAX_SAFE_INTEGER) -
				(b.parserPriority ?? Number.MAX_SAFE_INTEGER),
		);
}

export interface DateTimeDisplayValue {
	readonly year: number;
	readonly month: number;
	readonly day: number;
}

export function formatDateTimeValue(
	value: Date | DateTimeDisplayValue,
	config: DateTimeFormatConfig,
): string {
	const date =
		value instanceof Date
			? value
			: new Date(value.year, value.month - 1, value.day);
	const options = config.options;
	const zonedParts = new Intl.DateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
		timeZone: options?.timeZone,
	})
		.formatToParts(date)
		.reduce<Record<string, string>>((result, part) => {
			if (part.type !== "literal") result[part.type] = part.value;
			return result;
		}, {});
	const fields: Record<DateTimeToken, string> = {
		YYYY: zonedParts.year ?? String(date.getFullYear()).padStart(4, "0"),
		YY: (zonedParts.year ?? String(date.getFullYear())).slice(-2),
		MM: zonedParts.month ?? String(date.getMonth() + 1).padStart(2, "0"),
		MM_name:
			options?.monthNames?.[date.getMonth()] ??
			new Intl.DateTimeFormat(options?.locale, {
				month: "long",
				timeZone: options?.timeZone,
			}).format(date),
		DD: zonedParts.day ?? String(date.getDate()).padStart(2, "0"),
		HH: zonedParts.hour ?? String(date.getHours()).padStart(2, "0"),
		min: zonedParts.minute ?? String(date.getMinutes()).padStart(2, "0"),
		SS: zonedParts.second ?? String(date.getSeconds()).padStart(2, "0"),
		ampm:
			Number(zonedParts.hour ?? date.getHours()) >= 12
				? (options?.dayPeriods?.pm?.[0] ?? "PM")
				: (options?.dayPeriods?.am?.[0] ?? "AM"),
		tz: options?.timeZone ?? "",
	};
	return config.tokens
		.map(
			(token, index) =>
				`${index === 0 ? "" : (config.separators[index - 1] ?? "")}${fields[token]}`,
		)
		.join("");
}

export function resolveTwoDigitYear(
	rawYear: number | string,
	config?: TwoDigitYearCenturyConfig,
): number {
	const numeric = typeof rawYear === "string" ? parseInt(rawYear, 10) : rawYear;
	if (Number.isNaN(numeric)) return NaN;
	if (numeric >= 100) return numeric;
	const pivot = config?.pivotYear ?? 50;
	const currentCentury = config?.currentCentury ?? 2000;
	const previousCentury = config?.previousCentury ?? 1900;
	return numeric <= pivot
		? currentCentury + numeric
		: previousCentury + numeric;
}

export interface DatePatternResult {
	pattern: string;
	groupNames: string[];
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
	const boundaryStart = exact ? "^" : "(?<![\\p{L}\\p{N}])";
	const boundaryEnd = exact ? "$" : "(?![\\p{L}\\p{N}])";
	return {
		pattern: `${boundaryStart}${assembled}${boundaryEnd}`,
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
