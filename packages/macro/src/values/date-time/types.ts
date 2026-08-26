import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { BaseValueGrammarConfig } from "../numeric";
import type {
	DateTimeToken,
	RelativeTimeToken,
	ValueFormatConfig,
} from "../token-spec";

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
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
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
				messageKey: "errors.dateTimeDuplicateId",
				messageParams: { id: definition.id },
				formatId: definition.id,
			});
		seen.add(definition.id);
		const inferred = new Set(fieldsForDateTimeTokens(definition.tokens));
		if ((definition.fields ?? []).some((field) => !inferred.has(field)))
			diagnostics.push({
				code: "field-mismatch",
				messageKey: "errors.dateTimeFieldMismatch",
				messageParams: { id: definition.id },
				formatId: definition.id,
			});
		seen.add(definition.id);
	}
	for (const kind of ["date", "time", "datetime"] as const) {
		for (const id of registry.parse[kind] ?? []) {
			const definition = registry.formats[id];
			if (!definition)
				diagnostics.push({
					code: "missing-reference",
					messageKey: "errors.dateTimeMissingReference",
					messageParams: { id },
					formatId: id,
				});
			else if (definition.kind !== kind)
				diagnostics.push({
					code: "kind-mismatch",
					messageKey: "errors.dateTimeKindMismatch",
					messageParams: { id, kind: definition.kind, expected: kind },
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

export interface DateTimeCompositionOptions {
	/** Order of composition (default: "date-first") */
	readonly order?: "date-first" | "time-first" | "both";
	/** Connectors/separators between date and time (default: [" ", "T"]) */
	readonly separators?: readonly string[];
	/** List of combined format strings to exclude/disable */
	readonly disabledCombinations?: readonly string[];
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

export type TemporalModifierKind = "previous" | "next" | "current";

export interface RelativeDisambiguationPolicy {
	/** How to resolve 'next <weekday>' when anchor is before that weekday in current week (default: 'upcoming') */
	readonly nextWeekdayPolicy?: "upcoming" | "following_week";
	/** How to resolve 'last <weekday>' when anchor is on that same weekday (default: 'previous_occurrence') */
	readonly sameDayPolicy?: "same_day" | "previous_occurrence";
	/** First day of week (0 = Sunday, 1 = Monday, etc., default: 0) */
	readonly firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

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
	/** Temporal modifiers (e.g. { previous: ["last", "past", "上", "上一"], next: ["next", "下", "下一"], current: ["this", "本", "今"] }) */
	readonly temporalModifiers?: Readonly<
		Partial<Record<TemporalModifierKind, readonly string[]>>
	>;
	/** Month aliases (e.g. { "1": ["january", "jan", "一月"], ... "12": ["december", "dec", "十二月"] }) */
	readonly monthAliases?: Readonly<Record<string, readonly string[]>>;
	/** Weekday aliases (e.g. { "0": ["sunday", "sun", "周日"], "1": ["monday", "mon", "周一"], ... "6": ["saturday", "sat", "周六"] }) */
	readonly weekdayAliases?: Readonly<Record<string, readonly string[]>>;
	/** Disambiguation policies for weekdays and calendar targets */
	readonly disambiguationPolicy?: RelativeDisambiguationPolicy;
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
